#!/usr/bin/env python3
"""把课件系统（含子路径 /ppt 与 OJ 单点登录）部署到线上。

分三步走，可分别执行：
    phase1  评测机：备份 → 拉新代码 → 迁移文件布局与 schema → 重建镜像 → 起容器
    phase2  云主机：OJ 后端增量更新 + nginx 加 /ppt 转发
    verify  端到端验收

顺序有意为之：phase1 只在评测机内部生效，外部无感；phase2 把 OJ 与 nginx
紧挨着做完，尽量缩短「顶栏有课件按钮但 /ppt 还 404」的窗口。
"""
from __future__ import annotations

import base64
import secrets
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from remote_sh import CLOUD_SRC, JUDGE_DOCKER, JUDGE_SRC, open_root

LOCAL_REPO = Path('/Users/hanshilin/Desktop/hanshilin/magao/NOI/网站/ppt-system')
OJ_REPO = Path('/Users/hanshilin/Desktop/hanshilin/magao/NOI/Hydro-magao')
# 发布必须以已提交的版本为准，不能拿工作区文件去发：
# 工作区里常有别的、未提交的进行中改动，一旦混进来就发到了线上。
OJ_REF = 'origin/master'


def oj_file_text(rel: str) -> str:
    """取 OJ 仓库某个 ref 下该文件的内容（默认 origin/master）。

    刻意读 git 里的版本而不是磁盘上的工作区文件：工作区可能混着无关的
    WIP 改动，直接发上去等于把没审过的代码推到了线上。
    """
    out = subprocess.run(['git', '-C', str(OJ_REPO), 'show', f'{OJ_REF}:{rel}'],
                         capture_output=True, text=True, check=True)
    return out.stdout
PPT_GIT = '/home/dev/ppt-system-git'
PPT_DATA = '/data/ppt-system'
BASE = '/ppt'
DOMAIN = 'https://mahao.anosm.com'
JUDGE_IP = '60.191.137.194'

# 本次要发到云主机的文件（相对仓库根）
OJ_FILES = [
    'packages/dtoj-ui/index.ts',
    'packages/ui-default/templates/partials/nav.html',
]

NGINX_CONF = '/usr/local/openresty/nginx/conf/conf.d/mahao.anosm.com.conf'

# 在云主机上执行：给 80 与 443 两个 server 块各加一段 /ppt 转发。
# location = /ppt 的精确匹配是必要的：只写 location /ppt/ 时，
# 浏览器访问 /ppt（无斜杠）会先吃一个 301 到 /ppt/，多一跳且容易和 OJ 的
# 路由撞在一起；精确匹配直接转给上游，由上游自己决定怎么处理。
NGINX_PATCHER = '''from pathlib import Path

CONF = Path('%CONF%')
src = CONF.read_text()

BLOCK = """    location = /ppt {
        proxy_pass http://%JUDGE_IP%:3456;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 600s;
    }
    location /ppt/ {
        proxy_pass http://%JUDGE_IP%:3456;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 600s;
    }
"""

if 'location /ppt/' in src:
    print('  已存在，跳过')
else:
    out = src.replace('    location / {\\n', BLOCK + '    location / {\\n')
    n = out.count('location /ppt/')
    assert n == 2, '期望插入 2 处，实际 ' + str(n)
    CONF.write_text(out)
    print('  已插入 ' + str(n) + ' 处')
'''.replace('%CONF%', NGINX_CONF)


def head(title: str) -> None:
    print(f'\n{"=" * 74}\n{title}\n{"=" * 74}')


def compose_file(secret: str) -> str:
    """线上 compose：子路径 /ppt + 用 OJ 换身份。数据仍 bind mount 到 /data/ppt-system。"""
    return f'''# ppt-system 挂在 OJ 同域子路径 /ppt 下，身份经 OJ 的 /oj-session 换取。
#   DOCKER_HOST=unix:///data/oj-docker/docker.sock
#   host 网络 + PORT=3456，数据沿用 /data/ppt-system
#
# 两个容易踩的点：
#   - NEXT_PUBLIC_BASE_PATH 是**构建期内联**的，改它必须重建镜像（不是在 env 里改一下就行）。
#   - 整个 prisma 目录被挂进容器，会盖掉镜像里的 prisma/schema.prisma，
#     所以宿主机那份 schema 必须与代码同步更新，否则启动时的 `prisma db push` 用的是旧 schema。
services:
  ppt-system:
    image: ppt-system-ppt-system:latest
    container_name: ppt-system
    restart: unless-stopped
    network_mode: host
    environment:
      - NODE_ENV=production
      - PORT=3456
      - DATABASE_URL=file:./dev.db
      - NEXT_PUBLIC_BASE_PATH={BASE}
      # next-auth 的 NEXTAUTH_URL 在有 basePath 时要写到 /api/auth 为止，
      # 写成 {DOMAIN}{BASE} 会让 signin/callback 地址少一层，登录静默失败。
      - NEXTAUTH_URL={DOMAIN}{BASE}/api/auth
      - NEXTAUTH_SECRET={secret}
      # 评测机到 OJ 的 8899 只绑在云主机回环上，走不了内网服务名，只能用对外域名。
      - OJ_INTERNAL_URL={DOMAIN}
    volumes:
      - {PPT_DATA}/prisma:/app/prisma
      - {PPT_DATA}/uploads:/app/uploads
'''


def phase1():
    """评测机：课件系统本体。外部无感，做完 /ppt 之前不会有人看到变化。"""
    j = open_root('judge')
    ts = j.run('date +%Y%m%d_%H%M%S', quiet=True)[0].strip().splitlines()[-1]
    secret = secrets.token_urlsafe(48)
    print(f'  本次时间戳 {ts}')
    try:
        head('1.1 备份（数据库、schema、compose、旧文件布局、旧授权表）')
        j.run(f'mkdir -p {PPT_DATA}/_backup', quiet=True)
        j.run(f'\\cp -af {PPT_DATA}/prisma/dev.db {PPT_DATA}/_backup/dev.db.{ts}', timeout=120)
        j.run(f'\\cp -af {PPT_DATA}/prisma/schema.prisma {PPT_DATA}/_backup/schema.prisma.{ts}', timeout=60)
        j.run(f'\\cp -af {PPT_GIT}/docker-compose.oj.yml {PPT_DATA}/_backup/docker-compose.oj.yml.{ts}', timeout=60)
        j.run(f'\\cp -af {PPT_DATA}/public-uploads {PPT_DATA}/_backup/public-uploads.{ts}', timeout=600)
        # 用脚本文件而不是 node -e：远程 shell 会把 $queryRawUnsafe 的 $ 当变量吃掉
        j.put('/tmp/dump_grants.js',
              "const { PrismaClient } = require('@prisma/client');\n"
              "const p = new PrismaClient();\n"
              "(async () => {\n"
              "  const r = await p.$queryRawUnsafe('select A,B from _UserPermissions');\n"
              "  console.log(JSON.stringify(r));\n"
              "  await p.$disconnect();\n"
              "})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });\n")
        j.run(f'{JUDGE_DOCKER}; docker cp /tmp/dump_grants.js ppt-system:/app/dump_grants.js && '
              f'{JUDGE_DOCKER}; docker exec -w /app ppt-system node dump_grants.js '
              f'> {PPT_DATA}/_backup/grants.{ts}.json', timeout=120, quiet=True)
        j.run(f'ls -la {PPT_DATA}/_backup/ | tail -8', timeout=60)
        j.run(f'cat {PPT_DATA}/_backup/grants.{ts}.json', timeout=30)

        head('1.2 拉取新代码')
        j.run(f'cd {PPT_GIT} && git fetch origin && git checkout main && '
              f'git pull --ff-only origin main && git log --oneline -1', timeout=600)

        head('1.3 停旧容器，迁移文件布局 public-uploads → uploads/files')
        j.run(f'{JUDGE_DOCKER}; docker rm -f ppt-system', timeout=180)
        j.run(f'mkdir -p {PPT_DATA}/uploads/files', timeout=60)
        j.run(f'\\cp -af {PPT_DATA}/public-uploads/. {PPT_DATA}/uploads/files/', timeout=900)
        j.run(f'echo -n "  新根下 pptx 数: "; find {PPT_DATA}/uploads/files -name "*.pptx" | wc -l; '
              f'echo -n "  旧根下 pptx 数: "; find {PPT_DATA}/public-uploads -name "*.pptx" | wc -l', timeout=300)
        j.run(f'mv {PPT_DATA}/public-uploads {PPT_DATA}/public-uploads.old-{ts}', timeout=120)
        j.run(f'ls -la {PPT_DATA}/', timeout=60)

        head('1.4 同步 schema.prisma 与 compose（prisma 目录是整体挂载的，会盖掉镜像里的）')
        j.run(f'\\cp -af {PPT_GIT}/prisma/schema.prisma {PPT_DATA}/prisma/schema.prisma', timeout=60)
        j.run(f'grep -c ownerId {PPT_DATA}/prisma/schema.prisma', timeout=60)
        j.put(f'{PPT_GIT}/docker-compose.oj.yml', compose_file(secret))
        j.run(f'cat {PPT_GIT}/docker-compose.oj.yml', timeout=60)

        head('1.5 重建镜像（NEXT_PUBLIC_BASE_PATH 是构建期内联，必须在这步注入）')
        j.run(f'{JUDGE_DOCKER}; docker pull node:20-slim', timeout=1800, max_lines=10)
        j.run(f'{JUDGE_DOCKER}; cd {PPT_GIT} && docker build '
              f'--build-arg NEXT_PUBLIC_BASE_PATH={BASE} -t ppt-system-ppt-system:latest . 2>&1 | tail -25',
              timeout=3600, max_lines=30)
        j.run(f'{JUDGE_DOCKER}; docker images | grep -E "ppt|REPOSITORY"', timeout=60)

        head('1.6 启动新容器')
        j.run(f'{JUDGE_DOCKER}; cd {PPT_GIT} && docker compose -f docker-compose.oj.yml up -d 2>&1 | tail -5',
              timeout=300)
    finally:
        j.close()
    return ts, secret


def phase1_verify(ts: str):
    """评测机本地验收：容器起来了、库迁好了、课件还在、子路径能出认证端点。"""
    j = open_root('judge')
    try:
        head('1.7 评测机本地验收')
        j.run(f'{JUDGE_DOCKER}; sleep 25; docker ps --filter name=ppt-system --format "{{{{.Status}}}}"', timeout=180)
        j.run(f'{JUDGE_DOCKER}; docker logs --tail 30 ppt-system 2>&1', timeout=120, max_lines=34)
        j.run('curl -s -o /dev/null -w "  /ppt/login -> %{http_code}\\n" --max-time 10 http://127.0.0.1:3456/ppt/login', timeout=60)
        j.run('curl -s --max-time 10 http://127.0.0.1:3456/ppt/api/auth/providers', timeout=60)
        print('  --- 库结构 ---')
        j.run(f'{JUDGE_DOCKER}; docker cp /tmp/probe.js ppt-system:/app/probe.js; '
              f'{JUDGE_DOCKER}; docker exec -w /app ppt-system node probe.js', timeout=180, max_lines=40)
    finally:
        j.close()


def phase2():
    """云主机：OJ 后端增量更新 + nginx 加 /ppt 转发，紧挨着做完。"""
    c = open_root('cloud')
    try:
        head('2.1 备份要被覆盖的文件')
        c.run(f'cd {CLOUD_SRC} && mkdir -p /root/deploy-backup && '
              + ' && '.join(f'\\cp -af {f} /root/deploy-backup/$(echo {f} | tr / _)' for f in OJ_FILES),
              timeout=120)
        c.run(f'\\cp -af {NGINX_CONF} {NGINX_CONF}.bak.deploy 2>&1; ls -la /root/deploy-backup/ | tail -4', timeout=60)

        head(f'2.2 传本次改动的文件到云主机（取自 {OJ_REF}，不是工作区）')
        for rel in OJ_FILES:
            content = oj_file_text(rel)
            local_size = len(content.encode('utf-8'))
            c.put(f'{CLOUD_SRC}/{rel}', content, timeout=300)
            remote_size = c.run(f'wc -c < {CLOUD_SRC}/{rel}', quiet=True)[0].strip().splitlines()[-1].strip()
            ok = '一致' if remote_size == str(local_size) else f'不一致（本地 {local_size}）'
            print(f'  {rel}: {remote_size} 字节 {ok}')
        c.run(f'grep -c dtoj_courseware {CLOUD_SRC}/packages/dtoj-ui/index.ts', timeout=60)
        c.run(f'grep -c "item.args.href" {CLOUD_SRC}/packages/ui-default/templates/partials/nav.html', timeout=60)

        head('2.3 拷进容器并编译、重启')
        c.run(' && '.join(
            f'docker cp {CLOUD_SRC}/{f} oj-backend:/opt/hydro/{f}' for f in OJ_FILES), timeout=300)
        c.run('docker exec oj-backend bash -lc "cd /opt/hydro && yarn build 2>&1 | tail -5"',
              timeout=7200, max_lines=8)
        c.run('docker exec oj-backend bash -lc "cd /opt/hydro && yarn build:ui:production 2>&1 | tail -5"',
              timeout=7200, max_lines=8)
        c.run('docker exec oj-backend pm2 restart hydrooj', timeout=300, max_lines=20)
        c.run('sleep 12; curl -s -o /dev/null -w "  本机 /status -> %{http_code}\\n" --max-time 15 http://127.0.0.1:8899/status', timeout=120)
        c.run('curl -s -o /dev/null -w "  本机 /oj-session -> %{http_code}\\n" --max-time 15 http://127.0.0.1:8899/oj-session', timeout=120)

        head('2.4 nginx 加 /ppt 转发（80 与 443 两个 server 块都要加）')
        # 用「写文件再执行」而不是 heredoc：helper 会在命令最后追加哨兵，
        # 那会把 heredoc 的终止符行改掉，shell 一直读下去直接挂死。
        c.put('/tmp/patch_nginx.py', NGINX_PATCHER.replace('%JUDGE_IP%', JUDGE_IP))
        c.run('python3 /tmp/patch_nginx.py', timeout=120)
        c.run(f'grep -n "location" {NGINX_CONF}', timeout=60)
        c.run('/usr/local/openresty/bin/openresty -t 2>&1', timeout=120)
        c.run('/usr/local/openresty/bin/openresty -s reload 2>&1; sleep 2; echo "  reload 完成"', timeout=120)
    finally:
        c.close()


def redeploy_oj():
    """把云主机上的 OJ 文件重新对齐到已提交版本，再编译重启。

    起因：第一次发布我用了工作区文件，把一行未提交的「作业」入口带上了线。
    这一步只重传 + 重编译，nginx 不用动。
    """
    c = open_root('cloud')
    try:
        head(f'2.5 重新对齐到 {OJ_REF}（剥掉工作区里混进来的未提交改动）')
        for rel in OJ_FILES:
            content = oj_file_text(rel)
            local_size = len(content.encode('utf-8'))
            c.put(f'{CLOUD_SRC}/{rel}', content, timeout=300)
            remote_size = c.run(f'wc -c < {CLOUD_SRC}/{rel}', quiet=True)[0].strip().splitlines()[-1].strip()
            print(f'  {rel}: {remote_size} 字节（本地 {local_size}）'
                  f'{"  一致" if remote_size == str(local_size) else "  不一致!"}')
        # 断言线上不该再有那个未提交的入口，同时课件入口必须还在
        c.run(f'grep -c homework_main {CLOUD_SRC}/packages/dtoj-ui/index.ts '
              f'|| echo "  0（已无 WIP 入口，符合预期）"', timeout=60)
        c.run(f'grep -c dtoj_courseware {CLOUD_SRC}/packages/dtoj-ui/index.ts', timeout=60)
        c.run(' && '.join(
            f'docker cp {CLOUD_SRC}/{f} oj-backend:/opt/hydro/{f}' for f in OJ_FILES), timeout=300)
        c.run(f'docker exec oj-backend sh -lc "grep -c homework_main /opt/hydro/packages/dtoj-ui/index.ts '
              f'|| echo 0"', timeout=60)
        c.run('docker exec oj-backend bash -lc "cd /opt/hydro && yarn build 2>&1 | tail -3"',
              timeout=7200, max_lines=6)
        c.run('docker exec oj-backend bash -lc "cd /opt/hydro && yarn build:ui:production 2>&1 | tail -3"',
              timeout=7200, max_lines=6)
        c.run('docker exec oj-backend pm2 restart hydrooj', timeout=300, max_lines=12)
        c.run('sleep 12; curl -s -o /dev/null -w "  本机 /status -> %{http_code}\\n" --max-time 15 '
              'http://127.0.0.1:8899/status', timeout=120)
    finally:
        c.close()


def verify():
    """端到端验收（从本机发、也从一个第三方视角发）。"""
    c = open_root('cloud')
    try:
        head('3.1 云主机侧外部可达性')
        for url, want in [(f'{DOMAIN}/status', 200), (f'http://mahao.anosm.com/status', 200),
                          (f'{DOMAIN}/oj-session', 401), (f'{DOMAIN}{BASE}/login', 200),
                          (f'{DOMAIN}{BASE}/api/auth/providers', 200)]:
            c.run(f'curl -s -o /dev/null -w "  {url} -> %{{http_code}}\\n" --max-time 15 {url}', timeout=90)
        head('3.2 /oj-session 的响应体与缓存头（未带票据）')
        c.run(f'curl -s -D - -o /dev/null --max-time 15 {DOMAIN}/oj-session | grep -iE "^HTTP|^cache-control"', timeout=90)
        c.run(f'curl -s --max-time 15 {DOMAIN}/oj-session', timeout=90)
        head('3.3 认证端点里的 callbackUrl 是否含 /ppt 前缀（少一层就登录失败）')
        c.run(f'curl -s --max-time 15 {DOMAIN}{BASE}/api/auth/providers', timeout=90)
        head('3.4 容器')
        c.run('docker ps --format "  {{.Names}} | {{.Status}}"', timeout=60)
    finally:
        c.close()


def phase14(ts: str):
    """续跑 1.4~1.6：同步 schema 与 compose、重建镜像、起容器。

    单独抽出来是因为 1.1~1.3（备份、拉码、迁文件）都是幂等或一次性的，
    完成后再跑一遍没必要；而这几步才是真正让服务起来的部分。
    """
    j = open_root('judge')
    secret = secrets.token_urlsafe(48)
    try:
        head('1.4 同步 schema.prisma 与 compose（prisma 目录是整体挂载的，会盖掉镜像里的）')
        j.run(f'\\cp -af {PPT_GIT}/prisma/schema.prisma {PPT_DATA}/prisma/schema.prisma', timeout=60)
        j.run(f'grep -c ownerId {PPT_DATA}/prisma/schema.prisma', timeout=60)
        j.put(f'{PPT_GIT}/docker-compose.oj.yml', compose_file(secret))
        j.run(f'cat {PPT_GIT}/docker-compose.oj.yml', timeout=60)

        head('1.5 重建镜像（NEXT_PUBLIC_BASE_PATH 是构建期内联，必须在这步注入）')
        j.run(f'{JUDGE_DOCKER}; docker pull node:20-slim', timeout=1800, max_lines=8)
        j.run(f'{JUDGE_DOCKER}; cd {PPT_GIT} && docker build '
              f'--build-arg NEXT_PUBLIC_BASE_PATH={BASE} -t ppt-system-ppt-system:latest . 2>&1 | tail -20',
              timeout=5400, max_lines=26)
        j.run(f'{JUDGE_DOCKER}; docker images | grep -E "ppt|REPOSITORY"', timeout=60)

        head('1.6 启动新容器')
        j.run(f'{JUDGE_DOCKER}; cd {PPT_GIT} && docker compose -f docker-compose.oj.yml up -d 2>&1 | tail -5',
              timeout=300)
    finally:
        j.close()
    return secret


def phase15(ts: str):
    """收尾：补回被 db push 丢掉的旧授权，并去掉多余的 CA 变量后重建容器。

    db push 会 drop 掉 `_UserPermissions`（旧 schema 的隐式多对多），那 5 行对应到
    新 schema 就是 TaxonomyGrant，按用户×标签补回去。
    """
    j = open_root('judge')
    try:
        head('1.8 补回旧授权表里的 5 条（映射到新的 TaxonomyGrant）')
        j.put('/tmp/restore_grants.js',
              "const fs = require('fs');\n"
              "const { PrismaClient } = require('@prisma/client');\n"
              "const p = new PrismaClient();\n"
              "(async () => {\n"
              "  const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));\n"
              "  let n = 0;\n"
              "  for (const r of raw) {\n"
              "    await p.taxonomyGrant.upsert({\n"
              "      where: { userId_taxonomyId: { userId: r.B, taxonomyId: r.A } },\n"
              "      create: { userId: r.B, taxonomyId: r.A },\n"
              "      update: {},\n"
              "    });\n"
              "    n++;\n"
              "  }\n"
              "  console.log('  补回 ' + n + ' 条，TaxonomyGrant 现有 ' + (await p.taxonomyGrant.count()) + ' 条');\n"
              "  await p.$disconnect();\n"
              "})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });\n")
        j.run(f'{JUDGE_DOCKER}; docker cp /tmp/restore_grants.js ppt-system:/app/restore_grants.js && '
              f'{JUDGE_DOCKER}; docker exec -w /app ppt-system node restore_grants.js '
              f'{PPT_DATA}/_backup/grants.{ts}.json 2>&1 | grep -v Warning', timeout=180)

        head('1.9 去掉多余的 NODE_EXTRA_CA_CERTS，重建容器')
        secret = secrets.token_urlsafe(48)
        j.put(f'{PPT_GIT}/docker-compose.oj.yml', compose_file(secret))
        j.run(f'{JUDGE_DOCKER}; cd {PPT_GIT} && docker compose -f docker-compose.oj.yml up -d '
              f'--force-recreate 2>&1 | tail -4', timeout=300)
        j.run(f'{JUDGE_DOCKER}; sleep 22; docker logs --tail 18 ppt-system 2>&1', timeout=180, max_lines=20)
        j.run('curl -s -o /dev/null -w "  /ppt/login -> %{http_code}\\n" --max-time 10 http://127.0.0.1:3456/ppt/login', timeout=60)
        print('  --- 迁移后的库状态 ---')
        j.run(f'{JUDGE_DOCKER}; docker exec -w /app ppt-system node probe.js 2>&1 | grep -v Warning', timeout=180, max_lines=30)
    finally:
        j.close()


def phase18(ts: str):
    """补回旧授权表的 5 行。

    注意容器只挂了 prisma 与 uploads 两个目录，看不到 _backup，
    所以备份文件要先 docker cp 进容器再读。
    """
    j = open_root('judge')
    try:
        head('1.8 补回旧授权表里的 5 条（映射到新的 TaxonomyGrant）')
        if not Path('/tmp/restore_grants.js').exists():
            j.put('/tmp/restore_grants.js',
                  "const fs = require('fs');\n"
                  "const { PrismaClient } = require('@prisma/client');\n"
                  "const p = new PrismaClient();\n"
                  "(async () => {\n"
                  "  const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));\n"
                  "  let n = 0;\n"
                  "  for (const r of raw) {\n"
                  "    await p.taxonomyGrant.upsert({\n"
                  "      where: { userId_taxonomyId: { userId: r.B, taxonomyId: r.A } },\n"
                  "      create: { userId: r.B, taxonomyId: r.A },\n"
                  "      update: {},\n"
                  "    });\n"
                  "    n++;\n"
                  "  }\n"
                  "  console.log('  补回 ' + n + ' 条，TaxonomyGrant 现有 ' + (await p.taxonomyGrant.count()) + ' 条');\n"
                  "  await p.$disconnect();\n"
                  "})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });\n")
        j.run(f'{JUDGE_DOCKER}; docker cp /tmp/restore_grants.js ppt-system:/app/restore_grants.js && '
              f'{JUDGE_DOCKER}; docker cp {PPT_DATA}/_backup/grants.{ts}.json ppt-system:/app/grants.json && '
              f'{JUDGE_DOCKER}; docker exec -w /app ppt-system node restore_grants.js /app/grants.json 2>&1 | grep -v Warning',
              timeout=180)
        print('  --- 迁移后的库状态 ---')
        j.put('/tmp/probe3.js',
              "const { PrismaClient } = require('@prisma/client');\n"
              "const p = new PrismaClient();\n"
              "(async () => {\n"
              "  const t = await p.$queryRawUnsafe(\"select name from sqlite_master where type='table' order by name\");\n"
              "  console.log('  表: ' + t.map(x => x.name).join(', '));\n"
              "  console.log('  用户 ' + (await p.user.count()) + ' / 标签 ' + (await p.taxonomy.count())\n"
              "    + ' / 授权 ' + (await p.taxonomyGrant.count())\n"
              "    + ' / 课件文件 ' + (await p.file.count({ where: { isDirectory: false } })));\n"
              "  const pub = await p.file.count({ where: { isDirectory: false, isPublic: true } });\n"
              "  const taxPub = await p.taxonomy.count({ where: { isPublic: true } });\n"
              "  console.log('  公共课件 ' + pub + ' / 公共标签 ' + taxPub);\n"
              "  await p.$disconnect();\n"
              "})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });\n")
        j.run(f'{JUDGE_DOCKER}; docker cp /tmp/probe3.js ppt-system:/app/probe3.js && '
              f'{JUDGE_DOCKER}; docker exec -w /app ppt-system node probe3.js 2>&1 | grep -v Warning', timeout=180)
    finally:
        j.close()


def main():
    step = sys.argv[1] if len(sys.argv) > 1 else 'phase1'
    if step == 'phase1':
        ts, secret = phase1()
        Path('/tmp/deploy-ts.txt').write_text(ts)
        Path('/tmp/deploy-secret.txt').write_text(secret)
        print(f'\n  phase1 完成，时间戳 {ts}')
    elif step == 'phase14':
        ts = sys.argv[2] if len(sys.argv) > 2 else Path('/tmp/deploy-ts.txt').read_text().strip()
        print(f'  续跑，时间戳 {ts}')
        Path('/tmp/deploy-ts.txt').write_text(ts)
        phase14(ts)
    elif step == 'phase15':
        phase15(Path('/tmp/deploy-ts.txt').read_text().strip())
    elif step == 'phase18':
        phase18(Path('/tmp/deploy-ts.txt').read_text().strip())
    elif step == 'phase1verify':
        ts = Path('/tmp/deploy-ts.txt').read_text().strip()
        print(f'  使用时间戳 {ts}')
        phase1_verify(ts)
    elif step == 'redeploy_oj':
        redeploy_oj()
    elif step == 'phase2':
        phase2()
    elif step == 'verify':
        verify()
    else:
        raise SystemExit(f'未知步骤: {step}')


if __name__ == '__main__':
    main()
