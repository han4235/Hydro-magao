"""搬题姬 Step 7：编译 mkdata/std，生成 testdata（组数按 total_cases，默认 25）。"""
import re
import shutil
import subprocess
from pathlib import Path

from app.ojimport_spec import SPEC_ROOT, full_testdata_config

DEFAULT_TOTAL_CASES = 25
TEST_CASES_RE = re.compile(r'const\s+int\s+TEST_CASES\s*=\s*\d+\s*;')
CONFIG_HEAD_RE = re.compile(r'^(?:type|time|memory):\s*\S')
CASE_RANGE_RE = re.compile(r'^(\d+)\s*[-~]\s*(\d+)$')
# mkin.h 合并时需剥掉的重复脚手架：模板已提供头文件保护、include、using 与 TEST_CASES
_MKIN_GUARD_OPEN_RE = re.compile(r'^\s*#\s*ifndef\s+MKIN_H\s*$')
_MKIN_GUARD_DEF_RE = re.compile(r'^\s*#\s*define\s+MKIN_H\s*$')
_PRAGMA_ONCE_RE = re.compile(r'^\s*#\s*pragma\s+once\s*$')
_DUPLICATED_HEADER_RE = re.compile(r'^#\s*include\s*<bits/stdc\+\+\.h>\s*$|^using\s+namespace\s+std\s*;\s*$')


def normalize_total_cases(value) -> int:
    """题面给出的测试点总数；未给出则默认 25（越界或格式错即报错，不静默改数）。"""
    if value is None or value == '':
        return DEFAULT_TOTAL_CASES
    if isinstance(value, str) and value.isdigit():
        value = int(value)
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f'total_cases 非法: {value!r}')
    if not 1 <= value <= 100:
        raise ValueError(f'total_cases 超出 1~100: {value}')
    return value


def _case_numbers(value, total_cases: int) -> list[int]:
    """把 `"1-4"` / `"1,3"` / `[1,2]` / `3` 解析成有序测试点编号。"""
    if isinstance(value, int) and not isinstance(value, bool):
        numbers = [value]
    elif isinstance(value, str):
        numbers = []
        for part in value.replace('，', ',').split(','):
            part = part.strip()
            if not part:
                continue
            match = CASE_RANGE_RE.match(part)
            if match:
                lo, hi = int(match.group(1)), int(match.group(2))
                if lo > hi:
                    raise ValueError(f'cases 区间颠倒: {part}')
                numbers.extend(range(lo, hi + 1))
            elif part.isdigit():
                numbers.append(int(part))
            else:
                raise ValueError(f'cases 无法解析: {part}')
    elif isinstance(value, list):
        numbers = []
        for v in value:
            numbers.extend(_case_numbers(v, total_cases))
    else:
        raise ValueError(f'cases 非法: {value!r}')
    if not numbers:
        raise ValueError('cases 为空')
    for n in numbers:
        if not isinstance(n, int) or isinstance(n, bool) or not 1 <= n <= total_cases:
            raise ValueError(f'cases 测试点编号超出 1~{total_cases}: {n!r}')
    return sorted(set(numbers))


def _config_head() -> list[str]:
    """沿用默认配置的 type/time/memory 行。"""
    return [line for line in full_testdata_config().splitlines() if CONFIG_HEAD_RE.match(line)]


def build_testdata_config(subtasks, total_cases: int) -> str:
    """题面给了测试点划分 → 按题面的分值/测试点区间生成 config.yaml；否则回落默认 25 组配置。"""
    if subtasks is None or subtasks == [] or subtasks == '':
        return full_testdata_config()
    if not isinstance(subtasks, list):
        raise ValueError('subtasks 须为列表')
    rows: list[tuple[int, list[int]]] = []
    seen: set[int] = set()
    for i, item in enumerate(subtasks, 1):
        if not isinstance(item, dict):
            raise ValueError(f'第 {i} 个 subtask 不是对象')
        score = item.get('score')
        if isinstance(score, str) and score.isdigit():
            score = int(score)
        if isinstance(score, bool) or not isinstance(score, int) or not 0 < score <= 100:
            raise ValueError(f'第 {i} 个 subtask 分值非法: {item.get("score")!r}')
        numbers = _case_numbers(item.get('cases'), total_cases)
        overlap = seen & set(numbers)
        if overlap:
            raise ValueError(f'第 {i} 个 subtask 测试点重复: {sorted(overlap)}')
        seen |= set(numbers)
        rows.append((score, numbers))
    if sum(score for score, _ in rows) != 100:
        raise ValueError(f'subtask 分值合计须为 100，当前 {sum(score for score, _ in rows)}')
    missing = sorted(set(range(1, total_cases + 1)) - seen)
    if missing:
        raise ValueError(f'subtask 未覆盖测试点: {missing}')
    lines = _config_head() + ['', 'subtasks:']
    for idx, (score, numbers) in enumerate(rows):
        lines.append(f'  - score: {score}')
        lines.append(f'    id: {idx}')
        lines.append('    cases:')
        for n in numbers:
            lines.append(f'      - input: {n}.in')
            lines.append(f'        output: {n}.out')
        lines.append('')
    return '\n'.join(lines).rstrip() + '\n'


def _set_test_cases(text: str, total_cases: int) -> str:
    replaced, count = TEST_CASES_RE.subn(f'const int TEST_CASES = {total_cases};', text)
    if not count:
        raise ValueError('mkin.h 缺少 `const int TEST_CASES = N;` 常量')
    return replaced


def _run(cmd: list[str], cwd: Path, logs: list[str], label: str) -> None:
    logs.append(f'step07: {label}')
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=300)
    if proc.stdout.strip():
        logs.append(proc.stdout.strip()[:2000])
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or '未知错误').strip()[:2000]
        raise RuntimeError(f'{label} 失败: {err}')


def _strip_code_fence(source: str) -> str:
    text = (source or '').strip()
    if text.startswith('```'):
        lines = text.splitlines()
        if lines and lines[0].startswith('```'):
            lines = lines[1:]
        if lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        text = '\n'.join(lines).strip()
    return text


def _extract_test_function(source: str) -> str:
    text = _strip_code_fence(source)
    match = re.search(r'\bvoid\s+test\s*\([^)]*\)\s*\{', text)
    if not match:
        return ''
    start = match.start()
    brace = text.find('{', match.end() - 1)
    if brace < 0:
        return ''
    depth = 0
    for i in range(brace, len(text)):
        ch = text[i]
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    return ''


def _extract_extras(source: str) -> str:
    """取 `void test()` 之外的顶层代码：辅助函数、随机数发生器、常量等。

    模板已提供头文件保护、`#include <bits/stdc++.h>`、`using namespace std;` 与 `TEST_CASES`，
    故只剥掉这几类重复行；模型的辅助函数原样保留，否则 test() 会引用到未声明的符号。
    """
    text = _strip_code_fence(source)
    func = _extract_test_function(text)
    if not func:
        return ''
    lines = text.replace(func, '', 1).splitlines()
    has_mkin_guard = any(_MKIN_GUARD_OPEN_RE.match(l) for l in lines)
    keep = [
        l for l in lines
        if not _MKIN_GUARD_OPEN_RE.match(l)
        and not _MKIN_GUARD_DEF_RE.match(l)
        and not _PRAGMA_ONCE_RE.match(l)
        and not _DUPLICATED_HEADER_RE.match(l.strip())
        and 'TEST_CASES' not in l
    ]
    if has_mkin_guard:
        for i in range(len(keep) - 1, -1, -1):
            if keep[i].strip():
                if keep[i].strip() == '#endif':
                    keep.pop(i)
                break
    return '\n'.join(keep).strip()


def finalize_mkin_h(raw: str, total_cases: int = DEFAULT_TOTAL_CASES) -> str:
    """LLM 常只输出 test()；mkdata.cpp 依赖模板中的 TEST_CASES 等常量。"""
    raw = (raw or '').strip()
    if not raw or 'void test(' not in raw:
        raise ValueError('mkin.h 缺少 void test() 函数')
    if 'TEST_CASES' in raw:
        text = raw
    else:
        template = (SPEC_ROOT / 'question' / 'mkin.h').read_text(encoding='utf-8')
        new_func = _extract_test_function(raw)
        if not new_func:
            raise ValueError('无法从 mkin.h 中解析 void test()')
        old_func = _extract_test_function(template)
        if not old_func:
            raise RuntimeError('question/mkin.h 模板缺少 void test()')
        extras = _extract_extras(raw)
        merged_func = f'{extras}\n\n{new_func}' if extras else new_func
        text = template.replace(old_func, merged_func, 1)
        if 'TEST_CASES' not in text:
            raise RuntimeError('合并 mkin.h 失败')
    text = _set_test_cases(text, total_cases)
    return text if text.endswith('\n') else text + '\n'


def init_question_skeleton(work: Path, logs: list[str]) -> None:
    """Step 01：从内置 question 模板复制 mkdata 框架。"""
    src = SPEC_ROOT / 'question'
    for name in ('mkdata.cpp',):
        shutil.copy2(src / name, work / name)
    logs.append('step01: 已复制 mkdata.cpp 模板')


def run_testdata_pipeline(
    work: Path,
    logs: list[str],
    total_cases: int = DEFAULT_TOTAL_CASES,
    subtasks=None,
) -> None:
    if not shutil.which('g++'):
        raise RuntimeError('未安装 g++，无法执行 step07 测试数据生成')
    total_cases = normalize_total_cases(total_cases)
    config_text = build_testdata_config(subtasks, total_cases)  # 先校验，免白编译
    mkin = (work / 'mkin.h').read_text(encoding='utf-8')
    match = TEST_CASES_RE.search(mkin)
    if not match or int(re.search(r'\d+', match.group()).group()) != total_cases:
        raise RuntimeError(f'mkin.h 的 TEST_CASES 与 total_cases={total_cases} 不一致')
    td = work / 'testdata'
    td.mkdir(parents=True, exist_ok=True)
    (td / 'config.yaml').write_text(config_text, encoding='utf-8')
    _run(['g++', 'mkdata.cpp', '-o', 'mkdata', '-std=c++17'], work, logs, '编译 mkdata')
    _run(['./mkdata'], work, logs, f'运行 mkdata 生成 {total_cases} 组数据')
    for i in range(1, total_cases + 1):
        if not (td / f'{i}.in').is_file() or not (td / f'{i}.out').is_file():
            raise RuntimeError(f'step07: 缺少 testdata/{i}.in 或 {i}.out')
    (work / 'mkdata').unlink(missing_ok=True)
    logs.append(f'step07: testdata {total_cases} 组齐全')
