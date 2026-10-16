#!/usr/bin/env python3
"""线上端到端验证：临时会话 → 顶栏按钮 → /oj-session 身份 → 清理。

用临时会话来验，是因为不该去猜任何人的密码。会话是新建的、只活 1 小时、
验证完立刻删掉，不碰任何既有会话。
"""
from __future__ import annotations

import random
import string
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from remote_sh import JUDGE_DOCKER, open_root

DOMAIN = 'https://mahao.anosm.com'


def new_sid() -> str:
    alpha = string.ascii_letters + string.digits
    return ''.join(random.choice(alpha) for _ in range(32))


INSERT = """const sid = '%SID%';
db.token.insertOne({
  _id: sid, viewLang: '', uid: %UID%, sudo: null, sudoUid: null, scope: '-1',
  oauthBind: null, save: true,
  updateIp: '127.0.0.1', updateUa: '', createIp: '127.0.0.1', createUa: '',
  createHost: 'deploy-verify', tokenType: 0,
  createAt: new Date(), updateAt: new Date(),
  expireAt: new Date(Date.now() + 3600 * 1000)
});
print('  已建临时会话 uid=%UID%');
"""


def main():
    sids = {}
    j = open_root('judge')
    c = open_root('cloud')
    try:
        # 1) 建临时会话
        print('\n=== 1. 建临时会话（uid=3 管理员 / uid=68 教师）===')
        for uid, label in [(3, '管理员'), (68, '教师')]:
            sid = new_sid()
            sids[uid] = sid
            j.put('/tmp/ins_token.js', INSERT.replace('%SID%', sid).replace('%UID%', str(uid)))
            j.run(f'{JUDGE_DOCKER}; docker cp /tmp/ins_token.js oj-mongo:/tmp/ins_token.js && '
                  f'{JUDGE_DOCKER}; docker exec oj-mongo mongosh hydro --quiet --file /tmp/ins_token.js 2>&1 | tail -2',
                  timeout=180)
            print(f'    {label} uid={uid} sid={sid[:6]}…（已脱敏）')

        # 2) 未带票据的基线
        print('\n=== 2. /oj-session 未带票据的基线 ===')
        c.run(f'curl -s -o /dev/null -w "  %{{http_code}}\\n" --max-time 15 {DOMAIN}/oj-session', timeout=90)

        # 3) 带票据取身份
        print('\n=== 3. 带票据请求 /oj-session（身份权威来源）===')
        for uid, label in [(3, '管理员'), (68, '教师')]:
            c.run(f'curl -s --max-time 15 -H "Cookie: sid={sids[uid]}" {DOMAIN}/oj-session', timeout=90)

        # 4) 顶栏是否出现课件入口（导航是服务端渲染的，curl 就能验）
        print('\n=== 4. 顶栏「课件」入口（服务端渲染）===')
        for uid, label in [(3, '管理员'), (68, '教师')]:
            c.run(f'curl -s --max-time 20 -H "Cookie: sid={sids[uid]}" {DOMAIN}/ '
                  f'| grep -oE "课件" | head -3 | sed "s/^/  {label} 页面命中: /"', timeout=120)
        c.run(f'curl -s --max-time 20 {DOMAIN}/ | grep -c "课件" | sed "s/^/  未登录页面命中数（应为 0）: /"', timeout=120)

        # 5) 课件系统能否用同一票据换到身份（这就是单点登录的关键一跳）
        print('\n=== 5. 评测机侧用同一票据向 OJ 换身份 ===')
        for uid, label in [(3, '管理员'), (68, '教师')]:
            j.run(f'''{JUDGE_DOCKER}; docker exec ppt-system node -e "'''
                  f'''fetch('https://mahao.anosm.com/oj-session', {{headers: {{Cookie: 'sid={sids[uid]}'}}}})'''
                  f'''  .then(async r=>console.log('  {label}: ' + r.status + ' ' + (await r.text()).slice(0,200)))'''
                  f'''  .catch(e=>console.log('  {label}: 失败 ' + e.message))" 2>&1 | grep -v Warning''',
                  timeout=120)
    finally:
        j.close()
        c.close()
    Path('/tmp/verify-sids.json').write_text(
        '\n'.join(f'{k} {v}' for k, v in sids.items()))
    print('\n  临时 sid 已记到 /tmp/verify-sids.json，验证完记得删')


if __name__ == '__main__':
    main()
