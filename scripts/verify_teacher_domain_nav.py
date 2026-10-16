#!/usr/bin/env python3
"""教师「管理域」的浏览器验证：顶栏入口、侧栏两项、学生名单页的权限边界。

用临时会话（直接往 db.token 里插）跑真实点击，临时学生账号名字带「验证用」，跑完删干净。

    python3 scripts/verify_teacher_domain_nav.py
"""
from __future__ import annotations

import random
import string
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1'
DOMAIN = 'system'
TEACHER = 68   # system 域里的「教师」
ADMIN = 3      # system 域里的 root
SHOT = Path('/tmp')
STUDENT = '验证用学生' + ''.join(random.choice(string.ascii_lowercase) for _ in range(4))


def sh(*args: str) -> str:
    return subprocess.run(args, capture_output=True, text=True, check=False).stdout.strip()


def mongo(js: str) -> str:
    return sh('docker', 'exec', 'oj-mongo', 'mongosh', 'hydro', '--quiet', '--eval', js)


def grant(uid: int, tag: str) -> str:
    sid = ''.join(random.choice(string.ascii_letters + string.digits) for _ in range(32))
    mongo(f'''
db.token.insertOne({{
  _id: '{sid}', viewLang: '', uid: {uid}, sudo: null, sudoUid: null, scope: '-1',
  oauthBind: null, save: true,
  updateIp: '127.0.0.1', updateUa: '', createIp: '127.0.0.1', createUa: '',
  createHost: '{tag}', tokenType: 0,
  createAt: new Date(), updateAt: new Date(),
  expireAt: new Date(Date.now() + 3600 * 1000)
}});
''')
    return sid


def cleanup() -> None:
    mongo(f'''
const u = db.user.findOne({{uname: "{STUDENT}"}});
if (u) {{ db["domain.user"].deleteMany({{uid: u._id, domainId: "{DOMAIN}"}}); db.user.deleteOne({{_id: u._id}}); }}
db.token.deleteMany({{createHost: /^verify-teacher-domain/}});
''')


def sidebar(page):
    """侧栏读成 [(family, [项目…]), …]，顺带把 family 文字也抓出来。"""
    out = []
    for group in page.locator('.dtoj-domain-nav .dtoj-domain-nav__group').all():
        family = group.locator('.dtoj-domain-nav__family').inner_text().strip()
        out.append((family, group.locator('a').all_inner_texts()))
    return out


def navbar(page):
    return [t.strip() for t in page.locator('.nav__list--main .nav__item').all_inner_texts() if t.strip()]


def main() -> int:
    cleanup()
    failed = []

    def check(label, got, want):
        ok = got == want
        if not ok:
            failed.append(label)
        print(f'  [{"OK  " if ok else "FAIL"}] {label}: 期望 {want!r} / 实得 {got!r}')

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            ctx = browser.new_context(viewport={'width': 1440, 'height': 1000}, device_scale_factor=2)
            ctx.set_default_timeout(15000)
            ctx.add_cookies([{'name': 'sid', 'value': grant(TEACHER, 'verify-teacher-domain'), 'domain': '127.0.0.1', 'path': '/'}])
            page = ctx.new_page()

            print('== 教师：顶栏 ==')
            page.goto(f'{BASE}/home', wait_until='domcontentloaded')
            nav = navbar(page)
            print('  顶栏:', nav)
            check('顶栏有「管理域」', '管理域' in nav, True)
            check('顶栏没有「小组」', '小组' in nav, False)

            print('== 教师：点「管理域」进 /group ==')
            # 顶栏会被未读消息的轮询整体重画，等元素「稳定」再点会一直重试；
            # 直接查 href，再用 el.click() 原地触发。
            entry = '.nav__list--main .nav__item:text-is("管理域")'
            check('顶栏「管理域」指向 /group', page.get_attribute(entry, 'href'), '/group')
            page.eval_on_selector(entry, 'el => el.click()')
            page.wait_for_url('**/group')
            page.wait_for_selector('.dtoj-domain-nav')
            check('落在 /group', page.url.endswith('/group'), True)

            print('== 教师：侧栏只有访问控制的两项 ==')
            got = sidebar(page)
            print('  侧栏:', got)
            check('侧栏只有一组', [f for f, _ in got], ['访问控制'])
            check('两项的名字与顺序', got[0][1] if got else [], ['管理小组', '管理用户'])

            print('== 教师：点「管理用户」进学生名单 ==')
            page.click('.dtoj-domain-nav a:text-is("管理用户")')
            page.wait_for_selector('.dtoj-students__add')
            check('落在 /domain/student', page.url.endswith('/domain/student'), True)
            check('这一页侧栏也只剩两项', sidebar(page)[0][1], ['管理小组', '管理用户'])
            check('没有「管理角色」入口', page.locator('.dtoj-domain-nav a:text-is("管理角色")').count(), 0)

            print('== 教师：页面上没有改角色 / 删账号这些口子 ==')
            check('没有角色下拉', page.locator('select[name="role"]').count(), 0)
            check('没有删除按钮', page.locator('button:has-text("删除"), a:has-text("删除")').count(), 0)
            check('添加表单的角色是写死的', '学生' in page.locator('.dtoj-students__add label').inner_text(), True)

            print('== 教师：添加学生 ==')
            page.fill('#dtoj-students-usernames', STUDENT)
            page.click('.dtoj-students__add button[type="submit"]')
            page.wait_for_selector('.dtoj-students__result')
            check('提示新建了 1 个', '新建账号 1 个' in page.locator('.dtoj-students__result').inner_text(), True)
            check('新账号进了名单', page.locator(f'.dtoj-students__name:has-text("{STUDENT}")').count(), 1)

            print('== 教师：初始化这个学生的密码 ==')
            page.once('dialog', lambda d: d.accept())
            page.click(f'tr:has(.dtoj-students__name:text-is("{STUDENT}")) [data-init-one]')
            page.wait_for_selector('.dtoj-students__result')
            check('提示重置了 1 个', '已把 1 个学生账号的密码重置为 123456' in page.locator('.dtoj-students__result').inner_text(), True)

            print('== 教师：搜索 ==')
            page.fill('.dtoj-students__search', STUDENT)
            page.click('.dtoj-students__tools button[type="submit"]')
            page.wait_for_selector('.dtoj-students__search')
            check('搜到 1 人', page.locator('.dtoj-students__count').inner_text().strip(), '共 1 人')
            page.screenshot(path=str(SHOT / 'verify_teacher_domain_user.png'), full_page=True)

            print('== 教师：管理员那几页进不去 ==')
            for path in ('/domain/dashboard', '/domain/user', '/domain/role', '/domain/permission'):
                # 不给 follow_redirects，否则 302 被吃掉，看不出是被弹走的
                resp = page.context.request.get(f'{BASE}{path}', max_redirects=0)
                check(f'{path} 被弹走', resp.status, 302)
            ctx.close()

            print('== 管理员：域控制台还是全套 ==')
            ctx2 = browser.new_context(viewport={'width': 1440, 'height': 1000}, device_scale_factor=2)
            ctx2.set_default_timeout(15000)
            ctx2.add_cookies([{'name': 'sid', 'value': grant(ADMIN, 'verify-teacher-domain'), 'domain': '127.0.0.1', 'path': '/'}])
            page2 = ctx2.new_page()
            page2.goto(f'{BASE}/domain/dashboard', wait_until='domcontentloaded')
            page2.wait_for_selector('.dtoj-domain-nav')
            admin_nav = navbar(page2)
            check('顶栏「管理域」还在', '管理域' in admin_nav, True)
            got2 = sidebar(page2)
            print('  侧栏:', got2)
            check('侧栏两组', [f for f, _ in got2], ['属性', '访问控制'])
            check('属性组完整', got2[0][1] if got2 else [], ['管理域', '编辑域资料', '加域申请'])
            check('访问控制组完整', got2[1][1] if len(got2) > 1 else [],
                  ['管理角色', '管理用户', '管理权限', '管理小组'])
            page2.screenshot(path=str(SHOT / 'verify_admin_domain_nav.png'), full_page=True)
            ctx2.close()
            browser.close()
    finally:
        cleanup()

    print()
    if failed:
        print(f'{len(failed)} 项没过：' + '，'.join(failed))
        return 1
    print('全部通过')
    return 0


if __name__ == '__main__':
    sys.exit(main())
