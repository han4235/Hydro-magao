#!/usr/bin/env python3
"""从本机同步前端/插件源码到云主机 oj-backend，并执行全量 yarn build。"""
from __future__ import annotations

import io
import os
import sys
import tarfile
from pathlib import Path

import paramiko

REPO = Path(__file__).resolve().parents[1]
ENV_FILE = Path('/Users/hanshilin/Desktop/hanshilin/magao/NOI/base/yuque-exporter/env')

# 与线上增量发布一致，并带上 ui-default 修复 mdeditor
SYNC_PATHS = [
    'packages/ui-default',
    'packages/dtoj-ai',
    'packages/dtoj-training/templates/dtoj_training_edit.html',
    'packages/hydrooj/src/handler/import.ts',
    'packages/ui-default/templates/problem_import_hydro.html',
    'build/prepare.js',
]


def _root_password(lines: list[str], start: int) -> str:
    for i in range(start, len(lines)):
        if lines[i].startswith('root:'):
            return lines[i].split(':', 1)[1]
    raise SystemExit('env 中未找到 root:')


def load_cloud():
    lines = [ln.strip() for ln in ENV_FILE.read_text(encoding='utf-8').splitlines() if ln.strip()]
    c_host, c_port = lines[4], lines[5]
    cu, cp = lines[6].split(':', 1)
    c_root = _root_password(lines, 5)
    return c_host, c_port, cu, cp, c_root


def should_skip(arc: str) -> bool:
    parts = arc.replace('\\', '/').split('/')
    skip = {'node_modules', '.cache', 'dist', 'public/hydro-legacy'}
    return any(p in skip for p in parts)


def make_tar() -> io.BytesIO:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz') as tf:
        for rel in SYNC_PATHS:
            full = REPO / rel
            if not full.exists():
                print(f'跳过不存在: {rel}')
                continue
            if full.is_dir():
                for root, dirs, files in os.walk(full):
                    dirs[:] = [d for d in dirs if d not in ('node_modules', '.cache', 'dist')]
                    for name in files:
                        p = Path(root) / name
                        arc = str(p.relative_to(REPO))
                        if should_skip(arc):
                            continue
                        tf.add(p, arcname=arc)
            else:
                tf.add(full, arcname=rel)
    buf.seek(0)
    return buf


def main() -> int:
    c_host, c_port, cu, cp, c_root = load_cloud()
    buf = make_tar()
    print(f'同步包大小 {buf.getbuffer().nbytes // 1024} KiB')

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(c_host, port=int(c_port), username=cu, password=cp, timeout=90)
    sftp = ssh.open_sftp()
    sftp.putfo(buf, '/tmp/hydro-cloud-src.tgz')
    sftp.close()

    def root(cmd: str, timeout: int = 3600) -> tuple[int, str]:
        wrapped = f"echo {c_root!r} | su - root -c {repr(cmd)}"
        _, stdout, stderr = ssh.exec_command(wrapped, timeout=timeout)
        out = (stdout.read() + stderr.read()).decode('utf-8', errors='replace')
        return stdout.channel.recv_exit_status(), out.replace(c_root, '***')

    print('解压到 /home/mon/oj-cloud-sync')
    code, out = root(
        'mkdir -p /home/mon/oj-cloud-sync && rm -rf /home/mon/oj-cloud-sync/* && '
        'tar -xzf /tmp/hydro-cloud-src.tgz -C /home/mon/oj-cloud-sync',
        300,
    )
    if code != 0:
        print(out[-4000:])
        sys.exit(1)

    sync = (
        'docker cp /home/mon/oj-cloud-sync/packages/ui-default oj-backend:/opt/hydro/packages/ && '
        'docker cp /home/mon/oj-cloud-sync/packages/dtoj-ai oj-backend:/opt/hydro/packages/ && '
        'docker cp /home/mon/oj-cloud-sync/build/prepare.js oj-backend:/opt/hydro/build/prepare.js && '
        'docker cp /home/mon/oj-cloud-sync/packages/dtoj-training/templates/dtoj_training_edit.html '
        'oj-backend:/opt/hydro/packages/dtoj-training/templates/dtoj_training_edit.html && '
        'docker cp /home/mon/oj-cloud-sync/packages/hydrooj/src/handler/import.ts '
        'oj-backend:/opt/hydro/packages/hydrooj/src/handler/import.ts && '
        'docker cp /home/mon/oj-cloud-sync/packages/ui-default/templates/problem_import_hydro.html '
        'oj-backend:/opt/hydro/packages/ui-default/templates/problem_import_hydro.html'
    )
    print('docker cp → oj-backend')
    code, out = root(sync, 600)
    if code != 0:
        print(out[-4000:])
        sys.exit(1)

    root(
        'docker exec oj-backend rm -f '
        '/opt/hydro/packages/ui-default/components/editor/mdeditor.ts',
        60,
    )

    print('yarn build + build:ui:production')
    code, out = root(
        'docker exec oj-backend bash -lc "cd /opt/hydro && node build/prepare.js && '
        'yarn build && yarn build:ui:production"',
        3600,
    )
    if code != 0:
        for line in out.splitlines():
            if 'error TS' in line or 'Error' in line or 'ELIFECYCLE' in line:
                print(line)
        print('--- tail ---')
        print('\n'.join(out.splitlines()[-40:]))
        sys.exit('yarn build 失败')

    root('docker exec oj-backend pm2 restart hydrooj', 120)
    print('完成')
    ssh.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
