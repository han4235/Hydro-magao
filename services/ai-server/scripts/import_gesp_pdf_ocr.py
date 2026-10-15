#!/usr/bin/env python3
"""扫描版 PDF OCR → md（markitdown 空内容时补全）。依赖：pymupdf、pytesseract、系统 tesseract（chi_sim+eng）。"""
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'ojimport/gesp/training_materials'
FAILURES = DEST / 'IMPORT_FAILURES.txt'
WIKI_CANDIDATES = [
    ROOT.parent.parent / 'llm-wiki/raw_sources/GESP_Training_Materials',
    ROOT.parent.parent.parent / 'base/llm-wiki/raw_sources/GESP_Training_Materials',
]
OCR_LANG = 'chi_sim+eng'
# 页数过多时只 OCR 前 N 页（0=全部）；扫描讲义一般 <80 页
MAX_PAGES = 0
DPI_SCALE = 2.0


def wiki_root() -> Path:
    for p in WIKI_CANDIDATES:
        if p.is_dir():
            return p
    print('找不到 GESP_Training_Materials', file=sys.stderr)
    raise SystemExit(1)


def names_from_failures() -> list[str]:
    if not FAILURES.is_file():
        return []
    out = []
    for line in FAILURES.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line.endswith('.pdf') and not line.startswith('以下'):
            out.append(line)
    return out


def pdf_to_md_ocr(pdf: Path) -> str:
    import io

    import fitz
    import pytesseract
    from PIL import Image

    doc = fitz.open(pdf)
    pages = doc.page_count
    limit = pages if MAX_PAGES <= 0 else min(pages, MAX_PAGES)
    parts: list[str] = []
    for i in range(limit):
        page = doc.load_page(i)
        mat = fitz.Matrix(DPI_SCALE, DPI_SCALE)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img = Image.open(io.BytesIO(pix.tobytes('png')))
        text = pytesseract.image_to_string(img, lang=OCR_LANG)
        text = text.strip()
        if text:
            parts.append(f'## 第 {i + 1} 页\n\n{text}')
    doc.close()
    return '\n\n'.join(parts).strip()


def write_md(pdf: Path, text: str) -> Path:
    out = DEST / f'{pdf.stem}.md'
    header = (
        f'<!-- source: {pdf.name} method:ocr-{OCR_LANG} '
        f'sha256:{hashlib.sha256(pdf.read_bytes()).hexdigest()[:16]} -->\n\n'
    )
    out.write_text(header + text + '\n', encoding='utf-8')
    return out


def main() -> int:
    src = wiki_root()
    DEST.mkdir(parents=True, exist_ok=True)
    targets = names_from_failures()
    if not targets:
        print('IMPORT_FAILURES.txt 无待补 PDF，或已清空', file=sys.stderr)
        return 0
    ok = fail = 0
    still: list[str] = []
    for name in targets:
        pdf = src / name
        if not pdf.is_file():
            print(f'缺少源文件: {pdf}', file=sys.stderr)
            still.append(name)
            fail += 1
            continue
        try:
            text = pdf_to_md_ocr(pdf)
        except Exception as e:
            print(f'OCR 异常 {name}: {e}', file=sys.stderr)
            still.append(name)
            fail += 1
            continue
        if len(text) < 80:
            print(f'OCR 过短: {name} ({len(text)} chars)', file=sys.stderr)
            still.append(name)
            fail += 1
            continue
        out = write_md(pdf, text)
        ok += 1
        print(f'OK OCR {name} -> {out.name} ({len(text)} chars)')
    if still:
        FAILURES.write_text(
            '以下 PDF 仍需人工处理（markitdown 空且 OCR 未达标）：\n' + '\n'.join(still) + '\n',
            encoding='utf-8',
        )
    else:
        FAILURES.write_text('（已全部补全，无待处理 PDF）\n', encoding='utf-8')
    print(f'OCR 完成: 成功 {ok}, 失败 {fail}')
    return 1 if fail else 0


if __name__ == '__main__':
    raise SystemExit(main())
