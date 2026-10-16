#!/usr/bin/env python3
"""本机小组管理的端到端验证：临时会话 → 各角色打一遍接口 → 查库核对 → 清理。

用临时会话是因为不该去猜任何人的密码。票据新建、只活 1 小时、验完就删。
只建/删自己造的那几条数据（名字一律带「验证用」），不碰任何既有分组和用户。

    python3 scripts/verify_group_admin.py
"""
from __future__ import annotations

import json
import random
import string
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = 'http://127.0.0.1'
DOMAIN = 'system'
TEACHER = 68          # lizhi，域内「教师」
OTHER_TEACHER = 69    # lichunfeng，用来验「别人的组动不了」
STUDENT = 16          # 域内学生
ADMIN = 3             # root

MINE = '验证用小组A'          # 教师自己建的
SPARE = '验证用小组B'         # 用来验删除
LEGACY = '验证用老组'         # 手工插的「没有 owner 的老数据」，模拟加字段之前建的组
FAKE_DOC = 999001            # 挂 assign 用的假作业


def sh(*args: str) -> str:
    return subprocess.run(args, capture_output=True, text=True, check=False).stdout.strip()


def mongo(js: str) -> str:
    return sh('docker', 'exec', 'oj-mongo', 'mongosh', 'hydro', '--quiet', '--eval', js)


def new_sid() -> str:
    alpha = string.ascii_letters + string.digits
    return ''.join(random.choice(alpha) for _ in range(32))


def grant(uid: int) -> str:
    """给 uid 建一个只活 1 小时的会话票。"""
    sid = new_sid()
    mongo(f'''
db.token.insertOne({{
  _id: '{sid}', viewLang: '', uid: {uid}, sudo: null, sudoUid: null, scope: '-1',
  oauthBind: null, save: true,
  updateIp: '127.0.0.1', updateUa: '', createIp: '127.0.0.1', createUa: '',
  createHost: 'group-verify', tokenType: 0,
  createAt: new Date(), updateAt: new Date(),
  expireAt: new Date(Date.now() + 3600 * 1000)
}});
''')
    return sid


def uids_of(name: str):
    out = mongo(f'const g = db["user.group"].findOne({{domainId: "{DOMAIN}", name: "{name}"}});'
                'print(g ? JSON.stringify(g.uids) : "MISSING");')
    return None if out == 'MISSING' else [int(x) for x in out.strip('[]').split(',') if x]


def owner_of(name: str):
    out = mongo(f'const g = db["user.group"].findOne({{domainId: "{DOMAIN}", name: "{name}"}});'
                'print(g && g.owner ? String(g.owner) : "NONE");')
    return None if out == 'NONE' else int(out)


def groups_of(uid: int) -> list[str]:
    """这个 uid 当前在哪些组里。第 8 步会动它，所以先存一份，验完还原。"""
    out = mongo(f'print(JSON.stringify(db["user.group"].find({{domainId: "{DOMAIN}", uids: {uid}}})'
                '.toArray().map(g => g.name)));')
    return json.loads(out)


def restore_membership(uid: int, names: list[str]) -> None:
    """直接把组籍还原成 names。不复用 applyUserGroups，免得验证脚本依赖被验证的东西。"""
    quoted = ', '.join(f'"{n}"' for n in names)
    mongo(f'db["user.group"].updateMany({{domainId: "{DOMAIN}", name: {{$in: [{quoted}]}}}}, '
          f'{{$addToSet: {{uids: {uid}}}}});')
    mongo(f'db["user.group"].updateMany({{domainId: "{DOMAIN}", name: {{$nin: [{quoted}]}}}}, '
          f'{{$pull: {{uids: {uid}}}}});')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """不跟 302：要验的就是「该跳转的时候跳没跳」。"""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D102
        return None


OPENER = urllib.request.build_opener(NoRedirect)


class Client:
    def __init__(self, sid: str = ''):
        self.sid = sid

    def req(self, method: str, path: str, form=None):
        data = None
        headers = {}
        if form is not None:
            data = urllib.parse.urlencode(form, doseq=True).encode()
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
        if self.sid:
            headers['Cookie'] = f'sid={self.sid}'
        req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
        try:
            with OPENER.open(req) as res:
                return res.status, res.read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode('utf-8', 'replace')

    def get(self, path: str):
        return self.req('GET', path)

    def post(self, path: str, form):
        return self.req('POST', path, form)


FAILED = []


def check(label: str, got, want, note: str = ''):
    good = got == want
    if not good:
        FAILED.append(label)
    print(f'  [{"OK  " if good else "FAIL"}] {label}: 期望 {want!r} / 实得 {got!r} {note}')


def cleanup() -> None:
    for n in (MINE, SPARE, LEGACY):
        mongo(f'db["user.group"].deleteMany({{domainId: "{DOMAIN}", name: "{n}"}});')
    mongo(f'db.document.deleteOne({{domainId: "{DOMAIN}", docId: NumberInt({FAKE_DOC})}});')


def main() -> int:
    cleanup()
    # 手工插一条没有 owner 的组，模拟加 owner 字段之前就存在的老数据
    mongo(f'db["user.group"].insertOne({{domainId: "{DOMAIN}", name: "{LEGACY}", uids: [3]}});')

    sids = {uid: grant(uid) for uid in (TEACHER, OTHER_TEACHER, STUDENT, ADMIN)}
    teacher, other = Client(sids[TEACHER]), Client(sids[OTHER_TEACHER])
    student, admin = Client(sids[STUDENT]), Client(sids[ADMIN])
    anon = Client()
    # 第 8 步的自助加入会把「我在哪些组」整体对齐成勾选集，会连带摘掉学生在别的组里的组籍。
    # 那是既有语义（不是这次改出来的），但验证脚本不该留下痕迹，所以先记一份、finally 里还原。
    membership_backup = groups_of(STUDENT)

    try:
        print('\n=== 1. 路由门槛 ===')
        check('教师 GET /group', teacher.get('/group')[0], 200)
        check('管理员 GET /group', admin.get('/group')[0], 200)
        code, body = student.get('/group')
        check('学生 GET /group 被挡', code, 403, body[:44].replace('\n', ' '))
        check('未登录 GET /group 转登录页', anon.get('/group')[0], 302)
        code, body = student.post('/group/create', {'name': MINE})
        check('学生建组被挡', code, 403, body[:32].replace('\n', ' '))
        check('学生建组没落库', uids_of(MINE), None)

        print('\n=== 2. 建组 ===')
        code, _ = teacher.post('/group/create', {'name': MINE})
        check('教师建组跳回列表', code, 302)
        check('owner 落成建组人', owner_of(MINE), TEACHER)
        check('新建的组是空名单', uids_of(MINE), [])
        code, _ = teacher.post('/group/create', {'name': MINE})
        check('重名被拒', code, 403)
        edit = mongo(f'const g = db["user.group"].findOne({{domainId: "{DOMAIN}", name: "{MINE}"}});'
                     'print(g.owner + "/" + JSON.stringify(g.uids));')
        check('重名那次没把已有组改坏', edit, f'{TEACHER}/[]')
        check('纯数字组名被拒（会和按人布置撞车）', teacher.post('/group/create', {'name': '16'})[0], 403)
        check('撞没有 owner 的老组被拒', teacher.post('/group/create', {'name': LEGACY})[0], 403)
        check('老组没被抢走', owner_of(LEGACY), None)

        print('\n=== 3. 组员增删 ===')
        code, _ = teacher.post('/group/members', {'name': MINE, 'uids': [str(STUDENT)]})
        check('教师加学生跳回列表', code, 302)
        check('名单生效', uids_of(MINE), [STUDENT])
        teacher.post('/group/members', {'name': MINE, 'uids': [str(STUDENT), str(ADMIN)]})
        check('加域管理员被丢出去', uids_of(MINE), [STUDENT])
        teacher.post('/group/members', {'name': MINE, 'uids': [str(STUDENT), str(OTHER_TEACHER)]})
        check('另一位教师可以加（对方没有域管理权限）', uids_of(MINE), [STUDENT, OTHER_TEACHER])
        teacher.post('/group/members', {'name': MINE, 'uids': []})
        check('清空组员', uids_of(MINE), [])

        print('\n=== 4. 越权 ===')
        code, body = other.post('/group/members', {'name': MINE, 'uids': [str(OTHER_TEACHER)]})
        check('另一位教师改不了我的组', code, 403, body[:32].replace('\n', ' '))
        code, body = teacher.post('/group/members', {'name': LEGACY, 'uids': [str(STUDENT)]})
        check('教师改不了没有 owner 的老组', code, 403, body[:32].replace('\n', ' '))
        check('老组名单没被动', uids_of(LEGACY), [3])
        code, _ = teacher.post('/group/delete', {'name': LEGACY})
        check('教师删不了没有 owner 的老组', code, 403)
        code, _ = teacher.post('/group/members', {'name': '根本没这个组', 'uids': []})
        check('不存在的组按没权限处理', code, 403)

        print('\n=== 5. 删除 ===')
        teacher.post('/group/create', {'name': SPARE})
        mongo(f'''
db.document.insertOne({{
  docType: 30, domainId: "{DOMAIN}", docId: NumberInt({FAKE_DOC}), owner: {ADMIN},
  title: "验证用作业", content: "", rule: "homework", assign: ["{SPARE}"],
  beginAt: new Date(), endAt: new Date(Date.now() + 86400000), pids: [],
  penaltySince: new Date(), penaltyRules: [], maintainer: []
}});
''')
        code, body = teacher.post('/group/delete', {'name': SPARE})
        check('有作业在用就拦下', code, 403, body[:60].replace('\n', ' '))
        check('拦下时组还在', uids_of(SPARE), [])
        mongo(f'db.document.deleteOne({{domainId: "{DOMAIN}", docId: NumberInt({FAKE_DOC})}});')
        check('没人用了删得掉', teacher.post('/group/delete', {'name': SPARE})[0], 302)
        check('组真没了', uids_of(SPARE), None)

        print('\n=== 6. 管理员（PERM_MANAGE_GROUP_ALL 走 root 兜底）===')
        code, body = admin.get('/group')
        check('管理员看得到没有 owner 的老组', LEGACY in body, True)
        check('管理员能改老组', admin.post('/group/members', {'name': LEGACY, 'uids': ['3', str(STUDENT)]})[0], 302)
        check('老组名单被改了', uids_of(LEGACY), [3, STUDENT])
        code, _ = admin.post('/group/create', {'name': '16'})
        check('纯数字组名对管理员一样拒', code, 403)

        print('\n=== 7. 顶栏入口 ===')
        check('教师顶栏有「小组」', '小组' in teacher.get('/')[1], True)
        check('学生顶栏没有「小组」', '小组' not in student.get('/')[1], True)

        print('\n=== 8. 学生自助加入没被改坏（这次改成原子增删）===')
        teacher.post('/group/members', {'name': MINE, 'uids': []})
        check('学生自助加入跳转', student.post(f'/user/{STUDENT}/group', {'groups': [MINE]})[0], 302)
        check('学生进了组', uids_of(MINE), [STUDENT])
        student.post(f'/user/{STUDENT}/group', {'groups': []})
        check('学生退组', uids_of(MINE), [])
    finally:
        mongo(f'db.token.deleteMany({{_id: {{$in: [{", ".join(repr(s) for s in sids.values())}]}}}});')
        restore_membership(STUDENT, membership_backup)
        cleanup()

    print(f'\n{"全部通过" if not FAILED else "不通过：" + "、".join(FAILED)}')
    return 0 if not FAILED else 1


if __name__ == '__main__':
    sys.exit(main())
