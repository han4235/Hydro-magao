#!/usr/bin/env python3
"""
本机 Docker Mongo（hydro）→ 线上评测机 Mongo：同步题库(document docType=10)与训练(docType=40)。
可选同步本机 install/docker/data/file/hydro 到云主机 oj-backend（题目测试数据等）。

默认 domainId=system。凭据：yuque-exporter/env
"""
from __future__ import annotations

import argparse
import io
import json
import subprocess
import sys
import tarfile
import time
from pathlib import Path

import paramiko

REPO = Path(__file__).resolve().parents[1]
ENV_FILE = Path('/Users/hanshilin/Desktop/hanshilin/magao/NOI/base/yuque-exporter/env')
LOCAL_MONGO = 'oj-mongo'
LOCAL_FILE_ROOT = REPO / 'install/docker/data/file/hydro'
DOMAIN = 'system'
DOC_TYPES = (10, 40)  # 题目、训练


def _root_password(lines: list[str], start: int) -> str:
    for i in range(start, len(lines)):
        if lines[i].startswith('root:'):
            return lines[i].split(':', 1)[1]
    raise SystemExit('env 中未找到 root:')


def load_hosts():
    lines = [ln.strip() for ln in ENV_FILE.read_text(encoding='utf-8').splitlines() if ln.strip()]
    judge = (lines[0], lines[1], *lines[2].split(':', 1), _root_password(lines, 2))
    cloud = (lines[4], lines[5], *lines[6].split(':', 1), _root_password(lines, 5))
    return judge, cloud


def local_export_docs() -> bytes:
    q = json.dumps({'domainId': DOMAIN, 'docType': {'$in': list(DOC_TYPES)}})
    cmd = [
        'docker', 'exec', LOCAL_MONGO,
        'mongoexport', '--db=hydro', '--collection=document',
        f'--query={q}', '--jsonArray',
    ]
    raw = subprocess.check_output(cmd, stderr=subprocess.DEVNULL)
    if not raw.lstrip().startswith(b'['):
        sys.exit('mongoexport 输出异常（可能混入了日志），请检查本机 oj-mongo')
    print(f'本机导出 document 约 {len(raw) // 1024} KiB（docType {DOC_TYPES}）')
    return raw


def local_export_domain_patch() -> bytes | None:
    js = (
        'const d=db.getSiblingDB("hydro").domain.findOne({_id:"system"});'
        'if(!d) quit(0);'
        'const p={};'
        'for (const k of ["dtojTraining","bulletin","name"]) if (d[k]!==undefined) p[k]=d[k];'
        'print(EJSON.stringify([p]));'
    )
    cmd = ['docker', 'exec', LOCAL_MONGO, 'mongosh', 'hydro', '--quiet', '--eval', js]
    raw = subprocess.check_output(cmd, stderr=subprocess.STDOUT).strip()
    if not raw or raw == b'[{}]' or raw == b'[]':
        return None
    return raw if isinstance(raw, bytes) else raw.encode('utf-8')


def upload_merge_script() -> str:
    return r'''
const fs = require('fs');
const docs = EJSON.parse(fs.readFileSync('/tmp/hydro_sync_docs.json', 'utf8'));
const domainPatchArr = fs.existsSync('/tmp/hydro_sync_domain.json')
  ? EJSON.parse(fs.readFileSync('/tmp/hydro_sync_domain.json', 'utf8'))
  : null;
const domainPatch = domainPatchArr && domainPatchArr[0] ? domainPatchArr[0] : null;
const coll = db.getSiblingDB('hydro').document;
let n = 0;
for (const doc of docs) {
  const q = { domainId: doc.domainId, docType: doc.docType, docId: doc.docId };
  coll.replaceOne(q, doc, { upsert: true });
  n++;
}
print('upserted_docs', n);
if (domainPatch) {
  db.getSiblingDB('hydro').domain.updateOne(
    { _id: 'system' },
    { $set: domainPatch },
  );
  print('domain_patched', true);
}
'''


def sync_mongo(judge, docs_raw: bytes, domain_patch: bytes | None) -> None:
    j_host, j_port, ju, jp, j_root = judge
    docs_path = '/tmp/hydro_sync_docs.json'
    js_path = '/tmp/hydro_sync_merge.js'

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(j_host, port=int(j_port), username=ju, password=jp, timeout=90)
    sftp = ssh.open_sftp()
    # Extended JSON via mongoexport is compatible with mongosh EJSON
    with sftp.open(docs_path, 'wb') as f:
        f.write(docs_raw)
    if domain_patch:
        patch_bytes = domain_patch if isinstance(domain_patch, bytes) else domain_patch.encode('utf-8')
        with sftp.open('/tmp/hydro_sync_domain.json', 'wb') as f:
            f.write(patch_bytes)
    with sftp.open(js_path, 'w') as f:
        f.write(upload_merge_script())
    sftp.close()

    inner = (
        'export DOCKER_HOST=unix:///data/oj-docker/docker.sock; '
        'docker cp /tmp/hydro_sync_docs.json oj-mongo:/tmp/hydro_sync_docs.json && '
        'docker cp /tmp/hydro_sync_merge.js oj-mongo:/tmp/hydro_sync_merge.js && '
    )
    if domain_patch:
        inner += 'docker cp /tmp/hydro_sync_domain.json oj-mongo:/tmp/hydro_sync_domain.json && '
    inner += (
        'docker exec oj-mongo mongosh hydro --quiet --file /tmp/hydro_sync_merge.js'
    )
    wrapped = f"echo {j_root!r} | su - root -c {repr(inner)}"
    _, stdout, stderr = ssh.exec_command(wrapped, timeout=600)
    out = stdout.read().decode() + stderr.read().decode()
    code = stdout.channel.recv_exit_status()
    print(out.replace(j_root, '***'))
    ssh.close()
    if code != 0:
        sys.exit('Mongo 合并失败')


def tar_hydro_files() -> io.BytesIO | None:
    if not LOCAL_FILE_ROOT.is_dir():
        print(f'跳过文件同步：无 {LOCAL_FILE_ROOT}')
        return None
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz') as tf:
        tf.add(LOCAL_FILE_ROOT, arcname='hydro')
    buf.seek(0)
    print(f'测试数据包约 {buf.getbuffer().nbytes // (1024 * 1024)} MiB')
    return buf


def sync_files(cloud, buf: io.BytesIO) -> None:
    c_host, c_port, cu, cp, c_root = cloud
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(c_host, port=int(c_port), username=cu, password=cp, timeout=90)
    sftp = ssh.open_sftp()
    sftp.putfo(buf, '/tmp/hydro_file_sync.tgz')
    sftp.close()
    inner = (
        'docker cp /tmp/hydro_file_sync.tgz oj-backend:/tmp/hydro_file_sync.tgz && '
        'docker exec oj-backend bash -lc "mkdir -p /data/file && tar -xzf /tmp/hydro_file_sync.tgz -C /data/file"'
    )
    wrapped = f"echo {c_root!r} | su - root -c {repr(inner)}"
    print('云主机：解压测试数据到 /data/file/hydro …')
    _, stdout, stderr = ssh.exec_command(wrapped, timeout=3600)
    out = stdout.read().decode() + stderr.read().decode()
    code = stdout.channel.recv_exit_status()
    print(out[-2000:].replace(c_root, '***'))
    ssh.close()
    if code != 0:
        sys.exit('文件同步失败')


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--mongo-only', action='store_true')
    parser.add_argument('--files-only', action='store_true')
    parser.add_argument('--no-domain-patch', action='store_true', help='不覆盖线上 domain.dtojTraining 等')
    args = parser.parse_args()

    judge, cloud = load_hosts()
    do_mongo = not args.files_only
    do_files = not args.mongo_only

    if do_mongo:
        docs_raw = local_export_docs()
        patch = None if args.no_domain_patch else local_export_domain_patch()
        sync_mongo(judge, docs_raw, patch)

    if do_files:
        buf = tar_hydro_files()
        if buf:
            sync_files(cloud, buf)

    print('同步完成')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
