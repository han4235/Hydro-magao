#!/usr/bin/env python3
"""从本机 install/docker 上传 oj-ai 配置与任务数据到线上评测机，并同步云主机 ai-server.json。"""
from __future__ import annotations

import base64
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
LOCAL_RUNTIME = REPO / 'install/docker/oj-ai.runtime.env'
LOCAL_JOBS = REPO / 'install/docker/data/ai-jobs'
LOCAL_AI_JSON = REPO / 'install/docker/data/backend/ai-server.json'
REMOTE_ENV = '/home/dev/oj-ai.runtime.env'
REMOTE_JOBS = '/home/dev/oj-ai-jobs'
DOCKER_HOST = 'unix:///data/oj-docker/docker.sock'


def _root_password(lines: list[str], start: int) -> str:
    for i in range(start, len(lines)):
        if lines[i].startswith('root:'):
            return lines[i].split(':', 1)[1]
    raise SystemExit('env 中未找到 root:')


def load_hosts():
    lines = [ln.strip() for ln in ENV_FILE.read_text(encoding='utf-8').splitlines() if ln.strip()]
    j_host, j_port = lines[0], lines[1]
    ju, jp = lines[2].split(':', 1)
    c_host, c_port = lines[4], lines[5]
    cu, cp = lines[6].split(':', 1)
    j_root = _root_password(lines, 2)
    c_root = _root_password(lines, 5)
    return (j_host, j_port, ju, jp, j_root), (c_host, c_port, cu, cp, c_root)


def parse_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' not in line:
            continue
        k, v = line.split('=', 1)
        out[k.strip()] = v.strip()
    return out


def build_prod_runtime(raw: dict[str, str], judge_host: str) -> str:
    """本地 env 去重后写入评测机；覆盖线上必须的项。"""
    keep = (
        'AI_SERVER_HMAC_SECRET',
        'LLM_BASE_URL',
        'LLM_API_KEY',
        'LLM_MODEL',
        'HYDRO_IMPORT_TOKEN',
        'HYDRO_AUTO_SID',
        'FETCH_COOKIE',
        'FETCH_COOKIE_LUOGU',
        'FETCH_USER_AGENT',
    )
    env = {k: raw[k] for k in keep if k in raw and raw[k]}
    env['JOB_DATA_DIR'] = '/data/jobs'
    env['HYDRO_BASE_URL'] = 'https://mahao.anosm.com'
    # 评测机 oj-ai 为 host 网络，one-api 映射在 127.0.0.1:3000；若本地直连 DeepSeek 则保留 LLM_BASE_URL
    if env.get('LLM_BASE_URL', '').startswith('http://one-api'):
        env['LLM_BASE_URL'] = 'http://127.0.0.1:3000/v1'
    lines = [f'{k}={v}' for k, v in env.items()]
    return '\n'.join(lines) + '\n'


def connect(host: str, port: str, user: str, password: str) -> paramiko.SSHClient:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(host, port=int(port), username=user, password=password, timeout=90)
    return c


def root_exec(ssh: paramiko.SSHClient, root_pw: str, cmd: str, timeout: int = 600) -> tuple[int, str]:
    wrapped = f"echo {root_pw!r} | su - root -c {repr(cmd)}"
    _, stdout, stderr = ssh.exec_command(wrapped, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace') + stderr.read().decode('utf-8', errors='replace')
    code = stdout.channel.recv_exit_status()
    out = re.sub(r'LLM_API_KEY=.*', 'LLM_API_KEY=***', out)
    out = out.replace(root_pw, '***')
    return code, out


def tar_jobs_dir(src: Path) -> io.BytesIO:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz') as tf:
        for p in src.rglob('*'):
            if p.is_file():
                tf.add(p, arcname=str(p.relative_to(src)))
    buf.seek(0)
    return buf


def main() -> int:
    if not LOCAL_RUNTIME.is_file():
        sys.exit(f'缺少 {LOCAL_RUNTIME}')
    if not LOCAL_JOBS.is_dir():
        sys.exit(f'缺少 {LOCAL_JOBS}')

    judge, cloud = load_hosts()
    j_host, j_port, ju, jp, j_root = judge
    c_host, c_port, cu, cp, c_root = cloud

    runtime_text = build_prod_runtime(parse_env_file(LOCAL_RUNTIME), j_host)
    secret = parse_env_file(LOCAL_RUNTIME).get('AI_SERVER_HMAC_SECRET', 'dev-ai-secret')

    ssh = connect(j_host, j_port, ju, jp)
    sftp = ssh.open_sftp()
    with sftp.file('/tmp/oj-ai.runtime.env.upload', 'w') as f:
        f.write(runtime_text)
    jobs_buf = tar_jobs_dir(LOCAL_JOBS)
    sftp.putfo(jobs_buf, '/tmp/ai-jobs-local.tgz')
    sftp.close()

    print('评测机：安装 env 与 ai-jobs')
    code, text = root_exec(
        ssh,
        j_root,
        f'mv /tmp/oj-ai.runtime.env.upload {REMOTE_ENV} && chmod 600 {REMOTE_ENV} && '
        f'mkdir -p {REMOTE_JOBS} && tar -xzf /tmp/ai-jobs-local.tgz -C {REMOTE_JOBS}',
        300,
    )
    if code != 0:
        print(text)
        sys.exit(1)

    print('评测机：重启 oj-ai')
    run = (
        f'export DOCKER_HOST={DOCKER_HOST}; docker rm -f oj-ai 2>/dev/null; '
        f'docker run -d --name oj-ai --restart unless-stopped --network host '
        f'-e HYDRO_MONGO_URI=mongodb://127.0.0.1:27017 --env-file {REMOTE_ENV} '
        f'-v {REMOTE_JOBS}:/data/jobs docker-oj-ai'
    )
    code, text = root_exec(ssh, j_root, run, 120)
    print(text)
    if code != 0:
        sys.exit('oj-ai 启动失败')
    time.sleep(3)
    code, health = root_exec(ssh, j_root, 'curl -sf http://127.0.0.1:8090/health', 30)
    print('health:', health.strip()[:400])
    ssh.close()

    ai_url = f'http://{j_host}:8090'
    payload = json.dumps({'url': ai_url, 'secret': secret})
    if LOCAL_AI_JSON.is_file():
        try:
            local_j = json.loads(LOCAL_AI_JSON.read_text(encoding='utf-8'))
            if local_j.get('secret'):
                payload = json.dumps({'url': ai_url, 'secret': local_j['secret']})
        except json.JSONDecodeError:
            pass

    print('云主机：写入 ai-server.json 并重启 hydrooj')
    ssh = connect(c_host, c_port, cu, cp)
    b64 = base64.b64encode(payload.encode()).decode()
    code, text = root_exec(
        ssh,
        c_root,
        'docker exec oj-backend mkdir -p /root/.hydro && '
        f'echo {b64} | base64 -d | docker exec -i oj-backend tee /root/.hydro/ai-server.json > /dev/null',
        60,
    )
    if code != 0:
        print(text)
        sys.exit(1)
    root_exec(ssh, c_root, 'docker exec oj-backend pm2 restart hydrooj', 120)
    code, text = root_exec(ssh, c_root, f'curl -sf -m 15 {ai_url}/health | head -c 300', 30)
    print('云主机探测:', text.strip()[:300])
    ssh.close()
    print('本地上传完成')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
