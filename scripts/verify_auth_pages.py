#!/usr/bin/env python3
"""登录/注册页的浏览器验证：全屏分栏、无顶栏、文字对比度、焦点态。

对比度取的是真实渲染像素：先在页面里把文字色画到 canvas 上取出实色，
再到截图里读同一处的背景像素，按 alpha 混一次 —— 渐变底上的半透明白字
只有这样才能算准。

截图落在 /tmp。跑法：

    python3 scripts/verify_auth_pages.py
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1'
SHOT = Path('/tmp')
PAGES = [('/login', '登录'), ('/register', '注册')]

# (说明, 选择器)。背景在元素右侧取，避开字形。
TEXTS = [
    ('左栏主张标题', '.dtoj-auth-hero h1'),
    ('左栏副标题', '.dtoj-auth-hero p'),
    ('左栏 logo 文字', '.dtoj-auth-logo span'),
    ('右栏标题', '.dtoj-auth-panel h2'),
    ('右栏副标题', '.dtoj-auth-sub'),
    ('字段标签', '.dtoj-auth-field > span'),
]


def luminance(rgb) -> float:
    def channel(v: float) -> float:
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = rgb[:3]
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def contrast(a, b) -> float:
    la, lb = luminance(a), luminance(b)
    return round((max(la, lb) + 0.05) / (min(la, lb) + 0.05), 2)


def check(label: str, got, want, failed: list) -> None:
    ok = got == want
    if not ok:
        failed.append(label)
    print(f'  [{"OK  " if ok else "FAIL"}] {label}: 期望 {want!r} / 实得 {got!r}')


def contrast_report(page, shot: bytes) -> list:
    """逐条打印对比度，返回不达标项。"""
    img = Image.open(io.BytesIO(shot)).convert('RGB')
    bad = []
    for label, selector in TEXTS:
        data = page.evaluate("""(sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const cv = document.createElement('canvas'); cv.width = cv.height = 4;
          const g = cv.getContext('2d');
          g.fillStyle = getComputedStyle(el).color; g.fillRect(0, 0, 4, 4);
          const px = g.getImageData(0, 0, 1, 1).data;
          return { color: [px[0], px[1], px[2]], alpha: px[3] / 255,
                   x: Math.round(r.left + 2), y: Math.round(r.top + r.height / 2),
                   size: parseFloat(getComputedStyle(el).fontSize) };
        }""", selector)
        if not data:
            print(f'  {label}: 元素不在')
            continue
        bx = min(data['x'] + 220, img.width - 1)
        by = min(max(data['y'], 0), img.height - 1)
        bg = img.getpixel((bx, by))
        fg = data['color']
        blended = tuple(round(f * data['alpha'] + b * (1 - data['alpha'])) for f, b in zip(fg, bg))
        got = contrast(blended, bg)
        # 大字号（>=24px，或 >=18.66px 粗体）门槛降到 3:1；这里只可能碰到标题
        need = 3.0 if data['size'] >= 24 else 4.5
        ok = got >= need
        if not ok:
            bad.append(f'{label} {got}:1')
        print(f'  [{"OK  " if ok else "FAIL"}] {label:<12} {data["size"]:>5}px  {got:>5}:1  需 {need}')
    return bad


def main() -> int:
    failed: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for path, name in PAGES:
            print(f'\n=== {name}页 {path}：全屏与结构 ===')
            ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
            page = ctx.new_page()
            errors: list[str] = []
            page.on('pageerror', lambda e: errors.append(str(e)[:160]))
            response = page.goto(f'{BASE}{path}', wait_until='networkidle', timeout=60000)
            page.wait_for_timeout(800)
            check('HTTP 200', response.status, 200, failed)

            box = page.evaluate("""() => {
              const q = (sel) => { const el = document.querySelector(sel); if (!el) return null;
                const r = el.getBoundingClientRect();
                return { w: Math.round(r.width), h: Math.round(r.height),
                         top: Math.round(r.top), left: Math.round(r.left) }; };
              return { page: q('.dtoj-auth-page'), brand: q('.dtoj-auth-brand'), panel: q('.dtoj-auth-panel'),
                       nav: !!document.querySelector('.slideout-panel'),
                       scroll: document.documentElement.scrollHeight,
                       inner: window.innerHeight };
            }""")
            check('挂上了 auth 页', box['page'] is not None, True, failed)
            check('没有 OJ 顶栏', box['nav'], False, failed)
            check('铺满视口高度', box['page']['h'], box['inner'], failed)
            check('左右等分', box['brand']['w'], box['panel']['w'], failed)
            check('左栏从左上角起', (box['brand']['top'], box['brand']['left']), (0, 0), failed)
            check('页面不出现纵向滚动', box['scroll'], box['inner'], failed)
            check('无脚本报错', errors, [], failed)

            print(f'\n=== {name}页：文字对比度 ===')
            shot = page.screenshot()
            failed.extend(contrast_report(page, shot))

            print(f'\n=== {name}页：控件形状与焦点 ===')
            shape = page.evaluate("""() => {
              const g = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null; };
              const box = (sel) => { const el = document.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().height) : null; };
              return { 输入框高: box('.dtoj-auth-field input'), 输入框圆角: g('.dtoj-auth-field input', 'borderRadius'),
                       主按钮高: box('.dtoj-auth-submit'), 主按钮圆角: g('.dtoj-auth-submit', 'borderRadius'),
                       主按钮底色: g('.dtoj-auth-submit', 'backgroundColor'),
                       白色胶囊圆角: g('.dtoj-auth-ghost', 'borderRadius') };
            }""")
            for key, want in [('输入框圆角', '999px'), ('主按钮圆角', '999px'), ('白色胶囊圆角', '999px'),
                              ('主按钮底色', 'rgb(16, 24, 40)'), ('输入框高', 52), ('主按钮高', 52)]:
                check(key, shape[key], want, failed)

            if path == '/login':
                page.keyboard.press('Tab')
                page.keyboard.press('Tab')
                page.wait_for_timeout(400)
                focus = page.evaluate("""() => {
                  const el = document.activeElement; const cs = getComputedStyle(el);
                  return { name: el.name || el.tagName, outline: cs.outlineStyle, shadow: cs.boxShadow };
                }""")
                check('Tab 停在「记住我」上', focus['name'], 'rememberme', failed)
                check('它有可见焦点框', focus['outline'] != 'none' or focus['shadow'] != 'none', True, failed)

            page.screenshot(path=str(SHOT / f'auth-{name}-1440.png'))
            ctx.close()

        print('\n=== 窄屏（390×844）不分栏、品牌压成横条 ===')
        ctx = browser.new_context(viewport={'width': 390, 'height': 844})
        page = ctx.new_page()
        page.goto(f'{BASE}/login', wait_until='networkidle', timeout=60000)
        page.wait_for_timeout(600)
        narrow = page.evaluate("""() => {
          const q = (sel) => { const el = document.querySelector(sel); if (!el) return null;
            const r = el.getBoundingClientRect();
            return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }; };
          return { brand: q('.dtoj-auth-brand'), panel: q('.dtoj-auth-panel') };
        }""")
        check('品牌条占满宽度', narrow['brand']['w'], 390, failed)
        check('品牌条在表单上方压扁', narrow['brand']['h'] < 400, True, failed)
        check('表单接在下方', narrow['panel']['top'], narrow['brand']['h'], failed)
        page.screenshot(path=str(SHOT / 'auth-登录-390.png'))
        ctx.close()
        browser.close()

    print(f'\n{"全部通过" if not failed else "不通过：" + "、".join(failed)}')
    return 0 if not failed else 1


if __name__ == '__main__':
    sys.exit(main())
