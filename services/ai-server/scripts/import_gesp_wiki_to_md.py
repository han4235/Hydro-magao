#!/usr/bin/env python3
"""将 llm-wiki/GESP_Training_Materials 的 PDF/DOCX 等批量转为 md，写入 ojimport/gesp/training_materials。"""
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'ojimport/gesp/training_materials'
WIKI_CANDIDATES = [
    ROOT.parent.parent / 'llm-wiki/raw_sources/GESP_Training_Materials',
    ROOT.parent.parent.parent / 'base/llm-wiki/raw_sources/GESP_Training_Materials',
]
CONVERT_EXT = {'.pdf', '.docx', '.doc', '.pptx', '.xlsx'}
COPY_EXT = {'.md', '.cpp', '.txt'}


def wiki_root() -> Path:
    for p in WIKI_CANDIDATES:
        if p.is_dir():
            return p
    print('找不到 GESP_Training_Materials', file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    from markitdown import MarkItDown

    src = wiki_root()
    DEST.mkdir(parents=True, exist_ok=True)
    md = MarkItDown()
    converted = skipped = copied = failed = 0
    for path in sorted(src.iterdir()):
        if not path.is_file():
            continue
        ext = path.suffix.lower()
        if ext in COPY_EXT:
            out = DEST / path.name
            if not out.exists() or path.stat().st_mtime > out.stat().st_mtime:
                out.write_bytes(path.read_bytes())
                copied += 1
            else:
                skipped += 1
            continue
        if ext not in CONVERT_EXT:
            continue
        out = DEST / f'{path.stem}.md'
        if out.is_file() and out.stat().st_mtime >= path.stat().st_mtime:
            skipped += 1
            continue
        try:
            result = md.convert(str(path))
            text = (result.text_content or '').strip()
            if not text:
                print(f'空内容: {path.name}（可运行 scripts/import_gesp_pdf_ocr.py OCR 补全）', file=sys.stderr)
                failed += 1
                continue
            header = f'<!-- source: {path.name} sha256:{hashlib.sha256(path.read_bytes()).hexdigest()[:16]} -->\n\n'
            out.write_text(header + text + '\n', encoding='utf-8')
            converted += 1
            print(f'OK {path.name} -> {out.name} ({len(text)} chars)')
        except Exception as e:
            print(f'FAIL {path.name}: {e}', file=sys.stderr)
            failed += 1
    print(f'完成: 转换 {converted}, 复制 {copied}, 跳过 {skipped}, 失败 {failed} -> {DEST}')
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
