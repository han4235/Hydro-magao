"""题解技能材料加载与自检（与 services/ai-server/solution/ 同步）。"""
import sys
from functools import lru_cache
from pathlib import Path

SPEC_ROOT = Path(__file__).resolve().parent.parent / 'solution'

# 提示词按顺序拼接：先讲本服务与 skill 原文的差异，再给 skill 正文
PROMPT_FILES = [
    'prompts/solution_preamble.md',
    'SKILL.md',
    'steps/03-statement.md',
    'steps/04-analysis.md',
    'steps/05-code.md',
    'steps/06-complexity.md',
    'steps/07-format-check.md',
    'steps/08-humanize.md',
    'references/solution-spec.md',
]

REQUIRED_FILES = ['VERSION', 'FLOW.md', *PROMPT_FILES]


def bundle_missing() -> list[str]:
    return [rel for rel in REQUIRED_FILES if not (SPEC_ROOT / rel).is_file()]


@lru_cache(maxsize=1)
def spec_version() -> str:
    path = SPEC_ROOT / 'VERSION'
    if not path.is_file():
        return 'unknown'
    return path.read_text(encoding='utf-8').strip().splitlines()[0].strip()


def _read(rel: str) -> str:
    path = SPEC_ROOT / rel
    if not path.is_file():
        raise FileNotFoundError(f'缺少题解技能材料: {path}')
    return path.read_text(encoding='utf-8').strip()


@lru_cache(maxsize=1)
def solution_llm_system() -> str:
    return '\n\n---\n\n'.join(_read(p) for p in PROMPT_FILES)


def main() -> int:
    missing = bundle_missing()
    if missing:
        print('题解技能材料缺失:', ', '.join(missing), file=sys.stderr)
        return 1
    print(f'solution {spec_version()} OK, prompt={len(solution_llm_system())} chars')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
