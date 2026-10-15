#!/usr/bin/env python3
"""写入 phase_b_local.env：LLM 从本机 one-api.db 读取；HYDRO 默认可不配 sid（任务时自动签发）。"""
import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / 'scripts' / 'phase_b_local.env'
DB_CANDIDATES = [
    Path(os.environ.get('ONE_API_DB', '')),
    Path.home() / 'one-api-data' / 'one-api.db',
    ROOT.parent.parent / 'one-api-data' / 'one-api.db',
]


def find_db() -> Path | None:
    for p in DB_CANDIDATES:
        if p.is_file():
            return p
    return None


def pick_token(db: Path) -> tuple[str, str]:
    conn = sqlite3.connect(db)
    row = conn.execute(
        "SELECT key, name FROM tokens WHERE status=1 ORDER BY id LIMIT 1"
    ).fetchone()
    conn.close()
    if not row:
        raise RuntimeError(f'{db} 里没有可用令牌，请在 one-api 网页新建')
    key, name = row[0], row[1] or ''
    if not key.startswith('sk-'):
        key = f'sk-{key}'
    return key, name


def _read_existing() -> dict[str, str]:
    if not ENV_PATH.is_file():
        return {}
    out: dict[str, str] = {}
    for line in ENV_PATH.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line.startswith('export '):
            continue
        body = line[7:]
        if '=' not in body:
            continue
        k, v = body.split('=', 1)
        out[k.strip()] = v.strip()
    return out


def _direct_deepseek(base: str) -> bool:
    return 'api.deepseek.com' in base


def main() -> int:
    prev = _read_existing()
    base = prev.get('LLM_BASE_URL') or os.environ.get('LLM_BASE_URL') or 'http://127.0.0.1:3000/v1'
    base = base.rstrip('/')
    if base == 'https://api.deepseek.com':
        base = 'https://api.deepseek.com/v1'
    model = prev.get('LLM_MODEL') or os.environ.get('LLM_MODEL') or (
        'deepseek-flash' if _direct_deepseek(base) else 'deepseek-chat'
    )

    lines = [
        '# 由 scripts/phase_b_autofill_env.py 生成，勿提交 git',
        'export AI_SERVER_HMAC_SECRET=dev-ai-secret',
        f'export LLM_BASE_URL={base}',
        f'export LLM_MODEL={model}',
        'export HYDRO_BASE_URL=http://127.0.0.1',
        '# 留空即可：ai-server 导入时自动 mongosh 签发 sid（HYDRO_AUTO_SID=1）',
        'export HYDRO_IMPORT_TOKEN=',
        'export HYDRO_AUTO_SID=1',
        'export JOB_DATA_DIR=/tmp/ai-jobs',
        '',
    ]

    key = prev.get('LLM_API_KEY') or os.environ.get('LLM_API_KEY', '')
    if _direct_deepseek(base):
        if key:
            lines.insert(5, '# DeepSeek 开放平台 API Key（非 one-api 令牌）')
            lines.insert(6, f'export LLM_API_KEY={key}')
        else:
            lines.insert(
                5,
                '# 在 https://platform.deepseek.com 创建 API Key 后写入 LLM_API_KEY',
            )
            lines.insert(6, 'export LLM_API_KEY=')
            ENV_PATH.write_text('\n'.join(lines), encoding='utf-8')
            print('直连 DeepSeek：请设置 LLM_API_KEY', file=sys.stderr)
            return 1
    else:
        db = find_db()
        if db:
            key, name = pick_token(db)
            lines.insert(5, f'# one-api 令牌来源: {db} ({name})')
            lines.insert(6, f'export LLM_API_KEY={key}')
        elif key:
            lines.insert(5, '# 保留已有 LLM_API_KEY')
            lines.insert(6, f'export LLM_API_KEY={key}')
        else:
            lines.insert(5, '# 未找到 one-api.db，请设置 ONE_API_DB 或在 one-api 创建令牌')
            lines.insert(6, 'export LLM_API_KEY=')
            ENV_PATH.write_text('\n'.join(lines), encoding='utf-8')
            print('未找到 one-api.db', file=sys.stderr)
            return 1

    ENV_PATH.write_text('\n'.join(lines), encoding='utf-8')
    print(f'已写入 {ENV_PATH}（LLM 已填，HYDRO sid 导入时自动）')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
