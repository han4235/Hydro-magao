#!/usr/bin/env python3
"""一次性线上部署：评测机 oj-ai + 云主机 dtoj-ai。凭据仅读 yuque-exporter/env。"""
from __future__ import annotations

import re
import sys
import time
from pathlib import Path

from pexpect import pxssh

ENV = Path('/Users/hanshilin/Desktop/hanshilin/magao/NOI/base/yuque-exporter/env')
JUDGE_SRC = '/home/dev/oj-src'
CLOUD_SRC = '/home/mon/oj-src'
DOCKER = 'export DOCKER_HOST=unix:///data/oj-docker/docker.sock'


def load_blocks():
    lines = [ln.strip() for ln in ENV.read_text(encoding='utf-8').splitlines() if ln.strip()]
    if len(lines) < 8:
        raise SystemExit('env 行数不足')
    j_host, j_port = lines[0], lines[1]
    j_user, j_pass = lines[2].split(':', 1)
    _, j_root = lines[3].split(':', 1)
    c_host, c_port = lines[4], lines[5]
    c_user, c_pass = lines[6].split(':', 1)
    _, c_root = lines[7].split(':', 1)
    return (j_host, j_port, j_user, j_pass, j_root), (c_host, c_port, c_user, c_pass, c_root)


class RootShell:
    def __init__(self, host: str, port: str, user: str, password: str, root_pw: str):
        self._secrets = {password, root_pw}
        self.s = pxssh.pxssh(encoding='utf-8', timeout=7200)
        self.s.login(host, user, password, port=int(port), login_timeout=90)
        self.s.sendline('su -')
        self.s.expect([r'密码', r'Password', r'#', r'\$'], timeout=30)
        if '密码' in (self.s.before or '') or 'Password' in (self.s.before or ''):
            self.s.sendline(root_pw)
        self.s.prompt()

    def run(self, cmd: str, timeout: int = 7200) -> str:
        self.s.sendline(cmd)
        self.s.prompt(timeout=timeout)
        out = (self.s.before or '') + (self.s.after or '')
        for sec in self._secrets:
            out = out.replace(sec, '***')
        return out

    def close(self):
        try:
            self.s.logout()
        except Exception:
            pass


def parse_mirrors(text: str) -> tuple[str, str, str]:
    apt = 'mirrors.aliyun.com'
    pip_url, pip_host = 'https://mirrors.aliyun.com/pypi/simple/', 'mirrors.aliyun.com'
    apt_map = {
        'aliyun': 'mirrors.aliyun.com',
        'tuna': 'mirrors.tuna.tsinghua.edu.cn',
        'ustc': 'mirrors.ustc.edu.cn',
        'huawei': 'mirrors.huaweicloud.com',
    }
    pip_map = {
        'aliyun': ('https://mirrors.aliyun.com/pypi/simple/', 'mirrors.aliyun.com'),
        'tuna': ('https://pypi.tuna.tsinghua.edu.cn/simple/', 'pypi.tuna.tsinghua.edu.cn'),
        'tencent': ('https://mirrors.cloud.tencent.com/pypi/simple/', 'mirrors.cloud.tencent.com'),
        'douban': ('https://pypi.doubanio.com/simple/', 'pypi.doubanio.com'),
    }
    m = re.search(r'apt 推荐:\s*(\w+)', text)
    if m:
        apt = apt_map.get(m.group(1), apt)
    m = re.search(r'pip 推荐:\s*(\w+)', text)
    if m:
        pip_url, pip_host = pip_map.get(m.group(1), pip_map['aliyun'])
    return apt, pip_url, pip_host


def deploy_judge(shell: RootShell, judge_ip: str) -> None:
    print('=== 评测机：拉代码 ===')
    shell.run(f'cd {JUDGE_SRC} && git fetch origin && git checkout master && git pull --ff-only origin master', timeout=600)

    print('=== 评测机：测速选国内源 ===')
    bench = shell.run(f'cd {JUDGE_SRC}/services/ai-server && python3 scripts/bench_mirrors.py', timeout=120)
    print(bench[-800:])
    apt, pip_url, pip_host = parse_mirrors(bench)
    print(f'构建镜像 apt={apt} pip={pip_host}')

    env_example = f'{JUDGE_SRC}/install/docker/oj-ai.runtime.env.example'
    env_runtime = '/home/dev/oj-ai.runtime.env'
    shell.run(
        f'test -f {env_runtime} || cp {env_example} {env_runtime}; '
        f'grep -q JOB_DATA_DIR {env_runtime} || echo JOB_DATA_DIR=/data/jobs >> {env_runtime}; '
        f'grep -q HYDRO_BASE_URL {env_runtime} || echo HYDRO_BASE_URL=http://119.91.85.100:8899 >> {env_runtime}; '
        f'grep -q HYDRO_AUTO_SID {env_runtime} || echo HYDRO_AUTO_SID=1 >> {env_runtime}',
        timeout=60,
    )

    print('=== 评测机：构建 docker-oj-ai ===')
    build = (
        f'{DOCKER}; cd {JUDGE_SRC}/services/ai-server && '
        f'docker build -t docker-oj-ai '
        f'--build-arg APT_MIRROR={apt} '
        f'--build-arg PIP_INDEX_URL={pip_url} '
        f'--build-arg PIP_TRUSTED_HOST={pip_host} .'
    )
    out = shell.run(build, timeout=7200)
    if 'Successfully tagged docker-oj-ai' not in out and 'naming to docker.io/library/docker-oj-ai' not in out:
        print(out[-2000:])
        raise SystemExit('镜像构建可能失败，请检查上方日志')

    print('=== 评测机：停旧 ai-server、启 oj-ai（8090） ===')
    shell.run(f'{DOCKER}; docker rm -f oj-ai 2>/dev/null; docker stop ai-server 2>/dev/null; docker rm ai-server 2>/dev/null', timeout=120)
    run = (
        f'{DOCKER}; docker run -d --name oj-ai --restart unless-stopped --network host '
        f'--env-file {env_runtime} '
        f'-e HYDRO_MONGO_URI=mongodb://127.0.0.1:27017 '
        f'-v /home/dev/oj-ai-jobs:/data/jobs '
        f'docker-oj-ai'
    )
    shell.run(run, timeout=120)
    health = shell.run('curl -sf http://127.0.0.1:8090/health', timeout=30)
    print('health:', health.strip()[-500:])
    shell.run(f'{DOCKER}; docker ps --filter name=oj-ai --filter name=oj-mongo', timeout=60)
    print(f'评测机 oj-ai 就绪，对外 http://{judge_ip}:8090')


def deploy_cloud(shell: RootShell, judge_ip: str) -> None:
    print('=== 云主机：拉代码 ===')
    shell.run(f'cd {CLOUD_SRC} && git fetch origin && git checkout master && git pull --ff-only origin master', timeout=600)

    print('=== 云主机：同步 dtoj-ai 并进容器编译 ===')
    sync = (
        f'cd {CLOUD_SRC} && '
        f'docker cp packages/dtoj-ai oj-backend:/opt/hydro/packages/ && '
        f'docker cp packages/dtoj-training/templates/dtoj_training_edit.html '
        f'oj-backend:/opt/hydro/packages/dtoj-training/templates/dtoj_training_edit.html && '
        f'docker cp packages/hydrooj/src/handler/import.ts '
        f'oj-backend:/opt/hydro/packages/hydrooj/src/handler/import.ts && '
        f'docker cp packages/ui-default/templates/problem_import_hydro.html '
        f'oj-backend:/opt/hydro/packages/ui-default/templates/problem_import_hydro.html'
    )
    shell.run(sync, timeout=300)
    shell.run('docker exec oj-backend bash -lc "cd /opt/hydro && yarn build && yarn build:ui:production"', timeout=7200)
    shell.run('docker exec oj-backend pm2 restart hydrooj', timeout=120)

    secret = 'dev-ai-secret'
    ai_url = f'http://{judge_ip}:8090'
    shell.run(
        f"docker exec oj-backend bash -lc 'printf %s\\n' "
        f"'{{\"url\":\"{ai_url}\",\"secret\":\"{secret}\"}}' > /root/.hydro/ai-server.json'",
        timeout=30,
    )
    shell.run('docker exec oj-backend cat /root/.hydro/ai-server.json', timeout=30)
    st = shell.run('curl -sf http://127.0.0.1:8888/status | head -c 200', timeout=30)
    print('backend status:', st.strip())
    print(f'云主机 ai-server.json → {ai_url}')


def main() -> int:
    j, c = load_blocks()
    j_shell = RootShell(j[0], j[1], j[2], j[3], j[4])
    try:
        deploy_judge(j_shell, j[0])
    finally:
        j_shell.close()
    time.sleep(2)
    c_shell = RootShell(c[0], c[1], c[2], c[3], c[4])
    try:
        deploy_cloud(c_shell, j[0])
    finally:
        c_shell.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
