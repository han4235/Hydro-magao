"""洛谷题面提取。

洛谷给未登录用户与爬虫的页面里，题面只是**被截断的 SEO 片段**：每个 section 的正文都被砍掉
（P1001 的「说明/提示」停在 PHP 代码块中间），样例区根本不渲染。完整题面与样例只在页面内嵌
JSON（`<script>{"instance":…}</script>` → `data.problem.contenu` / `data.problem.samples`）里。

所以洛谷题目页不再走「整页 markitdown」，直接从这个 JSON 拼 Markdown；否则抓到的题面会缺
样例、缺「测试点编号」表与表后的说明。
"""
import json
import re
from urllib.parse import urlparse

from bs4 import BeautifulSoup

# contenu 里的字段顺序就是题面的顺序；样例插在「输出格式」之后
_SECTIONS = (
    ('background', '题目背景'),
    ('description', '题目描述'),
    ('formatI', '输入格式'),
    ('formatO', '输出格式'),
    ('hint', '说明/提示'),
)
# 洛谷自定义容器：`::cute-table{tuack}` 是表格样式指令，`::anti-ai[...]` 是给 AI 的注入要求
_CUTE_TABLE = re.compile(r'^::cute-table\{[^}]*\}\s*$', re.M)
_ANTI_AI = re.compile(r'::anti-ai\[.*?\]', re.S)
_TABLE_SEP = re.compile(r'^\|[\s:|-]+\|$')


def is_problem_url(url: str) -> bool:
    parsed = urlparse(url or '')
    host = (parsed.hostname or '').lower()
    return host.endswith('luogu.com.cn') and parsed.path.startswith('/problem/')


def problem_markdown(html: str) -> str:
    """从洛谷题目页取出完整题面；不是题目页或没有内嵌 JSON 时返回空串。"""
    prob = _embedded_problem(html)
    if not prob:
        return ''
    contenu = prob.get('contenu') or prob.get('content') or {}
    if not isinstance(contenu, dict):
        return ''
    parts: list[str] = []
    title = str(prob.get('name') or contenu.get('name') or '').strip()
    if title:
        parts.append(f'# {title}')
    for key, heading in _SECTIONS:
        body = _clean(str(contenu.get(key) or ''))
        if body:
            parts.append(f'## {heading}\n\n{body}')
        if key == 'formatO':
            sample = _samples_markdown(prob.get('samples'))
            if sample:
                parts.append(sample)
    return '\n\n'.join(parts).strip()


def _embedded_problem(html: str) -> dict | None:
    soup = BeautifulSoup(html, 'html.parser')
    for script in soup.find_all('script'):
        raw = (script.string or '').strip()
        # 状态 JSON 是页面的第一个大 payload；带 instance/template 的才是它
        if not raw.startswith('{"instance"'):
            continue
        try:
            data = json.loads(raw)
        except ValueError:
            continue
        prob = (data.get('data') or {}).get('problem')
        if isinstance(prob, dict):
            return prob
    return None


def _samples_markdown(samples) -> str:
    if not isinstance(samples, list):
        return ''
    blocks: list[str] = []
    for i, pair in enumerate(samples, 1):
        if not isinstance(pair, (list, tuple)) or len(pair) < 2:
            continue
        blocks.append(f'### 样例输入 #{i}\n\n```text\n{str(pair[0]).strip()}\n```')
        blocks.append(f'### 样例输出 #{i}\n\n```text\n{str(pair[1]).strip()}\n```')
    return '## 样例\n\n' + '\n\n'.join(blocks) if blocks else ''


def _clean(text: str) -> str:
    text = _ANTI_AI.sub('', text)
    text = _CUTE_TABLE.sub('', text)
    text = _expand_tables(text)
    return re.sub(r'\n{3,}', '\n\n', text).strip()


def _expand_tables(text: str) -> str:
    """把洛谷表格的 `^`（合并单元格，等于上一行同列）展开成实际值。

    Markdown 表格不支持 rowspan，直接留着 `^` 会让模型猜不出那格是什么；展开后重复写一遍，
    语义不变、读起来也不别扭。
    """
    lines = text.splitlines()
    out: list[str] = []
    i = 0
    while i < len(lines):
        if lines[i].lstrip().startswith('|') and i + 1 < len(lines) and _TABLE_SEP.match(lines[i + 1].strip()):
            block = [lines[i], lines[i + 1]]
            j = i + 2
            while j < len(lines) and lines[j].lstrip().startswith('|'):
                block.append(lines[j])
                j += 1
            out.extend(_fill_caret(block))
            i = j
        else:
            out.append(lines[i])
            i += 1
    return '\n'.join(out)


def _fill_caret(block: list[str]) -> list[str]:
    prev: list[str] | None = None
    for k in range(2, len(block)):
        cells = block[k].split('|')
        if prev is not None:
            for idx, cell in enumerate(cells):
                if cell.strip() == '^' and idx < len(prev) and prev[idx].strip():
                    cells[idx] = prev[idx]
            block[k] = '|'.join(cells)
        prev = block[k].split('|')
    return block
