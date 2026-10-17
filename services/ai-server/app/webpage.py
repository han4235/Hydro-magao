"""网页题面预处理：只留题目正文、展开合并单元格，避免把整页导航喂给模型。"""
from bs4 import BeautifulSoup

# Hydro 系（DTOJ、自建 Hydro）的题面容器；洛谷走 app/luogu.py 的内嵌 JSON
_PROBLEM_SELECTORS = (
    'div.problem-content',
    'div[data-fragment-id="problem-description"]',
    'div.section__body.typo',
)


def is_html(html: str) -> bool:
    head = (html or '')[:2048].lower()
    return '<html' in head or '<!doctype html' in head


def looks_like_html(text: str) -> bool:
    """转换结果仍是整页 HTML，说明 markitdown 的 HTML 转换器没生效（会静默退回纯文本）。"""
    head = (text or '')[:512].lstrip().lower()
    return head.startswith('<!doctype html') or head.startswith('<html')


def problem_container(html: str) -> str:
    """取题目正文容器；找不到就原样返回整页。"""
    soup = BeautifulSoup(html, 'html.parser')
    for sel in _PROBLEM_SELECTORS:
        node = soup.select_one(sel)
        if node is not None:
            _katex_to_tex(soup, node)
            return str(node)
    return html


def _katex_to_tex(soup: BeautifulSoup, root) -> None:
    r"""KaTeX 渲染出来的公式在 HTML 里有一份 MathML 和一份排版用的 span，直接转换会把公式重复三遍
    （`1≤n≤2×105` 变成 `1 \le n \le 2\times 10^51≤n≤2×105`），模型很容易把 `10^5` 读成 `105`。
    这里只留原始 LaTeX。
    """
    for span in root.select('span.katex'):
        ann = span.find('annotation', attrs={'encoding': 'application/x-tex'})
        tex = ann.get_text().strip() if ann is not None else ''
        if not tex:
            span.decompose()
            continue
        span.replace_with(f'${tex}$')



def expand_merged_cells(html: str) -> str:
    """把 rowspan / colspan 展开成真实单元格。

    Markdown 表格没有合并单元格：不展开的话，被合并的那几格在转换后直接消失，
    模型读表格就会错位（例如「6~8」这一行的分值、$a_i$ 上限都丢了）。
    """
    soup = BeautifulSoup(html, 'html.parser')
    for table in soup.find_all('table'):
        rows = table.find_all('tr')
        if not rows:
            continue
        grid: list[list[str]] = []
        spill: dict[tuple[int, int], str] = {}
        for ri, tr in enumerate(rows):
            cells = tr.find_all(['th', 'td'], recursive=False)
            if not cells:
                cells = tr.find_all(['th', 'td'])
            row: list[str] = []
            ci = 0
            for cell in cells:
                while (ri, ci) in spill:
                    row.append(spill.pop((ri, ci)))
                    ci += 1
                rs = _span(cell.get('rowspan'))
                cs = _span(cell.get('colspan'))
                inner = ''.join(str(x) for x in cell.contents)
                for dr in range(rs):
                    for dc in range(cs):
                        if dr or dc:
                            spill[(ri + dr, ci + dc)] = inner
                for _ in range(cs):
                    row.append(inner)
                ci += cs
            while (ri, ci) in spill:
                row.append(spill.pop((ri, ci)))
                ci += 1
            grid.append(row)
        _rebuild(soup, table, grid)
    return str(soup)


def _span(value) -> int:
    try:
        return max(1, int(str(value).strip()))
    except (TypeError, ValueError):
        return 1


def _rebuild(soup: BeautifulSoup, table, grid: list[list[str]]) -> None:
    table.clear()
    for row in grid:
        tr = soup.new_tag('tr')
        for cell in row:
            td = soup.new_tag('td')
            td.append(BeautifulSoup(cell, 'html.parser'))
            tr.append(td)
        table.append(tr)
