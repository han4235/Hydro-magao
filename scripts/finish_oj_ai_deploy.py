#!/usr/bin/env python3
"""评测机：构建 oj-ai、停 ai-server；云主机：同步 dtoj-ai 与 ai-server.json。凭据见 yuque-exporter/env。"""
from __future__ import annotations

import io
import json
import re
import sys
import tarfile
import time
from pathlib import Path

import paramiko

REPO = Path(__file__).resolve().parents[1]
ENV_FILE = Path('/Users/hanshilin/Desktop/hanshilin/magao/NOI/base/yuque-exporter/env')
DH = 'unix:///data/oj-docker/docker.sock'
BUILD = '/home/dev/oj-ai-build/services/ai-server'
ENV_PATH = '/home/dev/oj-ai.runtime.env'


def _root_password(lines: list[str], start: int) -> str:
    for i in range(start, len(lines)):
        if lines[i].startswith('root:'):
            return lines[i].split(':', 1)[1]
    raise SystemExit('env 中未找到 root: 行')


def load_env():
    lines = [ln.strip() for ln in ENV_FILE.read_text(encoding='utf-8').splitlines() if ln.strip()]
    j_host, j_port = lines[0], lines[1]
    ju, jp = lines[2].split(':', 1)
    c_host, c_port = lines[4], lines[5]
    cu, cp = lines[6].split(':', 1)
    j_root = _root_password(lines, 2)
    c_root = _root_password(lines, 5)
    return (j_host, j_port, ju, jp, j_root), (c_host, c_port, cu, cp, c_root)


def connect(host: str, port: str, user: str, password: str) -> paramiko.SSHClient:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(host, port=int(port), username=user, password=password, timeout=90)
    return c


def root_exec(ssh: paramiko.SSHClient, root_pw: str, cmd: str, timeout: int = 3600) -> tuple[int, str]:
    wrapped = f"echo {root_pw!r} | su - root -c {repr(cmd)}"
    _, stdout, stderr = ssh.exec_command(wrapped, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    code = stdout.channel.recv_exit_status()
    text = (out + err).strip()
    text = re.sub(r'LLM_API_KEY=.*', 'LLM_API_KEY=***', text)
    for s in (root_pw,):
        text = text.replace(s, '***')
    return code, text


def deploy_judge(judge, cloud_only: bool = False) -> str:
    j_host, j_port, ju, jp, j_root = judge
    if cloud_only:
        return ''
    ssh = connect(j_host, j_port, ju, jp)
    print('评测机：写入 runtime env')
    cmd = (
        f"grep -vE '^(PATH|PYTHON_|GPG_KEY)=' /home/dev/ai-server.env.bak | "
        f"sed 's|http://one-api:3000|http://127.0.0.1:3000|' > {ENV_PATH} && chmod 600 {ENV_PATH}"
    )
    code, text = root_exec(ssh, j_root, cmd, 60)
    if code != 0:
        print(text)
        sys.exit(1)

    print('评测机：docker build（阿里云源）')
    build = (
        f'export DOCKER_HOST={DH}; cd {BUILD} && '
        'docker build -t docker-oj-ai '
        '--build-arg APT_MIRROR=mirrors.aliyun.com '
        '--build-arg PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/ '
        '--build-arg PIP_TRUSTED_HOST=mirrors.aliyun.com .'
    )
    code, text = root_exec(ssh, j_root, build, 3600)
    print(text[-4000:] if len(text) > 4000 else text)
    if code != 0:
        sys.exit('docker build 失败')

    print('评测机：替换 ai-server → oj-ai')
    run = (
        f'export DOCKER_HOST={DH}; docker rm -f ai-server oj-ai 2>/dev/null; '
        'mkdir -p /home/dev/oj-ai-jobs; '
        'docker run -d --name oj-ai --restart unless-stopped --network host '
        f'-e HYDRO_MONGO_URI=mongodb://127.0.0.1:27017 --env-file {ENV_PATH} '
        '-v /home/dev/oj-ai-jobs:/data/jobs docker-oj-ai'
    )
    code, text = root_exec(ssh, j_root, run, 120)
    print(text)
    if code != 0:
        sys.exit('docker run 失败')

    time.sleep(4)
    code, health = root_exec(ssh, j_root, 'curl -sf http://127.0.0.1:8090/health', 30)
    print('health:', health)
    if code != 0:
        root_exec(ssh, j_root, f'export DOCKER_HOST={DH}; docker logs oj-ai --tail 100', 60)
        sys.exit('health 检查失败')

    code, sec_out = root_exec(ssh, j_root, f"grep '^AI_SERVER_HMAC_SECRET=' {ENV_PATH} | cut -d= -f2-", 30)
    secret = ''
    for line in sec_out.splitlines():
        line = line.strip()
        if line and '密码' not in line:
            secret = line
            break
    root_exec(ssh, j_root, f'export DOCKER_HOST={DH}; docker ps --filter name=oj-ai', 30)
    ssh.close()
    if not secret:
        sys.exit('未读到 HMAC secret')
    return secret


def deploy_cloud(cloud, j_host: str, secret: str) -> None:
    c_host, c_port, cu, cp, c_root = cloud
    paths = [
        'packages/dtoj-ai',
        'packages/dtoj-training/templates/dtoj_training_edit.html',
        'packages/hydrooj/src/handler/import.ts',
        'packages/ui-default/templates/problem_import_hydro.html',
    ]
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz') as tf:
        for p in paths:
            full = REPO / p
            if full.is_dir():
                for f in full.rglob('*'):
                    if f.is_file():
                        tf.add(f, arcname=str(f.relative_to(REPO)))
            else:
                tf.add(full, arcname=p)
    buf.seek(0)

    ssh = connect(c_host, c_port, cu, cp)
    sftp = ssh.open_sftp()
    sftp.putfo(buf, '/tmp/cloud-dtoj-sync.tgz')
    sftp.close()

    print('云主机：解压并 docker cp')
    code, text = root_exec(
        ssh,
        c_root,
        'mkdir -p /home/mon/oj-cloud-sync && rm -rf /home/mon/oj-cloud-sync/* && '
        'tar -xzf /tmp/cloud-dtoj-sync.tgz -C /home/mon/oj-cloud-sync',
        120,
    )
    if code != 0:
        print(text)
        sys.exit(1)

    sync = (
        'docker cp /home/mon/oj-cloud-sync/packages/dtoj-ai oj-backend:/opt/hydro/packages/ && '
        'docker cp /home/mon/oj-cloud-sync/packages/dtoj-training/templates/dtoj_training_edit.html '
        'oj-backend:/opt/hydro/packages/dtoj-training/templates/dtoj_training_edit.html && '
        'docker cp /home/mon/oj-cloud-sync/packages/hydrooj/src/handler/import.ts '
        'oj-backend:/opt/hydro/packages/hydrooj/src/handler/import.ts && '
        'docker cp /home/mon/oj-cloud-sync/packages/ui-default/templates/problem_import_hydro.html '
        'oj-backend:/opt/hydro/packages/ui-default/templates/problem_import_hydro.html'
    )
    root_exec(ssh, c_root, sync, 600)

    print('云主机：yarn build')
    code, text = root_exec(
        ssh, c_root, 'docker exec oj-backend bash -lc "cd /opt/hydro && yarn build && yarn build:ui:production"', 3600
    )
    if code != 0:
        print(text[-3000:])
        sys.exit('yarn build 失败')

    root_exec(ssh, c_root, 'docker exec oj-backend pm2 restart hydrooj', 120)

    ai_url = f'http://{j_host}:8090'
    payload = json.dumps({'url': ai_url, 'secret': secret})
    root_exec(
        ssh,
        c_root,
        f"docker exec oj-backend bash -lc 'mkdir -p /root/.hydro && printf %s {payload!r} > /root/.hydro/ai-server.json'",
        60,
    )
    print('云主机：探测评测机 health')
    code, text = root_exec(ssh, c_root, f'curl -sf -m 15 {ai_url}/health | head -c 400', 30)
    print(text if code == 0 else f'curl 失败 (code={code})')
    ssh.close()


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('--cloud-only', action='store_true', help='仅云主机：docker cp + yarn + ai-server.json')
    parser.add_argument('--secret', default='', help='cloud-only 时 HMAC，默认从评测机 env 读取')
    args = parser.parse_args()

    judge, cloud = load_env()
    if args.cloud_only:
        secret = args.secret
        if not secret:
            ssh = connect(judge[0], judge[1], judge[2], judge[3])
            _, sec_out = root_exec(ssh, judge[4], f"grep '^AI_SERVER_HMAC_SECRET=' {ENV_PATH} | cut -d= -f2-", 30)
            ssh.close()
            for line in sec_out.splitlines():
                line = line.strip()
                if line and '密码' not in line:
                    secret = line
                    break
        if not secret:
            sys.exit('缺少 HMAC secret')
        deploy_cloud(cloud, judge[0], secret)
    else:
        secret = deploy_judge(judge)
        deploy_cloud(cloud, judge[0], secret)
    print('全部完成')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
