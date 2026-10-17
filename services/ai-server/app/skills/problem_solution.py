"""按 md-playwright-solution 流程生成单题题解：读题面 → 模型写题解 → 结构自检 → 交后端入库。"""
import asyncio
import re
from pathlib import Path

from app.hydro_problem import content_zh, load_problem
from app.skills.base import Skill, SkillContext, SkillResult
from app.solution_spec import solution_llm_system, spec_version

# 模型输出不合规时回抛让它补齐的轮数上限（含首轮）
MAX_FIX_ROUNDS = 3
# 题面过长时截断，题解本身不截
TEXT_LIMIT = 60000
# step 07 的「正文不少于 200 行」
MIN_LINES = 200

H2_REQUIRED = [
    '题目描述', '输入格式', '输出格式', '输入输出样例', '数据范围',
    '算法分析', '代码实现', '复杂度分析', '边界情况与易错点',
]
H3_REQUIRED = ['问题建模', '算法演进', '算法步骤', '时间复杂度', '空间复杂度']

_REPAIR_PROMPT = """你上一版题解没有通过结构校验，问题如下：

{issues}

请只输出修正后的完整题解 Markdown（首行 `# 题号 题名`），不要任何解释文字，也不要用代码围栏把整篇包起来。
已经写对的部分保留，只补缺的章节、把版本与档位编号对齐、把正文补足到 200 行以上。"""


def _strip_outer_fence(md: str) -> str:
    """模型偶尔把整篇题解塞进一个围栏里，剥掉外层那层。"""
    text = md.strip()
    m = re.match(r'^```[a-zA-Z]*\s*\n([\s\S]*?)\n```$', text)
    if not m:
        return text
    inner = m.group(1).strip()
    return inner if inner.startswith('# ') else text


def _code_blocks(md: str) -> list[str]:
    blocks: list[str] = []
    cur: list[str] | None = None
    for line in md.splitlines():
        if cur is None:
            if line.strip().startswith('```cpp'):
                cur = []
            continue
        if line.strip() == '```':
            blocks.append('\n'.join(cur))
            cur = None
        else:
            cur.append(line)
    if cur is not None:  # 收尾漏了围栏，也算一段，交给自检报出来
        blocks.append('\n'.join(cur))
    return blocks


def issues_of(md: str, pid: str) -> list[str]:
    """step 07 的机检部分：标题层级、版本/档位对齐、代码完整性、正文行数。"""
    issues: list[str] = []
    lines = md.splitlines()
    if not lines or not lines[0].startswith('# '):
        issues.append('首行须是 `# 题目编号 题目名称`')
    elif pid and pid not in lines[0]:
        issues.append(f'首行须含本题题号 `{pid}`')

    h2 = [line[3:].strip() for line in lines if line.startswith('## ')]
    lost = [t for t in H2_REQUIRED if not any(x.startswith(t) for x in h2)]
    if lost:
        issues.append('缺少二级标题: ' + '、'.join(f'## {t}' for t in lost))

    h3 = [line[4:].strip() for line in lines if line.startswith('### ')]
    lost = [t for t in H3_REQUIRED if not any(x.startswith(t) for x in h3)]
    if lost:
        issues.append('缺少三级标题: ' + '、'.join(f'### {t}' for t in lost))

    versions = sum(1 for line in lines if line.startswith('### 版本 '))
    stages = sum(1 for line in lines if line.startswith('#### 档位 '))
    if versions < 2:
        issues.append(f'`### 版本 k｜档位 k` 只有 {versions} 个，至少要 2 档')
    if versions != stages:
        issues.append(f'`### 版本 ` 有 {versions} 个、`#### 档位 ` 有 {stages} 个，两者须一一对应')

    blocks = _code_blocks(md)
    if len(blocks) < 2:
        issues.append(f'完整 cpp 代码只有 {len(blocks)} 段，至少要有暴力参照版与满分解')
    for i, block in enumerate(blocks, 1):
        if '#include' not in block:
            issues.append(f'第 {i} 段 cpp 缺 #include，不是完整程序')
        if 'int main' not in block:
            issues.append(f'第 {i} 段 cpp 缺 int main()，不是完整程序')

    if len(lines) < MIN_LINES:
        issues.append(f'正文 {len(lines)} 行，少于规范的 {MIN_LINES} 行')
    return issues


def _safe_name(pid: str, title: str) -> str:
    """step 09 的落盘命名：题目编号_题目名称.md（去掉文件系统不认的字符）。"""
    name = re.sub(r'[\\/:*?"<>|\s]+', '_', title).strip('_')
    return f'{pid}_{name or "solution"}.md'


def _user_prompt(pid: str, title: str, statement: str) -> str:
    return (
        f'题目编号：{pid}\n'
        f'题目名称：{title}\n'
        f'以下是本题题面（含输入输出格式、样例、数据范围），请据此写题解：\n\n'
        f'{statement[:TEXT_LIMIT]}'
    )


async def _chat_until_valid(
    ctx: SkillContext,
    system: str,
    user_text: str,
    pid: str,
    logs: list[str],
) -> tuple[str | None, str]:
    """调模型 → 结构自检 → 没过就把问题回抛让它补齐，最多 MAX_FIX_ROUNDS 轮。

    返回 (markdown, error)；error 非空表示轮次用尽仍不合格（不降级、不截断交付）。
    """
    messages = [
        {'role': 'system', 'content': system},
        {'role': 'user', 'content': user_text},
    ]
    issues: list[str] = []
    for attempt in range(1, MAX_FIX_ROUNDS + 1):
        raw = await asyncio.to_thread(ctx.llm.chat, messages)
        name = 'llm_response.md' if attempt == 1 else f'llm_response.{attempt}.md'
        (ctx.work_root / name).write_text(raw, encoding='utf-8')
        md = _strip_outer_fence(raw)
        issues = issues_of(md, pid)
        if not issues:
            if attempt > 1:
                logs.append(f'第 {attempt} 轮通过结构自检，采用 {name}')
            return md, ''
        logs.append(f'第 {attempt}/{MAX_FIX_ROUNDS} 轮结构自检未过: ' + '；'.join(issues))
        if attempt == MAX_FIX_ROUNDS:
            break
        messages.append({'role': 'assistant', 'content': raw})
        messages.append({
            'role': 'user',
            'content': _REPAIR_PROMPT.format(issues='\n'.join(f'- {i}' for i in issues)),
        })
    return None, f'模型 {MAX_FIX_ROUNDS} 轮输出均不合格: ' + '；'.join(issues)


class ProblemSolutionSkill(Skill):
    name = 'problem_solution'
    accepts = ['text/plain', 'application/octet-stream', '']

    async def run(self, ctx: SkillContext, input_path: Path) -> SkillResult:
        logs: list[str] = []
        domain_id = str(ctx.options.get('domain_id') or '').strip()
        doc_id = int(ctx.options.get('doc_id') or 0)
        if not domain_id or not doc_id:
            return SkillResult(errors=['缺少 domain_id 或 doc_id'])

        try:
            pdoc = load_problem(domain_id, doc_id)
        except (ValueError, RuntimeError) as e:
            return SkillResult(errors=[str(e)], logs=logs)
        title = str(pdoc.get('title') or f'#{doc_id}')
        pid = str(pdoc.get('pid') or doc_id)
        statement = content_zh(pdoc).strip()
        if not statement:
            return SkillResult(errors=['题面为空，无法生成题解'])

        logs.append(f'step01: 已载入题目 {domain_id}/{doc_id}《{title}》（{pid}）')
        logs.append(f'规范 solution {spec_version()}')
        (ctx.work_root / f'{pid}_problem.md').write_text(statement, encoding='utf-8')
        logs.append('step02: 题面已落盘，跳过网页抓取')

        llm = ctx.llm
        if not llm or not llm.configured():
            return SkillResult(errors=['未配置 LLM，无法按题解流程生成'], logs=logs)

        logs.append('step03~08: 调用模型按分档阶梯写题解（题面 / 分析 / 代码 / 复杂度）')
        try:
            md, error = await _chat_until_valid(
                ctx, solution_llm_system(), _user_prompt(pid, title, statement), pid, logs,
            )
        except Exception as e:
            return SkillResult(errors=[f'模型调用失败: {e}'], logs=logs)
        if error:
            return SkillResult(errors=[error], logs=logs)

        name = _safe_name(pid, title)
        (ctx.work_root / name).write_text(md.rstrip() + '\n', encoding='utf-8')
        lines = len(md.splitlines())
        stages = sum(1 for line in md.splitlines() if line.startswith('#### 档位 '))
        logs.append(f'step09: 题解 {lines} 行、{stages} 档已写入 {name}，待后端入库')
        payload = {
            'domainId': domain_id,
            'docId': doc_id,
            'pid': pid,
            'title': title,
            'content': md,
            'lines': lines,
            'stages': stages,
            'chars': len(md),
        }
        return SkillResult(logs=logs, payload=payload, work_dirs=[ctx.work_root])
