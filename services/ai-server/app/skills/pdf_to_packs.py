"""材料经 markdownify 转 Markdown，再经 one-api 整理成 work_* 题包。"""
import asyncio
import json
import re
import secrets
from functools import lru_cache
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
from app.testdata_run import finalize_mkin_h, init_question_skeleton, run_testdata_pipeline
from app.skills.base import Skill, SkillContext, SkillResult

PID_RE = re.compile(r'^(?:[a-z0-9]{1,10}-)?[a-z][0-9a-z]*$', re.I)
TEXT_LIMIT = 60000
LETTERS = 'ABCDEF'

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
        try:
            raw = await asyncio.to_thread(ctx.llm.chat, [
                {'role': 'system', 'content': system},
                {'role': 'user', 'content': text},
            ])
        except Exception as e:
            return SkillResult(errors=[f'模型调用失败: {e}'], logs=logs)
        (ctx.work_root / 'llm_response.txt').write_text(raw, encoding='utf-8')
        try:
            data = _load_json(raw)
            if kind == 'single':
                return _single_packs(ctx.work_root, data, logs)
            return _theory_pack(ctx.work_root, data, logs)
        except ValueError as e:
            return SkillResult(errors=[str(e)], logs=logs)


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
        raise ValueError('模型没有从 PDF 里抽出编程题')
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


def _write_single(root: Path, item: dict, used: set[str], logs: list[str]) -> Path:
    if not isinstance(item, dict):
        raise ValueError('题目不是对象')
    yaml_title, heading = pick_titles(item)
    gesp_level = item.get('gesp_level')
    if isinstance(gesp_level, str) and gesp_level.isdigit():
        gesp_level = int(gesp_level)
    if not isinstance(gesp_level, int) or not 1 <= gesp_level <= 8:
        gesp_level = None
    description = str(item.get('description') or '').strip()
    samples = item.get('samples')
    if not description:
        raise ValueError('题目描述为空')
    if not isinstance(samples, list) or not samples:
        raise ValueError('没有样例')
    clean = []
    for sample in samples:
        if not isinstance(sample, dict):
            raise ValueError('样例格式不对')
        inp = _nl(sample.get('input'))
        out = _nl(sample.get('output'))
        if inp.strip() == '' or out.strip() == '':
            raise ValueError('样例输入或输出为空')
        clean.append((inp, out, str(sample.get('explanation') or '').strip()))
    tags = normalize_tags(
        item.get('tags') if isinstance(item.get('tags'), list) else [],
        gesp_level,
    )
    std_cpp = str(item.get('std_cpp') or '').strip()
    mkin_h = str(item.get('mkin_h') or '').strip()
    if not std_cpp:
        raise ValueError('缺少 std_cpp（step06）')
    if not mkin_h or 'void test(' not in mkin_h:
        raise ValueError('缺少完整 mkin.h（step07）')
    pid = _pid('aip', used)
    work = root / f'work_{pid}_pdf'
    work.mkdir(parents=True)
    init_question_skeleton(work, logs)
    extra = ''
    if gesp_level:
        extra = f'difficulty: {gesp_level}\n'
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
    stars = item.get('difficulty_stars')
    if isinstance(stars, (int, float)) and 1 <= stars <= 5:
        blocks.extend(['', f'难度：{"⭐" * int(stars)}', ''])
    (work / 'problem_zh.md').write_text('\n'.join(blocks) + '\n', encoding='utf-8')
    logs.append('step03-05: 已写 problem.yaml / problem_zh.md')
    (work / 'std.cpp').write_text(std_cpp if std_cpp.endswith('\n') else std_cpp + '\n', encoding='utf-8')
    logs.append('step06: 已写 std.cpp')
    (work / 'mkin.h').write_text(finalize_mkin_h(mkin_h), encoding='utf-8')
    try:
        run_testdata_pipeline(work, logs)
    except RuntimeError as e:
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
    pid = _pid('ait', set())
    work = root / f'work_{pid}_theory'
    td = work / 'testdata'
    td.mkdir(parents=True)
    _write_theory_problem_yaml(work / 'problem.yaml', pid, title, tags)
    (work / 'problem_zh.md').write_text('\n'.join(lines).rstrip() + '\n', encoding='utf-8')
    _write_theory_config(td / 'config.yaml', answers)
    logs.append(f'理论卷: 已按 theory/template 落盘 {work.name}，共 {len(answers)} 题')
    return SkillResult(work_dirs=[work], logs=logs)


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


def _write_theory_problem_yaml(path: Path, pid: str, title: str, tags: list[str]) -> None:
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


def _write_yaml(path: Path, pid: str, title: str, tags: list[str], extra: str = '') -> None:
    tag_yaml = ''.join(f'  - {_yaml(t)}\n' for t in tags)
    path.write_text(f'pid: {pid}\ntitle: {_yaml(title)}\ntag:\n{tag_yaml}{extra}', encoding='utf-8')


def _yaml(text: str) -> str:
    return '"' + text.replace('\\', '\\\\').replace('"', '\\"') + '"'
