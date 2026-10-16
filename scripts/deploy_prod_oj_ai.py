#!/usr/bin/env python3
"""青石线上：云主机后端增量 + 评测机 Docker 构建/启动 oj-ai。凭据读 yuque-exporter/env，勿提交。"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import paramiko


REPO = Path(__file__).resolve().parents[1]
ENV_FILE = Path('/Users/hanshilin/Desktop/hanshilin/magao/NOI/base/yuque-exporter/env')
JUDGE_SRC = '/home/dev/oj-src'
CLOUD_SRC = '/home/mon/oj-src'
DOCKER_HOST = 'unix:///data/oj-docker/docker.sock'


def parse_env() -> tuple[tuple[str, str, str, str], tuple[str, str, str, str]]:
    lines = [ln.strip() for ln in ENV_FILE.read_text(encoding='utf-8').splitlines() if ln.strip()]
    if len(lines) < 8:
        raise SystemExit(f'env 格式异常: {ENV_FILE}')
    j_host, j_port, j_cred = lines[0], lines[1], lines[2]
    c_host, c_port, c_cred = lines[4], lines[5], lines[6]
    ju, jp = j_cred.split(':', 1)
    cu, cp = c_cred.split(':', 1)
    return (j_host, j_port, ju, jp), (c_host, c_port, cu, cp)


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 3600) -> tuple[int, str, str]:
    print(f'>>> {cmd[:200]}{"..." if len(cmd) > 200 else ""}')
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip(), file=sys.stderr)
    return code, out, err


def connect(host: str, port: str, user: str, password: str) -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, port=int(port), username=user, password=password, timeout=60)
    return client


def bench_mirrors(ssh: paramiko.SSHClient, src: str) -> tuple[str, str]:
    script = f'cd {src}/services/ai-server && python3 scripts/bench_mirrors.py'
    code, out, _ = run(ssh, script, timeout=120)
    if code != 0:
        return 'mirrors.aliyun.com', 'mirrors.aliyun.com'
    apt = 'mirrors.aliyun.com'
    pip_name = 'aliyun'
    m = re.search(r'apt 推荐:\s*(\w+)', out)
    if m:
        apt_map = {
            'aliyun': 'mirrors.aliyun.com',
            'tuna': 'mirrors.tuna.tsinghua.edu.cn',
            'ustc': 'mirrors.ustc.edu.cn',
            'huawei': 'mirrors.huaweicloud.com',
        }
        apt = apt_map.get(m.group(1), apt)
    m = re.search(r'pip 推荐:\s*(\w+)', out)
    if m:
        pip_name = m.group(1)
    pip_map = {
        'aliyun': ('https://mirrors.aliyun.com/pypi/simple/', 'mirrors.aliyun.com'),
        'tuna': ('https://pypi.tuna.tsinghua.edu.cn/simple/', 'pypi.tuna.tsinghua.edu.cn'),
        'tencent': ('https://mirrors.cloud.tencent.com/pypi/simple/', 'mirrors.cloud.tencent.com'),
        'douban': ('https://pypi.doubanio.com/simple/', 'pypi.doubanio.com'),
    }
    pip_url, pip_host = pip_map.get(pip_name, pip_map['aliyun'])
    print(f'选用镜像 apt={apt} pip={pip_name}')
    return apt, pip_url, pip_host


def deploy_judge(j: tuple[str, str, str, str], commit: str) -> None:
    host, port, user, password = j
    ssh = connect(host, port, user, password)
    run(ssh, f'cd {JUDGE_SRC} && git fetch origin && git checkout master && git pull origin master')
    apt, pip_url, pip_host = bench_mirrors(ssh, JUDGE_SRC)
    build = (
        f'export DOCKER_HOST={DOCKER_HOST}; '
        f'cd {JUDGE_SRC}/services/ai-server && '
        f'docker build -t docker-oj-ai '
        f'--build-arg APT_MIRROR={apt} '
        f'--build-arg PIP_INDEX_URL={pip_url} '
        f'--build-arg PIP_TRUSTED_HOST={pip_host} .'
    )
    if run(ssh, build, timeout=3600)[0] != 0:
        raise SystemExit('oj-ai 镜像构建失败')
    env_path = f'{JUDGE_SRC}/install/docker/oj-ai.runtime.env'
    run(ssh, f'test -f {env_path} || cp {JUDGE_SRC}/install/docker/oj-ai.runtime.env.example {env_path}')
    run(ssh, f'export DOCKER_HOST={DOCKER_HOST}; docker rm -f oj-ai 2>/dev/null || true')
    run_cmd = (
        f'export DOCKER_HOST={DOCKER_HOST}; docker run -d --name oj-ai --restart unless-stopped '
        f'--network host '
        f'-e HYDRO_MONGO_URI=mongodb://127.0.0.1:27017 '
        f'--env-file {env_path} '
        f'-v /home/dev/oj-ai-jobs:/data/jobs '
        f'docker-oj-ai'
    )
    if run(ssh, run_cmd)[0] != 0:
        raise SystemExit('oj-ai 容器启动失败')
    run(ssh, f'export DOCKER_HOST={DOCKER_HOST}; docker ps --filter name=oj-ai')
    run(ssh, 'curl -sf http://127.0.0.1:8090/health | head -c 400 || true')
    ssh.close()
    print(f'评测机 oj-ai 已部署 @ {commit}')


def deploy_cloud(c: tuple[str, str, str, str], judge_host: str, commit: str) -> None:
    host, port, user, password = c
    ssh = connect(host, port, user, password)
    run(ssh, f'cd {CLOUD_SRC} && git fetch origin && git checkout master && git pull origin master')
    dirs = (
        'packages/dtoj-ai packages/dtoj-training/templates/dtoj_training_edit.html '
        'packages/hydrooj/src/handler/import.ts packages/ui-default/templates/problem_import_hydro.html'
    )
    sync = (
        f'cd {CLOUD_SRC} && '
        f'docker cp {dirs.split()[0]} oj-backend:/opt/hydro/packages/ 2>/dev/null; '
        f'for d in packages/dtoj-ai packages/dtoj-training; do '
        f'docker cp "$d" oj-backend:/opt/hydro/packages/; done; '
        f'docker cp packages/dtoj-training/templates/dtoj_training_edit.html '
        f'oj-backend:/opt/hydro/packages/dtoj-training/templates/dtoj_training_edit.html; '
        f'docker cp packages/hydrooj/src/handler/import.ts '
        f'oj-backend:/opt/hydro/packages/hydrooj/src/handler/import.ts; '
        f'docker cp packages/ui-default/templates/problem_import_hydro.html '
        f'oj-backend:/opt/hydro/packages/ui-default/templates/problem_import_hydro.html'
    )
    run(ssh, sync, timeout=600)
    run(ssh, 'docker exec oj-backend bash -lc "cd /opt/hydro && yarn build && yarn build:ui:production"', timeout=3600)
    run(ssh, 'docker exec oj-backend pm2 restart hydrooj')
    ai_url = f'http://{judge_host}:8090'
    ai_json = f'{{"url":"{ai_url}","secret":"dev-ai-secret"}}'
    run(
        ssh,
        f"docker exec oj-backend bash -lc 'mkdir -p /root/.hydro && printf %s {ai_json!r} > /root/.hydro/ai-server.json'",
    )
    run(ssh, 'docker exec oj-backend curl -sf http://127.0.0.1:8888/status | head -c 200 || true')
    ssh.close()
    print(f'云主机后端已更新，ai-server → {ai_url} @ {commit}')


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--judge-only', action='store_true')
    parser.add_argument('--cloud-only', action='store_true')
    args = parser.parse_args()
    j, c = parse_env()
    commit = REPO.joinpath('.git')
    rev = __import__('subprocess').check_output(['git', '-C', str(REPO), 'rev-parse', '--short', 'HEAD'], text=True).strip()
    if not args.cloud_only:
        deploy_judge(j, rev)
    if not args.judge_only:
        deploy_cloud(c, j[0], rev)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
