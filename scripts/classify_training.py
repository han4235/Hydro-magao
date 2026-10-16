#!/usr/bin/env python3
"""题目入库后按标签归入青石训练课程（steps/12-training.md 的落地脚本）。

路由与写库逻辑都在 `services/ai-server/app/training.py`，本脚本只是本机入口：
本机没有 `HYDRO_MONGO_URI`，该模块会回落 `docker exec oj-mongo mongosh`，无需额外配置。

路由：GESP{n}级理论 → GESP{n}级理论训练（章节=认证场次）；
官方真题 + GESP{n}级 → GESP{n}级真题训练（章节=算法大类）；
其余 → 算法专题课程（课程=算法大类标签，章节=子类标签）。

课程或章节不存在则按上述命名新建，并把题目 docId 追加进章节 pids。
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'services/ai-server'))

from app.training import classify  # noqa: E402


def read_log_pids(path: Path) -> list[str]:
    pids = []
    for line in path.read_text(encoding='utf-8').splitlines():
        m = re.match(r'^PID:\s*(\S+)', line.strip())
        if m and m.group(1) not in pids:
            pids.append(m.group(1))
    return pids


def main() -> int:
    ap = argparse.ArgumentParser(description='题目入库后按标签归入训练课程')
    ap.add_argument('--pid', action='append', default=[], help='平台题号，可重复（如 aip3f2a1b）')
    ap.add_argument('--doc-id', action='append', type=int, default=[], help='题目 docId，可重复')
    ap.add_argument('--import-log', type=Path, help='读 _import.log 里的 PID: 行')
    ap.add_argument('--dry-run', action='store_true', help='只打印归类结果，不写库')
    args = ap.parse_args()

    pids = list(dict.fromkeys(args.pid + (read_log_pids(args.import_log) if args.import_log else [])))
    if not pids and not args.doc_id:
        ap.error('至少给一个 --pid、--doc-id 或 --import-log')

    for line in classify(pids, args.doc_id, args.dry_run):
        print(line, file=sys.stderr if '未归类' in line else sys.stdout)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
