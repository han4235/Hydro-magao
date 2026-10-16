#!/usr/bin/env python3
"""小组管理页的浏览器验证：走一遍真实点击（建组 → 勾人 → 保存 → 删组），顺便截图。

临时会话，只造「验证用」开头的分组，跑完删干净。

    python3 scripts/verify_group_admin_ui.py
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
TEACHER = 68
SHOT = Path('/tmp')
NAME = '验证用班级'


def sh(*args: str) -> str:
    return subprocess.run(args, capture_output=True, text=True, check=False).stdout.strip()


def mongo(js: str) -> str:
    return sh('docker', 'exec', 'oj-mongo', 'mongosh', 'hydro', '--quiet', '--eval', js)


def grant(uid: int) -> str:
    sid = ''.join(random.choice(string.ascii_letters + string.digits) for _ in range(32))
    mongo(f'''
db.token.insertOne({{
  _id: '{sid}', viewLang: '', uid: {uid}, sudo: null, sudoUid: null, scope: '-1',
  oauthBind: null, save: true,
  updateIp: '127.0.0.1', updateUa: '', createIp: '127.0.0.1', createUa: '',
  createHost: 'group-ui-verify', tokenType: 0,
  createAt: new Date(), updateAt: new Date(),
  expireAt: new Date(Date.now() + 3600 * 1000)
}});
''')
    return sid


def uids_of(name: str):
    out = mongo(f'const g = db["user.group"].findOne({{domainId: "{DOMAIN}", name: "{name}"}});'
                'print(g ? JSON.stringify(g.uids) : "MISSING");')
    return None if out == 'MISSING' else [int(x) for x in out.strip('[]').split(',') if x]


def main() -> int:
    mongo(f'db["user.group"].deleteMany({{domainId: "{DOMAIN}", name: "{NAME}"}});')
    sid = grant(TEACHER)
    failed = []

    def check(label, got, want):
        ok = got == want
        if not ok:
            failed.append(label)
        print(f'  [{"OK  " if ok else "FAIL"}] {label}: 期望 {want!r} / 实得 {got!r}')

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            ctx = browser.new_context(viewport={'width': 1440, 'height': 1000},
                                      device_scale_factor=2)
            ctx.add_cookies([{'name': 'sid', 'value': sid, 'domain': '127.0.0.1', 'path': '/'}])
            page = ctx.new_page()
            # 页面上有轮询（未读消息、任务状态），networkidle 永远不会触发
            page.set_default_timeout(15000)
            page.goto(f'{BASE}/group', wait_until='domcontentloaded')
            page.wait_for_selector('.dtoj-groups__lead')

            # 列表里可能还有别人的组，凡是要看「我这个组」的信息都走这个定位
            def own_card():
                return page.locator(f'.dtoj-groups__row:has(.dtoj-groups__name:text-is("{NAME}")) .dtoj-groups__meta')

            print('\n=== 顶栏与页面 ===')
            check('顶栏有「管理域」入口', page.locator('.nav__list--main a.nav__item', has_text='管理域').count(), 1)
            check('顶栏不再有「小组」入口', page.locator('.nav__list--main a.nav__item', has_text='小组').count(), 0)
            check('页面标题', page.locator('.section__title').inner_text(), '管理小组')
            # 不假设列表是空的：库里可能有别的组（别人建的、手动试出来的），
            # 只钉死「这个临时组现在还不存在」
            check('临时组还没建', page.locator(f'.dtoj-groups__name:text-is("{NAME}")').count(), 0)
            page.screenshot(path=str(SHOT / 'group-1-list.png'), full_page=True)
            print(f'  截图 {SHOT}/group-1-list.png')

            print('\n=== 新建小组 ===')
            page.click('#dtoj-group-create-open')
            page.wait_for_selector('#dtoj-group-create:not([hidden])')
            check('弹层打开', page.locator('#dtoj-group-create').is_visible(), True)
            page.fill('#dtoj-group-create input[name=name]', NAME)
            page.screenshot(path=str(SHOT / 'group-2-create-dialog.png'), full_page=True)
            with page.expect_navigation(wait_until='domcontentloaded'):
                page.click('#dtoj-group-create button[type=submit]')
            page.wait_for_selector('.dtoj-groups__lead')
            check('建完回到列表', page.url.endswith('/group'), True)
            check('卡片出现', page.locator(f'.dtoj-groups__name:text-is("{NAME}")').count(), 1)
            check('库里也有了', uids_of(NAME), [])
            check('新组是 0 人', '还没有成员' in own_card().inner_text(), True)

            print('\n=== 编辑组员 ===')
            page.click(f'[data-group-edit="{NAME}"]')
            page.wait_for_selector('#dtoj-group-edit:not([hidden])')
            rows = page.locator('#dtoj-group-edit-list .dtoj-group-dialog__item')
            check('候选名单有内容', rows.count() > 5, True)
            check('候选里没有域管理员', page.locator('#dtoj-group-edit-list input[value="3"]').count(), 0)
            # 搜索：只留一个学生
            page.fill('#dtoj-group-edit-search', '韩家成')
            check('搜索把别人藏起来了', page.locator('#dtoj-group-edit-list .dtoj-group-dialog__item:visible').count(), 1)
            page.locator('#dtoj-group-edit-list .dtoj-group-dialog__item:visible input').check()
            check('按钮报了已选数', '1 人' in page.locator('#dtoj-group-edit-save').inner_text(), True)
            page.screenshot(path=str(SHOT / 'group-3-members-dialog.png'), full_page=True)
            with page.expect_navigation(wait_until='domcontentloaded'):
                page.click('#dtoj-group-edit-save')
            page.wait_for_selector('.dtoj-groups__lead')
            check('名单落库', uids_of(NAME), [16])
            check('卡片上显示 1 人', '1 人' in own_card().inner_text(), True)
            check('卡片上显示了名字', '韩家成' in own_card().inner_text(), True)
            page.screenshot(path=str(SHOT / 'group-4-saved.png'), full_page=True)
            print(f'  截图 {SHOT}/group-4-saved.png')

            print('\n=== 再打开时应带出已有的勾选 ===')
            page.click(f'[data-group-edit="{NAME}"]')
            page.wait_for_selector('#dtoj-group-edit:not([hidden])')
            check('已有组员是勾上的', page.locator('#dtoj-group-edit-list input[value="16"]').is_checked(), True)
            check('搜索框被重置', page.input_value('#dtoj-group-edit-search'), '')
            check('Esc 能关掉', (page.keyboard.press('Escape'),
                              page.locator('#dtoj-group-edit').is_visible())[1], False)

            print('\n=== 删除 ===')
            page.on('dialog', lambda d: d.accept())
            # 只点自己这一行的删除：列表里可能还有别人的组（比如手动试出来的），点第一行会误删
            with page.expect_navigation(wait_until='domcontentloaded'):
                page.click(f'.dtoj-groups__row:has(.dtoj-groups__name:text-is("{NAME}")) form button[type=submit]')
            page.wait_for_selector('.dtoj-groups__lead')
            check('组没了', uids_of(NAME), None)
            check('卡片也没了', page.locator(f'.dtoj-groups__name:text-is("{NAME}")').count(), 0)
            browser.close()
    finally:
        mongo(f'db.token.deleteMany({{_id: "{sid}"}});')
        mongo(f'db["user.group"].deleteMany({{domainId: "{DOMAIN}", name: "{NAME}"}});')

    print(f'\n{"全部通过" if not failed else "不通过：" + "、".join(failed)}')
    return 0 if not failed else 1


if __name__ == '__main__':
    sys.exit(main())
