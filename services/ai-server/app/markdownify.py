"""文档转 Markdown，与 Cursor markdownify MCP 同源（markitdown）。"""
import os
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

from markitdown import FileConversionException, MarkItDown, UnsupportedFormatException

_CONVERTER: MarkItDown | None = None


def _md() -> MarkItDown:
    global _CONVERTER
    if _CONVERTER is None:
        _CONVERTER = MarkItDown()
    return _CONVERTER


def file_to_markdown(path: Path) -> tuple[str, list[str]]:
    path = path.resolve()
    if not path.is_file():
        raise FileNotFoundError(f'文件不存在: {path}')
    logs: list[str] = []
    bin_path = os.environ.get('MARKITDOWN_BIN', '').strip()
    if bin_path:
        text = _via_cli(bin_path, path, logs)
    else:
        text = _via_library_path(path, logs)
    text = (text or '').strip()
    if not text:
        logs.append('markdownify 结果为空，可能是扫描版或无可提取内容')
    return text, logs


def pdf_to_markdown(path: Path) -> tuple[str, list[str]]:
    return file_to_markdown(path)


def url_to_markdown(url: str, cookie: str = '') -> tuple[str, list[str]]:
    url = (url or '').strip()
    if not url.startswith(('http://', 'https://')):
        raise ValueError('链接必须以 http:// 或 https:// 开头')
    logs = ['markdownify: 抓取网页后 markitdown']
    html, fetch_logs = _fetch_url_html(url, cookie=cookie)
    logs.extend(fetch_logs)
    suffix = '.html' if '<html' in html[:800].lower() else '.txt'
    with tempfile.NamedTemporaryFile(mode='w', suffix=suffix, encoding='utf-8', delete=False) as f:
        f.write(html)
        path = Path(f.name)
    try:
        text = _via_library_path(path, logs)
    finally:
        path.unlink(missing_ok=True)
    text = (text or '').strip()
    if not text:
        logs.append('网页正文为空')
    return text, logs


def _fetch_url_html(url: str, cookie: str = '') -> tuple[str, list[str]]:
    """先抓取 HTML。markitdown 自带 URL 抓取易被洛谷等站点以 418 拒绝。"""
    headers = {'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'}
    ua = os.environ.get('FETCH_USER_AGENT', '').strip()
    if ua:
        headers['User-Agent'] = ua
    cookie = (cookie or '').strip() or _fetch_cookie_for_url(url)
    logs = ['fetch: urllib']
    if cookie:
        headers['Cookie'] = cookie
        logs.append('fetch: 已附带 Cookie')
    req = urllib.request.Request(url, headers=headers)
    timeout = int(os.environ.get('FETCH_TIMEOUT', '60'))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            charset = resp.headers.get_content_charset() or 'utf-8'
            body = resp.read()
    except urllib.error.HTTPError as e:
        if e.code == 418:
            raise ValueError(
                '目标站点拒绝了自动抓取（418，常见于洛谷）。可改用「粘贴题面文本」或上传文件；'
                '若仍要用链接，可在 oj-ai 环境配置 FETCH_COOKIE（浏览器登录后复制的 Cookie，勿提交 git）。'
            ) from e
        raise ValueError(f'markdownify 抓取失败: HTTP {e.code}') from e
    except urllib.error.URLError as e:
        raise ValueError(f'markdownify 抓取失败: {e.reason}') from e
    return body.decode(charset, errors='replace'), logs


def _fetch_cookie_for_url(url: str) -> str:
    """通用 FETCH_COOKIE；洛谷可用 FETCH_COOKIE_LUOGU（优先于通用）。"""
    host = (urllib.request.urlparse(url).hostname or '').lower()
    if 'luogu' in host:
        luogu = os.environ.get('FETCH_COOKIE_LUOGU', '').strip()
        if luogu:
            return luogu
    return os.environ.get('FETCH_COOKIE', '').strip()


def text_to_markdown(body: str) -> tuple[str, list[str]]:
    body = (body or '').strip()
    if not body:
        return '', ['markdownify: 文本为空']
    logs = ['markdownify: markitdown (文本)']
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', encoding='utf-8', delete=False) as f:
        f.write(body)
        path = Path(f.name)
    try:
        text = _via_library_path(path, logs)
    finally:
        path.unlink(missing_ok=True)
    text = (text or body).strip()
    return text, logs


def _via_library_path(path: Path, logs: list[str]) -> str:
    if not logs or logs[-1] != 'markdownify: markitdown (文本)':
        logs.append('markdownify: markitdown (Python)')
    try:
        result = _md().convert(str(path))
    except UnsupportedFormatException as e:
        raise ValueError(f'markdownify 不支持该文件: {e}') from e
    except FileConversionException as e:
        raise ValueError(f'markdownify 转换失败: {e}') from e
    return (result.text_content or '').strip()


def _via_cli(bin_path: str, path: Path, logs: list[str]) -> str:
    uv = os.environ.get('MARKITDOWN_UV', '').strip()
    markitdown = Path(bin_path).expanduser()
    if not markitdown.is_file():
        raise RuntimeError(f'MARKITDOWN_BIN 不存在: {markitdown}')
    if uv:
        uv_bin = Path(uv).expanduser()
        if not uv_bin.is_file():
            raise RuntimeError(f'MARKITDOWN_UV 不存在: {uv_bin}')
        cmd = [str(uv_bin), 'run', str(markitdown), str(path)]
        logs.append('markdownify: uv run markitdown')
    else:
        cmd = [str(markitdown), str(path)]
        logs.append('markdownify: markitdown CLI')
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=int(os.environ.get('MARKITDOWN_TIMEOUT', '300')),
            check=False,
        )
    except subprocess.TimeoutExpired as e:
        raise ValueError('markdownify 转换超时') from e
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or '').strip()
        raise ValueError(f'markdownify 失败: {err[:500]}')
    return (proc.stdout or '').strip()
