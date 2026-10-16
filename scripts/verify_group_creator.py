#!/usr/bin/env python3
"""创建者展示的浏览器验证：学生弹层里的建组人标签 + 教师页的创建者与筛选。

临时会话，跑完删干净，不动任何既有分组。

    python3 scripts/verify_group_creator.py
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
TEACHER = 68       # lizhi，教师角色
ADMIN = 3          # hsl，域 root
STUDENT = 16       # 韩家成，学生角色
SHOT = Path('/tmp')
MINE = '验证用创建者甲'
OTHER = '验证用创建者乙'


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
  createHost: 'group-creator-verify', tokenType: 0,
  createAt: new Date(), updateAt: new Date(),
  expireAt: new Date(Date.now() + 3600 * 1000)
}});
''')
    return sid


def cleanup() -> None:
    mongo(f'db.token.deleteMany({{createHost: "group-creator-verify"}});')
    mongo(f'db["user.group"].deleteMany({{domainId: "{DOMAIN}", name: {{$in: ["{MINE}", "{OTHER}"]}}}});')


def page_for(ctx, uid: int):
    sid = grant(uid)
    ctx.add_cookies([{'name': 'sid', 'value': sid, 'domain': '127.0.0.1', 'path': '/'}])
    return ctx.new_page()


def main() -> int:
    cleanup()
    failed = []

    def check(label, got, want):
        ok = got == want
        if not ok:
            failed.append(label)
        print(f'  [{"OK  " if ok else "FAIL"}] {label}: 期望 {want!r} / 实得 {got!r}')

    # 甲归 lizhi（教师），乙挂在一个「管理员建的老组」名下没有的情形 —— 直接造 owner=3
    mongo(f'''db["user.group"].updateOne({{domainId: "{DOMAIN}", name: "{MINE}"}},
      {{$set: {{name: "{MINE}", owner: {TEACHER}, uids: [], maintainers: []}}}}, {{upsert: true}});''')
    mongo(f'''db["user.group"].updateOne({{domainId: "{DOMAIN}", name: "{OTHER}"}},
      {{$set: {{name: "{OTHER}", owner: 3, uids: [], maintainers: []}}}}, {{upsert: true}});''')

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            ctx = browser.new_context(viewport={'width': 1440, 'height': 1000},
                                      device_scale_factor=2)
            ctx.set_default_timeout(15000)

            print('\n=== 学生：个人主页「加入分组」弹层 ===')
            page = page_for(ctx, STUDENT)
            page.goto(f'{BASE}/user/{STUDENT}', wait_until='domcontentloaded')
            page.wait_for_selector('#dtoj-group-open')
            page.click('#dtoj-group-open')
            page.wait_for_selector('#dtoj-group-dialog:not([hidden])')
            rows = page.locator('#dtoj-group-dialog .dtoj-group-dialog__item')
            check('弹层里有分组', rows.count() > 0, True)
            labels = page.locator('#dtoj-group-dialog .dtoj-group-dialog__sub')
            check('每行都有建组人标签', labels.count(), rows.count())
            texts = [labels.nth(i).inner_text() for i in range(labels.count())]
            check('教师建的组标成教师', 'lizhi（教师）' in texts, True)
            check('管理员建的组标成管理员', '管理员' in texts, True)
            check('老组（无 owner）标成管理员',
                  page.locator('#dtoj-group-dialog .dtoj-group-dialog__item',
                               has_text='GESP六级').locator('.dtoj-group-dialog__sub').inner_text(),
                  '管理员')
            page.screenshot(path=str(SHOT / 'creator-1-student.png'), full_page=True)

            print('\n=== 学生：弹层按创建者筛选 ===')
            chips = page.locator('#dtoj-group-dialog [data-group-creator-filter]')
            chip_labels = [chips.nth(i).inner_text() for i in range(chips.count())]
            check('第一项是「全部」', chip_labels[0] if chip_labels else None, '全部')
            row_creators = {rows.nth(i).get_attribute('data-creator') for i in range(rows.count())}
            check('筛选项与列表里的创建者一一对应', set(chip_labels[1:]), row_creators)
            check('教师与管理员都进得来', {'lizhi（教师）', '管理员'} <= set(chip_labels), True)
            total_rows = rows.count()
            check('默认不筛，全部可见',
                  page.locator('#dtoj-group-dialog .dtoj-group-dialog__item:visible').count(), total_rows)

            # 先勾一个教师建的组，再筛到管理员：它应该只是被藏起来，勾还在，
            # 保存时照旧提交 —— 筛选不该顺手把人退组。
            teacher_rows = page.locator('#dtoj-group-dialog .dtoj-group-dialog__item[data-creator="lizhi（教师）"]')
            teacher_rows.first.locator('input[type=checkbox]').check()
            page.click('#dtoj-group-dialog [data-group-creator-filter="lizhi（教师）"]')
            check('筛到教师：只剩教师建的可见',
                  page.locator('#dtoj-group-dialog .dtoj-group-dialog__item:visible').count(),
                  teacher_rows.count())
            check('筛到教师：管理员建的都藏起来',
                  page.locator('#dtoj-group-dialog .dtoj-group-dialog__item:visible[data-creator="管理员"]').count(), 0)
            page.screenshot(path=str(SHOT / 'creator-5-student-filtered.png'), full_page=True)

            page.click('#dtoj-group-dialog [data-group-creator-filter="管理员"]')
            check('筛到管理员：教师那个组只是藏起来，勾还在',
                  teacher_rows.first.locator('input[type=checkbox]').is_checked(), True)
            check('筛到管理员：可见行里没有教师建的',
                  page.locator('#dtoj-group-dialog .dtoj-group-dialog__item:visible[data-creator="lizhi（教师）"]').count(), 0)

            page.click('#dtoj-group-dialog [data-group-creator-filter=""]')
            check('切回全部：都回来了',
                  page.locator('#dtoj-group-dialog .dtoj-group-dialog__item:visible').count(), total_rows)
            teacher_rows.first.locator('input[type=checkbox]').uncheck()
            page.close()

            print('\n=== 教师：小组管理页（只看得到自己的组）===')
            page = page_for(ctx, TEACHER)
            page.goto(f'{BASE}/group', wait_until='domcontentloaded')
            page.wait_for_selector('.dtoj-groups__head h1')
            check('甲在列表里',
                  page.locator(f'.dtoj-groups__row[data-creator="lizhi（教师）"]',
                               has_text=MINE).count(), 1)
            check('乙不在（管理员的老组归管理员，教师管不着）',
                  page.locator('.dtoj-groups__row', has_text=OTHER).count(), 0)
            mine = page.locator('.dtoj-groups__row', has_text=MINE)
            check('卡片上写了创建者', 'lizhi（教师） 创建' in mine.inner_text(), True)
            # 名下全是自己建的，创建者只有一种，筛选没意义 → 不给下拉
            check('只有一种创建者时不显示筛选下拉',
                  page.locator('#dtoj-group-creator-filter').count(), 0)
            page.screenshot(path=str(SHOT / 'creator-2-teacher.png'), full_page=True)
            page.close()

            print('\n=== 管理员：看得到全部组，筛选才是真需求 ===')
            page = page_for(ctx, ADMIN)
            page.goto(f'{BASE}/group', wait_until='domcontentloaded')
            page.wait_for_selector('.dtoj-groups__head h1')
            options = page.locator('#dtoj-group-creator-filter option')
            check('筛选下拉在', options.count() > 1, True)
            opts = [options.nth(i).inner_text() for i in range(options.count())]
            check('下拉里有教师这个选项', 'lizhi（教师）' in opts, True)
            check('下拉里有管理员这个选项', '管理员' in opts, True)
            total = page.locator('.dtoj-groups__row').count()
            check('没筛选时列出全部', page.locator('.dtoj-groups__row:visible').count(), total)
            page.screenshot(path=str(SHOT / 'creator-3-admin.png'), full_page=True)

            print('\n=== 筛选：只留 lizhi（教师）建的 ===')
            page.select_option('#dtoj-group-creator-filter', 'lizhi（教师）')
            visible = page.locator('.dtoj-groups__row:visible')
            check('剩下的是教师建的', visible.count(),
                  page.locator('.dtoj-groups__row[data-creator="lizhi（教师）"]').count())
            check('管理员建的一个都没留',
                  page.locator('.dtoj-groups__row:visible[data-creator="管理员"]').count(), 0)
            check('确实少了一些', visible.count() < total, True)
            page.screenshot(path=str(SHOT / 'creator-4-filtered.png'), full_page=True)

            print('\n=== 切回「全部创建者」 ===')
            page.select_option('#dtoj-group-creator-filter', '')
            check('全都回来了', page.locator('.dtoj-groups__row:visible').count(), total)
            browser.close()
    finally:
        cleanup()

    print(f'\n{"全部通过" if not failed else "不通过：" + "、".join(failed)}')
    return 0 if not failed else 1


if __name__ == '__main__':
    sys.exit(main())
