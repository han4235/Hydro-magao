"""材料经 markdownify 转 Markdown，再经 one-api 整理成 work_* 题包。"""
import asyncio
import json
import re
import secrets
from functools import lru_cache, partial
from pathlib import Path

from app.kinds import require_kind
from app.markdownify import file_to_markdown, text_to_markdown, url_to_markdown
from app.ojimport_spec import (
    SPEC_ROOT,
    normalize_tags,
    pick_titles,
    single_llm_system,
    spec_version,
    theory_llm_system,
)
from app.testdata_run import (
    build_testdata_config,
    finalize_mkin_h,
    init_question_skeleton,
    normalize_total_cases,
    run_testdata_pipeline,
)
from app.skills.base import Skill, SkillContext, SkillResult

PID_RE = re.compile(r'^(?:[a-z0-9]{1,10}-)?[a-z][0-9a-z]*$', re.I)
TEXT_LIMIT = 60000
LETTERS = 'ABCDEF'
# 模型输出校验不过时回抛让它补齐的轮数上限（含首轮）
MAX_FIX_ROUNDS = 3
# 题面出现「测试点」即认为题面写了测试点划分（如洛谷的「测试点编号」表），
# 此时模型必须给出 total_cases 与 subtasks，不许回落默认 25 组
TESTPOINT_RE = re.compile(r'测试点')
# 题面写明的测试点总数：「共 10 个测试点」「测试点总数 10」
PINNED_CASES_RE = re.compile(r'(\d+)\s*个\s*测试点|测试点(?:总数|共)\s*(\d+)')
_REPAIR_PROMPT = """你上一版输出没有通过校验，问题如下：

{issues}

这几处是算术或漏项失误，不是理解问题。请只输出修正后的完整 JSON（结构与要求同前，不要解释、不要 markdown 代码围栏）。
按下面几步自查过再输出：
1. 题面写了测试点划分（含「测试点编号」表）：`total_cases` 填题面写明的组数，`subtasks` 与之逐点对应，
   覆盖 1~total_cases 不重不漏；**不许**省略成默认 25 组；
2. 分值合计必须**恰好** 100：题面写了各点分值的照抄；题面只给测试点、没给分值，就按测试点个数均分
   —— 单点分 = 100 / total_cases，某组的分 = 该组测试点数 × 单点分，除不尽的余数加到最后一个 subtask；
3. 输出前把每个 subtask 的分逐个相加，确认结果正好是 100（不是 90、不是 82）；
4. 样例（题面未内联时按题面约束自造最小样例）、`std_cpp`、`mkin_h` 一个都不能少，
   `mkin_h` 的 `void test()` 分支要与 `subtasks`、`total_cases` 一一对应。"""
# OJ 难度档位：索引 1~7 对应题目编辑页的难度按钮
DIFFICULTY_LEVELS = ['入门', '普及−', '普及/提高−', '普及+/提高', '提高+/省选−', '省选/NOI−', 'NOI/NOI+/CTSC']
# 理论卷难度：按 GESP 级别取库内既有值，全库同级别统一
THEORY_DIFFICULTY = {1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4}
THEORY_CN = '一二三四五六七八'
THEORY_TITLE_RE = re.compile(r'^GESP.*[一二三四五六七八]级客观题')
THEORY_YM_RE = re.compile(r'(20\d{2})\s*年\s*(\d{1,2})\s*月')

class PdfToPacks(Skill):
    name = 'pdf_to_problem_packs'
    accepts = []

    async def run(self, ctx: SkillContext, input_path: Path) -> SkillResult:
        try:
            kind = require_kind(str(ctx.options.get('kind') or ''))
        except ValueError as e:
            return SkillResult(errors=[str(e)])
        source = str(ctx.options.get('source') or 'file').strip()
        logs = [f'生成类型: {kind}', f'来源: {source}']
        logs.append(f'规范 ojimport {spec_version()}')
        logs.append(f'step00: 输入类型 {source}')
        try:
            text, md_logs = await _to_markdown(ctx, input_path, source)
        except (ValueError, FileNotFoundError, RuntimeError) as e:
            return SkillResult(errors=[str(e)], logs=logs)
        logs.extend(md_logs)
        (ctx.work_root / 'extracted.md').write_text(text, encoding='utf-8')
        logs.append('step02: 已写入 extracted.md')
        if not text.strip():
            return SkillResult(errors=['markdownify 未能抽出可用正文。'], logs=logs)
        if len(text) > TEXT_LIMIT:
            text = text[:TEXT_LIMIT]
            logs.append(f'正文超过 {TEXT_LIMIT} 字，已截断后再交给模型')
        if ctx.llm is None or not ctx.llm.configured():
            return SkillResult(errors=['未配置 one-api'], logs=logs)
        system = single_llm_system() if kind == 'single' else theory_llm_system()
        # 预检要按题面判断「该不该有测试点划分」，故把题面正文带上
        precheck = partial(_single_issues, text=text) if kind == 'single' else _no_issues
        try:
            data, error = await _chat_until_valid(ctx, system, text, precheck, logs)
        except Exception as e:
            return SkillResult(errors=[f'模型调用失败: {e}'], logs=logs)
        if error:
            return SkillResult(errors=[error], logs=logs)
        try:
            if kind == 'single':
                return _single_packs(ctx.work_root, data, logs)
            return _theory_pack(ctx.work_root, data, logs)
        except ValueError as e:
            return SkillResult(errors=[str(e)], logs=logs)


def _missing_testpoints(text: str, item: dict) -> list[str]:
    """题面写了测试点划分，模型却想走默认 25 组 → 要求它补齐，别静默降级。"""
    if not TESTPOINT_RE.search(text or ''):
        return []
    issues: list[str] = []
    match = PINNED_CASES_RE.search(text or '')
    want = (match.group(1) or match.group(2)) if match else ''
    if item.get('total_cases') in (None, ''):
        issues.append(
            '题面有测试点划分'
            + (f'（共 {want} 个测试点）' if want else '')
            + '：必须给出 total_cases，不能省略成默认 25 组'
        )
    if not item.get('subtasks'):
        issues.append('题面有测试点划分：必须给出 subtasks（每组分值与覆盖的测试点编号），不能省略成默认分组')
    return issues


def _single_issues(data: dict, text: str = '') -> list[str]:
    """单题包的预检：把每道题的问题收成一份清单，回抛给模型补齐。"""
    problems = data.get('problems')
    if not isinstance(problems, list) or not problems:
        # 抽不出题目多半是 extraction 的问题，催模型「必须抽出来」反而会逼它编。留给 _single_packs 报原有错误。
        return []
    issues: list[str] = []
    for i, item in enumerate(problems, 1):
        if isinstance(item, dict):
            issues.extend(f'第 {i} 题: {issue}' for issue in _missing_testpoints(text, item))
        _, item_issues = _normalize_single_item(item)
        issues.extend(f'第 {i} 题: {issue}' for issue in item_issues)
    return issues


def _no_issues(data: dict) -> list[str]:
    """不预检的占位（理论卷等只管 JSON 能不能解析）。"""
    return []


async def _chat_until_valid(
    ctx: SkillContext,
    system: str,
    user_text: str,
    precheck,
    logs: list[str],
) -> tuple[dict | None, str]:
    """调模型 → 本地预检 → 没过就把问题回抛让它补齐，最多 MAX_FIX_ROUNDS 轮。

    返回 (data, error)；error 非空表示轮次用尽仍有问题（此时不降级、不猜，直接失败）。
    """
    messages = [
        {'role': 'system', 'content': system},
        {'role': 'user', 'content': user_text},
    ]
    issues: list[str] = []
    for attempt in range(1, MAX_FIX_ROUNDS + 1):
        raw = await asyncio.to_thread(ctx.llm.chat, messages)
        name = 'llm_response.txt' if attempt == 1 else f'llm_response.{attempt}.txt'
        (ctx.work_root / name).write_text(raw, encoding='utf-8')
        try:
            data = _load_json(raw)
        except ValueError as e:
            issues = [str(e)]
        else:
            issues = precheck(data)
        if not issues:
            if attempt > 1:
                logs.append(f'第 {attempt} 轮输出通过校验，采用 {name}')
            return data, ''
        logs.append(f'第 {attempt}/{MAX_FIX_ROUNDS} 轮校验未过，已要求模型补齐: ' + '；'.join(issues))
        if attempt == MAX_FIX_ROUNDS:
            break
        messages.append({'role': 'assistant', 'content': raw})
        messages.append({
            'role': 'user',
            'content': _REPAIR_PROMPT.format(issues='\n'.join(f'- {i}' for i in issues)),
        })
    return None, f'模型 {MAX_FIX_ROUNDS} 轮输出均不符合要求: ' + '；'.join(issues)


async def _to_markdown(ctx: SkillContext, input_path: Path, source: str) -> tuple[str, list[str]]:
    if source == 'url':
        url = str(ctx.options.get('url') or '').strip()
        if not url and input_path.is_file():
            url = input_path.read_text(encoding='utf-8').strip()
        cookie = str(ctx.options.get('fetch_cookie') or '').strip()
        return await asyncio.to_thread(url_to_markdown, url, cookie)
    if source == 'text':
        body = str(ctx.options.get('text') or '')
        if not body.strip() and input_path.is_file():
            body = input_path.read_text(encoding='utf-8')
        return await asyncio.to_thread(text_to_markdown, body)
    return await asyncio.to_thread(file_to_markdown, input_path)


def _load_json(raw: str) -> dict:
    body = raw.strip()
    if body.startswith('```'):
        body = re.sub(r'^```(?:json)?\s*', '', body)
        body = re.sub(r'\s*```$', '', body)
    start, end = body.find('{'), body.rfind('}')
    if start < 0 or end <= start:
        raise ValueError('模型没有返回 JSON')
    try:
        data = json.loads(body[start:end + 1])
    except json.JSONDecodeError as e:
        raise ValueError(f'JSON 无法解析: {e}') from e
    if not isinstance(data, dict):
        raise ValueError('JSON 根不是对象')
    return data


def _single_packs(root: Path, data: dict, logs: list[str]) -> SkillResult:
    problems = data.get('problems')
    if not isinstance(problems, list) or not problems:
        raise ValueError(
            '模型没有从题面里抽出编程题。常见原因：extracted.md 的题目描述残缺（抓取被拦或不是题目页），'
            '或题面信息不足以定考点。请先核对 extracted.md。'
        )
    works = []
    errors = []
    used = set()
    for i, item in enumerate(problems, 1):
        try:
            work = _write_single(root, item, used, logs)
        except ValueError as e:
            errors.append(f'第 {i} 题: {e}')
            continue
        works.append(work)
        logs.append(f'已生成 {work.name}')
    if not works:
        errors.append('没有生成题包')
    return SkillResult(work_dirs=works, logs=logs, errors=errors)


def _normalize_single_item(item) -> tuple[dict, list[str]]:
    """校验一道题并抽出写盘所需字段，把该让模型改的问题一次收齐。

    只校验与取值，不碰磁盘：既供 _write_single 用，也在调模型的重试里当预检，
    把「哪里没按要求」整份回抛给模型补齐（见 MAX_FIX_ROUNDS）。
    返回 (规范化字段, 问题清单)；有问题时字段为空 dict。
    """
    if not isinstance(item, dict):
        return {}, ['题目不是对象']
    issues: list[str] = []
    yaml_title, heading = pick_titles(item)
    gesp_level = item.get('gesp_level')
    if isinstance(gesp_level, str) and gesp_level.isdigit():
        gesp_level = int(gesp_level)
    if not isinstance(gesp_level, int) or not 1 <= gesp_level <= 8:
        gesp_level = None
    description = str(item.get('description') or '').strip()
    if not description:
        issues.append('题目描述为空')
    samples = item.get('samples')
    clean: list[tuple[str, str, str]] = []
    if not isinstance(samples, list) or not samples:
        issues.append('题目缺少样例：题面未内联样例数据时应由模型自造一组最小样例')
    else:
        for n, sample in enumerate(samples, 1):
            if not isinstance(sample, dict):
                issues.append(f'第 {n} 组样例格式不对')
                continue
            inp = _nl(sample.get('input'))
            out = _nl(sample.get('output'))
            if inp.strip() == '' or out.strip() == '':
                issues.append(f'第 {n} 组样例输入或输出为空')
                continue
            clean.append((inp, out, str(sample.get('explanation') or '').strip()))
    tags: list[str] = []
    try:
        tags = normalize_tags(item.get('tags') if isinstance(item.get('tags'), list) else [], gesp_level)
    except ValueError as e:
        issues.append(str(e))
    std_cpp = str(item.get('std_cpp') or '').strip()
    if not std_cpp:
        issues.append('缺少 std_cpp（step06）')
    mkin_h = str(item.get('mkin_h') or '').strip()
    if not mkin_h or 'void test(' not in mkin_h:
        issues.append('缺少完整 mkin.h（step07）')
    total_cases = 0
    try:
        total_cases = normalize_total_cases(item.get('total_cases'))
    except ValueError as e:
        issues.append(str(e))
    else:
        if mkin_h and 'void test(' in mkin_h:
            try:
                finalize_mkin_h(mkin_h, total_cases)
            except (ValueError, RuntimeError) as e:
                issues.append(str(e))
        try:
            build_testdata_config(item.get('subtasks'), total_cases)
        except ValueError as e:
            issues.append(str(e))
    if issues:
        return {}, issues
    return {
        'yaml_title': yaml_title,
        'heading': heading,
        'description': description,
        'clean': clean,
        'tags': tags,
        'std_cpp': std_cpp,
        'mkin_h': mkin_h,
        'total_cases': total_cases,
    }, []


def _write_single(root: Path, item: dict, used: set[str], logs: list[str]) -> Path:
    norm, issues = _normalize_single_item(item)
    if issues:
        raise ValueError('；'.join(issues))
    yaml_title, heading = norm['yaml_title'], norm['heading']
    description = norm['description']
    clean = norm['clean']
    tags = norm['tags']
    std_cpp = norm['std_cpp']
    mkin_h = norm['mkin_h']
    pid = _pid('aip', used)
    work = root / f'work_{pid}_pdf'
    work.mkdir(parents=True)
    init_question_skeleton(work, logs)
    difficulty = _difficulty(item)
    extra = f'difficulty: {difficulty}\n'
    _write_yaml(work / 'problem.yaml', pid, yaml_title, tags, extra=extra)
    blocks = ['<div class="water">', '', f'# {heading}', '', '#### 题目描述', description, '']
    for label, key in (('输入格式', 'input_format'), ('输出格式', 'output_format')):
        text = str(item.get(key) or '').strip()
        if text:
            blocks.extend([f'#### {label}', text, ''])
    for n, (inp, out, explanation) in enumerate(clean, 1):
        blocks.extend([f'#### 样例输入 #{n}', '```', inp.rstrip('\n'), '```', '', f'#### 样例输出 #{n}', '```', out.rstrip('\n'), '```', ''])
        if explanation:
            blocks.extend([f'#### 样例解释 #{n}', explanation, ''])
    hint = str(item.get('hint') or '').strip()
    constraints = str(item.get('constraints') or '').strip()
    if hint:
        blocks.extend(['#### 说明/提示', hint, ''])
    if constraints:
        blocks.extend(['#### 数据范围', constraints, ''])
    blocks.append('</div>')
    if difficulty:
        blocks.extend(['', f'难度：{DIFFICULTY_LEVELS[difficulty - 1]}', ''])
    (work / 'problem_zh.md').write_text('\n'.join(blocks) + '\n', encoding='utf-8')
    logs.append('step03-05: 已写 problem.yaml / problem_zh.md')
    (work / 'std.cpp').write_text(std_cpp if std_cpp.endswith('\n') else std_cpp + '\n', encoding='utf-8')
    logs.append('step06: 已写 std.cpp')
    total_cases = norm['total_cases']
    (work / 'mkin.h').write_text(finalize_mkin_h(mkin_h, total_cases), encoding='utf-8')
    try:
        run_testdata_pipeline(work, logs, total_cases, item.get('subtasks'))
    except (RuntimeError, ValueError) as e:
        raise ValueError(str(e)) from e
    logs.append('step08: 题包就绪，待打包导入')
    return work


def _theory_pack(root: Path, data: dict, logs: list[str]) -> SkillResult:
    title = str(data.get('title') or '').strip()
    sections = data.get('sections')
    if not title:
        raise ValueError('试卷标题为空')
    if not isinstance(sections, list) or not sections:
        raise ValueError('模型没有从 PDF 里抽出理论题')
    lines = [f'# {title}', '']
    answers = []
    number = 0
    judge_options = _theory_judge_option_lines()
    for section in sections:
        if not isinstance(section, dict):
            raise ValueError('试卷章节不是对象')
        kind = str(section.get('type') or '').strip()
        heading = str(section.get('title') or '').strip() or ('选择题' if kind == 'choice' else '判断题')
        questions = section.get('questions')
        if kind not in ('choice', 'judge'):
            raise ValueError(f'未知题型 {kind}')
        if not isinstance(questions, list) or not questions:
            raise ValueError(f'{heading} 没有题目')
        lines.append(f'## {heading}')
        lines.append('')
        for qn, question in enumerate(questions, 1):
            if not isinstance(question, dict):
                raise ValueError('题目不是对象')
            stem = str(question.get('stem') or '').strip()
            if not stem:
                raise ValueError('题干为空')
            number += 1
            lines.append(f'第{qn}题 {stem}')
            lines.append('')
            lines.append(f'{{{{ select({number}) }}}}')
            lines.append('')
            if kind == 'choice':
                options = question.get('options')
                if not isinstance(options, list) or not 2 <= len(options) <= 6:
                    raise ValueError(f'第 {number} 题选项数量不对')
                letter = str(question.get('answer') or '').strip().upper()
                if letter not in LETTERS[:len(options)]:
                    raise ValueError(f'第 {number} 题答案不是合法选项')
                for option in options:
                    lines.append(f'+  `{str(option).strip()}`')
                answers.append((number, letter))
            else:
                letter = str(question.get('answer') or '').strip().upper()
                if letter not in ('A', 'B'):
                    raise ValueError(f'第 {number} 题判断答案必须是 A 或 B')
                lines.extend(judge_options)
                answers.append((number, letter))
            lines.append('')
    if not answers:
        raise ValueError('没有可评分的题目')
    tags = _tags(data.get('tags'), '理论')
    title = _theory_title(title, tags, logs)
    difficulty = THEORY_DIFFICULTY.get(_theory_level(tags), 0)
    pid = _pid('ait', set())
    work = root / f'work_{pid}_theory'
    td = work / 'testdata'
    td.mkdir(parents=True)
    _write_theory_problem_yaml(work / 'problem.yaml', pid, title, tags, difficulty)
    (work / 'problem_zh.md').write_text('\n'.join(lines).rstrip() + '\n', encoding='utf-8')
    _write_theory_config(td / 'config.yaml', answers)
    logs.append(f'理论卷: 已按 theory/template 落盘 {work.name}，共 {len(answers)} 题')
    return SkillResult(work_dirs=[work], logs=logs)


def _theory_level(tags: list[str]) -> int:
    """从 `GESP{级别}理论` 标签取级别 1~8，取不到返回 0。"""
    for tag in tags:
        found = re.search(r'GESP\s*([一二三四五六七八])\s*级', str(tag))
        if found:
            return THEORY_CN.index(found.group(1)) + 1
    return 0


def _theory_title(title: str, tags: list[str], logs: list[str]) -> str:
    """把标题收敛成库内风格 `GESP{年月}{级别}客观题`，拼不出年份月份时原样保留。"""
    if THEORY_TITLE_RE.match(title):
        return title
    level = _theory_level(tags)
    ym = THEORY_YM_RE.search(title)
    if not level or not ym:
        logs.append(f'理论卷标题「{title}」不是 GESP年月级别客观题 风格，已原样保留，请人工核对')
        return title
    tail = '客观题模拟题' if '模拟' in title else '客观题'
    suffix = ''
    if tail.endswith('模拟题'):
        paren = re.search(r'（[^）]*）', title)
        suffix = paren.group(0) if paren else ''
    return f'GESP{ym.group(1)}{int(ym.group(2)):02d}{THEORY_CN[level - 1]}级{tail}{suffix}'


@lru_cache(maxsize=1)
def _theory_judge_option_lines() -> list[str]:
    md = (SPEC_ROOT / 'theory/template/problem_zh.md').read_text(encoding='utf-8')
    part = md
    for marker in ('## 二、判断题', '判断题'):
        pos = md.find(marker)
        if pos >= 0:
            part = md[pos:]
            break
    out: list[str] = []
    for line in part.splitlines():
        if line in ('+  `true`', '+  `false`'):
            out.append(line)
            if len(out) == 2:
                break
    if len(out) != 2:
        raise RuntimeError('theory/template/problem_zh.md 缺少判断题选项行')
    return out


def _write_theory_problem_yaml(path: Path, pid: str, title: str, tags: list[str], difficulty: int = 0) -> None:
    tpl_lines = (SPEC_ROOT / 'theory/template/problem.yaml').read_text(encoding='utf-8').splitlines()
    out: list[str] = []
    skip_tag_items = False
    for line in tpl_lines:
        if skip_tag_items:
            if line.strip().startswith('-'):
                continue
            skip_tag_items = False
        if line.startswith('pid:'):
            out.append(f'pid: {pid}')
        elif line.startswith('title:'):
            out.append(f'title: {_yaml(title)}')
        elif line.startswith('tag:'):
            out.append('tag:')
            for t in tags:
                out.append(f'  - {_yaml(t)}')
            if difficulty:
                out.append(f'difficulty: {difficulty}')
            skip_tag_items = True
        else:
            out.append(line)
    path.write_text('\n'.join(out) + '\n', encoding='utf-8')


def _write_theory_config(path: Path, answers: list[tuple[int, str]]) -> None:
    tpl_lines = (SPEC_ROOT / 'theory/template/testdata/config.yaml').read_text(encoding='utf-8').splitlines()
    head: list[str] = []
    for line in tpl_lines:
        head.append(line)
        if line.strip() == 'answers:':
            break
    body = list(head)
    for number, answer in answers:
        body.append(f"  '{number}':")
        body.append(f'    - {answer}')
        body.append('    - 2')
    path.write_text('\n'.join(body) + '\n', encoding='utf-8')


def _tags(value, fallback: str) -> list[str]:
    tags = value if isinstance(value, list) else []
    tags = [str(t).strip() for t in tags if str(t).strip()][:5]
    return tags or [fallback]


def _pid(prefix: str, used: set[str]) -> str:
    pid = prefix + secrets.token_hex(3)
    while pid in used or not PID_RE.match(pid):
        pid = prefix + secrets.token_hex(3)
    used.add(pid)
    return pid


def _nl(value) -> str:
    text = '' if value is None else str(value)
    return text if text.endswith('\n') else text + '\n'


def _difficulty(item: dict) -> int:
    """取 OJ 难度档位：1~7 有效，其余（含 0/缺省）视为不设定。"""
    level = item.get('difficulty')
    if isinstance(level, str) and level.isdigit():
        level = int(level)
    if not isinstance(level, int) or isinstance(level, bool) or not 1 <= level <= 7:
        return 0
    return level


def _write_yaml(path: Path, pid: str, title: str, tags: list[str], extra: str = '') -> None:
    tag_yaml = ''.join(f'  - {_yaml(t)}\n' for t in tags)
    path.write_text(f'pid: {pid}\ntitle: {_yaml(title)}\ntag:\n{tag_yaml}{extra}', encoding='utf-8')


def _yaml(text: str) -> str:
    return '"' + text.replace('\\', '\\\\').replace('"', '\\"') + '"'
