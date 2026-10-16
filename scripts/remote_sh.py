#!/usr/bin/env python3
"""线上远程执行助手：裸 pexpect 走 SSH + su，用哨兵串界定命令输出。

为什么不直接用 pexpect.pxssh：pxssh 靠「猜提示符」同步，遇到登录时的
`ulimit: cannot modify limit` 这类杂音会卡死。这里改成发完命令后回显一个
哨兵串（含退出码），按哨兵切分输出，不依赖提示符长什么样。

凭据只从 yuque-exporter/env 读，不落在脚本里；输出里的口令一律打码。
"""
from __future__ import annotations

import re
import shlex
import uuid
from pathlib import Path

import pexpect

ENV_FILE = Path('/Users/hanshilin/Desktop/hanshilin/magao/NOI/base/yuque-exporter/env')
JUDGE_SRC = '/home/dev/oj-src'
CLOUD_SRC = '/home/mon/oj-src'
# 评测机上那套 docker 的 socket；评测机上每条 docker 命令都要带它
JUDGE_DOCKER = 'export DOCKER_HOST=unix:///data/oj-docker/docker.sock'


def load_hosts():
    """返回 (评测机, 云主机)，每项是 (host, port, user, password, root_pw)。"""
    lines = [ln.strip() for ln in ENV_FILE.read_text(encoding='utf-8').splitlines() if ln.strip()]
    if len(lines) < 8:
        raise SystemExit('凭据文件行数不足（期望 评测机 4 行 + 云主机 4 行）')
    judge = (lines[0], lines[1], *lines[2].split(':', 1), lines[3].split(':', 1)[1])
    cloud = (lines[4], lines[5], *lines[6].split(':', 1), lines[7].split(':', 1)[1])
    return judge, cloud


class Remote:
    """一个已经 su 到 root 的远程 shell。"""

    def __init__(self, host: str, port: str, user: str, password: str, root_pw: str,
                 trace: str | None = None):
        self.host = f'{host}:{port}'
        self._secrets = [s for s in (password, root_pw) if s]
        args = ['-tt', '-p', str(port),
                '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
                '-o', 'PubkeyAuthentication=no', '-o', 'PreferredAuthentications=password',
                '-o', 'ServerAliveInterval=30',
                f'{user}@{host}']
        self.child = pexpect.spawn('ssh', args, encoding='utf-8',
                                   codec_errors='replace', timeout=120)
        self._trace = open(trace, 'w', encoding='utf-8') if trace else None
        if self._trace:
            self.child.logfile_read = self._trace
        self.child.expect([r'[Pp]assword:'], timeout=90)
        self.child.sendline(password)
        self.child.expect([r'\$ ', r'# '], timeout=60)
        self.child.sendline('su -')
        i = self.child.expect([r'密码', r'[Pp]assword', r'# '], timeout=30)
        if i in (0, 1):
            self.child.sendline(root_pw)
            self.child.expect([r'# '], timeout=30)
        # 关掉分页器与凭据交互：否则 git log 会停在 less 的 "(press RETURN)" 上，
        # 表现为整个脚本卡死。git 的终端提示同理。
        # unalias -a 同样必要：登录 profile 常给 cp/mv/rm 挂 -i 别名，
        # 覆盖已存在文件时会停在交互确认上，同样表现为卡死。
        self.run('unalias -a 2>/dev/null; export GIT_PAGER=cat PAGER=cat '
                 'GIT_TERMINAL_PROMPT=0 DEBIAN_FRONTEND=noninteractive',
                 timeout=20, quiet=True)
        self.run('id -u', timeout=20, quiet=True)

    def mask(self, text: str) -> str:
        for sec in self._secrets:
            text = text.replace(sec, '***')
        # 会话票据（sid / Cookie）不进日志
        text = re.sub(r'sid=[A-Za-z0-9]{10,}', 'sid=***', text)
        return text

    def run(self, cmd: str, timeout: int = 600, quiet: bool = False,
            max_lines: int | None = None) -> tuple[str, int]:
        """执行命令，返回 (输出, 退出码)。输出已剔除回显与哨兵，口令已打码。"""
        token = 'ZQ' + uuid.uuid4().hex[:12]
        self.child.sendline(f'{cmd}; echo {token}:$?')
        self.child.expect(rf'{token}:(\d+)', timeout=timeout)
        out = self.child.before or ''
        rc = int(self.child.match.group(1))
        out = self.mask(out)
        cleaned = []
        for ln in out.splitlines():
            # 终端回显的整行命令、以及哨兵那一行，都不是输出
            if token in ln or 'echo ' + token[:4] in ln:
                continue
            # 剥掉 OSC 标题序列与提示符前缀（形如 ]0;root@mail:~[root@mail ~]# ）
            ln = re.sub(r'\]0;[^\x07\]]*', '', ln)
            ln = re.sub(r'^\[?[\w.@~/-]*[#$]\s?', '', ln) if ln.startswith('[') else ln
            cleaned.append(ln.rstrip())
        while cleaned and not cleaned[0].strip():
            cleaned.pop(0)
        text = '\n'.join(cleaned).strip()
        if max_lines and len(cleaned) > max_lines:
            text = '\n'.join(cleaned[:max_lines // 2]) + \
                   f'\n    …（省略 {len(cleaned) - max_lines} 行）…\n' + \
                   '\n'.join(cleaned[-(max_lines // 2):])
        if not quiet:
            print(f'  $ {cmd[:110]}{"…" if len(cmd) > 110 else ""}')
            for ln in text.splitlines():
                print(f'    {ln}')
            print(f'    [退出码 {rc}]')
        return text, rc

    def put(self, remote_path: str, content: str, timeout: int = 120) -> None:
        """把文本写到远端文件：base64 分块传过去再解码，避开引号转义与行长上限。

        不能整行发：终端处于 canonical 模式时，单行超过 MAX_CANON（多为 4096 字节）
        的部分会被丢掉，文件会静默截断。所以按 1500 字符一块追加。
        """
        import base64
        b64 = base64.b64encode(content.encode('utf-8')).decode('ascii')
        chunks = [b64[i:i + 1500] for i in range(0, len(b64), 1500)] or ['']
        self.run(f'\\rm -f {remote_path}', timeout=timeout, quiet=True)
        for ch in chunks:
            self.run(f'printf %s {shlex.quote(ch)} >> {remote_path}', timeout=timeout, quiet=True)
        self.run(f'base64 -d {remote_path} > {remote_path}.tmp && '
                 f'\\mv {remote_path}.tmp {remote_path}', timeout=timeout, quiet=True)

    def close(self):
        try:
            self.child.sendline('exit')
            self.child.close(force=True)
        except Exception:
            pass
        if self._trace:
            self._trace.close()


def open_root(which: str = 'cloud', trace: str | None = None) -> Remote:
    judge, cloud = load_hosts()
    return Remote(*(judge if which == 'judge' else cloud), trace=trace)
