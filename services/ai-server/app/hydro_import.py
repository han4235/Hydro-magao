"""把 work_* 目录打成 Hydro 导入包并 POST。不打印票据。"""
import re
import zipfile
from pathlib import Path

import urllib.request

PID_RE = re.compile(r'^(?:[a-z0-9]{1,10}-)?[a-z][0-9a-z]*$', re.I)


def pid_of(work: Path) -> str:
    for line in (work / 'problem.yaml').read_text(encoding='utf-8').splitlines():
        if line.startswith('pid:'):
            return line.split(':', 1)[1].strip().strip('"').strip("'")
    return ''


def make_zip(works: list[Path], dest: Path) -> list[str]:
    pids = []
    dest.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(dest, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for work in works:
            pid = pid_of(work)
            if not pid or not PID_RE.match(pid):
                raise ValueError(f'题号不合法: {pid or work.name}')
            pids.append(pid)
            for name in ('problem.yaml', 'problem_zh.md', 'problem.md'):
                p = work / name
                if p.is_file():
                    z.write(p, f'{pid}/{name}')
            td = work / 'testdata'
            if td.is_dir():
                for f in td.iterdir():
                    if f.is_file():
                        z.write(f, f'{pid}/testdata/{f.name}')
    return pids


def post_zip(base_url: str, sid: str, zpath: Path) -> int:
    boundary = '----aiServerZip'
    body = (
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="file"; filename="{zpath.name}"\r\n'
        'Content-Type: application/zip\r\n\r\n'
    ).encode() + zpath.read_bytes() + f'\r\n--{boundary}--\r\n'.encode()
    req = urllib.request.Request(
        base_url.rstrip('/') + '/problem/import/hydro',
        data=body,
        method='POST',
        headers={
            'Cookie': f'sid={sid}',
            'Content-Type': f'multipart/form-data; boundary={boundary}',
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        if e.code in (301, 302, 303):
            return e.code
        raise
