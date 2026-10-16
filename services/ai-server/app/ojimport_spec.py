"""搬题姬规范加载与单题落盘校验（与 services/ai-server/ojimport/ 同步）。"""
import re
import sys
from functools import lru_cache
from pathlib import Path

SPEC_ROOT = Path(__file__).resolve().parent.parent / 'ojimport'
# 站内既有等级标签为中文数字、无空格（GESP一级…GESP八级），此处按此归一
_GESP_CN = {1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八'}
GESP_TAG_RE = re.compile(r'^GESP\s*([1-8]|[一二三四五六七八])\s*级$')
# 知识点标签上限：多级完整（大类 + 子类），再加等级标签合计 ≤5
KNOWLEDGE_TAG_MAX = 4


def gesp_tag(level: int) -> str:
    return f'GESP{_GESP_CN[level]}级'

# 部署镜像须全部存在；缺失则 /health 报错、任务前可发现
_STEP_FILES = [
    'steps/00-detect-url.md',
    'steps/01-init.md',
    'steps/02-get-info.md',
    'steps/03-gesp.md',
    'steps/04-problem.md',
    'steps/05-config.md',
    'steps/06-std.md',
    'steps/07-testdata.md',
    'steps/08-package.md',
    'steps/09-from-file.md',
    'steps/10-from-text.md',
    'steps/11-testdata-only.md',
]

REQUIRED_FILES = [
    'VERSION',
    'FLOW.md',
    'SKILL_AVOID.md',
    'gesp/README.md',
    'prompts/single_preamble.md',
    'prompts/theory_preamble.md',
    'prompts/regen_data_preamble.md',
    *_STEP_FILES,
    'question/problem.yaml',
    'question/problem_zh.md',
    'question/std.cpp',
    'question/mkdata.cpp',
    'question/mkin.h',
    'question/testdata/config.sample-only.yaml',
    'question/testdata/config.full.yaml',
    'theory/README.md',
    'theory/SOURCE.md',
    'theory/FORMAT.md',
    'theory/template/problem.yaml',
    'theory/template/problem_zh.md',
    'theory/template/testdata/config.yaml',
    'theory/example_problem.yaml',
    'theory/example_problem_zh.md',
    'theory/example_testdata_config.yaml',
    'references/testdata-design.md',
]

# 完整课件同步后 training_materials 内应有大量 .md（见 import_gesp_wiki_to_md.py）
GESP_MD_MIN_COUNT = 50

SINGLE_APPEND = [
    *_STEP_FILES,
    'question/problem_zh.md',
    'references/testdata-design.md',
    'SKILL_AVOID.md',
]

GESP_TEXT_LIMIT = 80_000

THEORY_APPEND = [
    'theory/SOURCE.md',
    'theory/FORMAT.md',
    'theory/template/problem.yaml',
    'theory/template/problem_zh.md',
    'theory/template/testdata/config.yaml',
]

REGEN_DATA_APPEND = [
    'steps/11-testdata-only.md',
    'steps/06-std.md',
    'steps/07-testdata.md',
    'references/testdata-design.md',
    'SKILL_AVOID.md',
]


def bundle_missing() -> list[str]:
    missing = []
    for rel in REQUIRED_FILES:
        if not (SPEC_ROOT / rel).is_file():
            missing.append(rel)
    tm = SPEC_ROOT / 'gesp/training_materials'
    md_count = len(list(tm.glob('*.md')))
    if md_count < GESP_MD_MIN_COUNT:
        missing.append(
            f'gesp/training_materials/*.md（当前 {md_count}，完整同步须 ≥{GESP_MD_MIN_COUNT}，'
            '请运行 scripts/import_gesp_wiki_to_md.py）',
        )
    return missing


def _gesp_training_blob() -> str:
    tm = SPEC_ROOT / 'gesp/training_materials'
    chunks: list[str] = ['## gesp/training_materials（Step 03 课件摘录）']
    used = 0
    for path in sorted(tm.iterdir()):
        if path.suffix.lower() not in ('.md', '.cpp') or not path.is_file():
            continue
        text = path.read_text(encoding='utf-8', errors='replace').strip()
        if not text:
            continue
        block = f'### {path.name}\n\n{text}'
        if used + len(block) > GESP_TEXT_LIMIT:
            chunks.append(f'（其余课件见镜像内 gesp/training_materials/，已截断）')
            break
        chunks.append(block)
        used += len(block)
    return '\n\n'.join(chunks) if len(chunks) > 1 else ''


@lru_cache(maxsize=1)
def spec_version() -> str:
    path = SPEC_ROOT / 'VERSION'
    if not path.is_file():
        return 'unknown'
    return path.read_text(encoding='utf-8').strip().splitlines()[0].strip()


def _read(rel: str) -> str:
    path = SPEC_ROOT / rel
    if not path.is_file():
        raise FileNotFoundError(f'缺少搬题姬材料: {path}')
    return path.read_text(encoding='utf-8').strip()


def _join_prompt(parts: list[str]) -> str:
    return '\n\n---\n\n'.join(_read(p) for p in parts)


@lru_cache(maxsize=1)
def single_llm_system() -> str:
    base = _join_prompt(['prompts/single_preamble.md'] + SINGLE_APPEND)
    gesp = _gesp_training_blob()
    return f'{base}\n\n---\n\n{gesp}' if gesp else base


@lru_cache(maxsize=1)
def theory_llm_system() -> str:
    return _join_prompt(['prompts/theory_preamble.md'] + THEORY_APPEND)


@lru_cache(maxsize=1)
def regen_data_llm_system() -> str:
    return _join_prompt(['prompts/regen_data_preamble.md'] + REGEN_DATA_APPEND)


@lru_cache(maxsize=1)
def sample_testdata_config() -> str:
    return _read('question/testdata/config.sample-only.yaml') + '\n'


@lru_cache(maxsize=1)
def full_testdata_config() -> str:
    return _read('question/testdata/config.full.yaml') + '\n'


def normalize_tags(tags: list[str], gesp_level: int | None = None) -> list[str]:
    cleaned = [str(t).strip() for t in tags if str(t).strip()]
    knowledge = [t for t in cleaned if not GESP_TAG_RE.match(t)]
    gesp = [gesp_tag(gesp_level)] if gesp_level in _GESP_CN else []
    if len(gesp) != 1:
        raise ValueError('tag 须含且仅含一个「GESP X级」')
    if not knowledge:
        raise ValueError('tag 须含 2~4 个知识点标签')
    return knowledge[:KNOWLEDGE_TAG_MAX] + gesp


TITLE_PREFIX_RE = re.compile(r'^GESP\s*(?:[1-8]|[一二三四五六七八])\s*级\s*[｜|]\s*')


def pick_titles(item: dict) -> tuple[str, str]:
    yaml_title = str(item.get('yaml_title') or item.get('title') or '').strip()
    heading = str(item.get('heading') or '').strip()
    if not heading and yaml_title:
        heading = yaml_title.split('｜', 1)[-1].strip()
    if not yaml_title and heading:
        yaml_title = heading
    # 级别由 tag 承载，标题只留题目名
    yaml_title = TITLE_PREFIX_RE.sub('', yaml_title).strip()
    heading = TITLE_PREFIX_RE.sub('', heading).strip()
    if not yaml_title or not heading:
        raise ValueError('标题为空')
    if len(yaml_title) > 120:
        raise ValueError('yaml_title 过长')
    return yaml_title, heading


def main() -> int:
    missing = bundle_missing()
    if missing:
        print('ojimport 材料缺失:', ', '.join(missing), file=sys.stderr)
        return 1
    print(f'ojimport {spec_version()} OK, single_prompt={len(single_llm_system())} chars')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
