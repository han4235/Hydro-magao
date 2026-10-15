"""搬题姬 Step 7：编译 mkdata/std，生成 25 组 testdata。"""
import re
import shutil
import subprocess
from pathlib import Path

from app.ojimport_spec import SPEC_ROOT, full_testdata_config


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


def finalize_mkin_h(raw: str) -> str:
    """LLM 常只输出 test()；mkdata.cpp 依赖模板中的 TEST_CASES 等常量。"""
    raw = (raw or '').strip()
    if not raw or 'void test(' not in raw:
        raise ValueError('mkin.h 缺少 void test() 函数')
    if 'TEST_CASES' in raw:
        return raw if raw.endswith('\n') else raw + '\n'
    template = (SPEC_ROOT / 'question' / 'mkin.h').read_text(encoding='utf-8')
    new_func = _extract_test_function(raw)
    if not new_func:
        raise ValueError('无法从 mkin.h 中解析 void test()')
    old_func = _extract_test_function(template)
    if not old_func:
        raise RuntimeError('question/mkin.h 模板缺少 void test()')
    merged = template.replace(old_func, new_func, 1)
    if 'TEST_CASES' not in merged:
        raise RuntimeError('合并 mkin.h 失败')
    return merged if merged.endswith('\n') else merged + '\n'


def init_question_skeleton(work: Path, logs: list[str]) -> None:
    """Step 01：从内置 question 模板复制 mkdata 框架。"""
    src = SPEC_ROOT / 'question'
    for name in ('mkdata.cpp',):
        shutil.copy2(src / name, work / name)
    logs.append('step01: 已复制 mkdata.cpp 模板')


def run_testdata_pipeline(work: Path, logs: list[str]) -> None:
    if not shutil.which('g++'):
        raise RuntimeError('未安装 g++，无法执行 step07 测试数据生成')
    td = work / 'testdata'
    td.mkdir(parents=True, exist_ok=True)
    (td / 'config.yaml').write_text(full_testdata_config(), encoding='utf-8')
    _run(['g++', 'mkdata.cpp', '-o', 'mkdata', '-std=c++17'], work, logs, '编译 mkdata')
    _run(['./mkdata'], work, logs, '运行 mkdata 生成 25 组数据')
    for i in range(1, 26):
        if not (td / f'{i}.in').is_file() or not (td / f'{i}.out').is_file():
            raise RuntimeError(f'step07: 缺少 testdata/{i}.in 或 {i}.out')
    (work / 'mkdata').unlink(missing_ok=True)
    logs.append('step07: testdata 25 组齐全')
