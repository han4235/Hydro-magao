"""青石导入 sid：容器内连 oj-mongo；本机开发可走 docker exec。"""
import os
import secrets
import subprocess
from datetime import datetime, timedelta, timezone


def _mongo_uri() -> str:
    return (os.environ.get('HYDRO_MONGO_URI') or '').strip()


def _mint_via_pymongo() -> str:
    from pymongo import MongoClient

    uri = _mongo_uri()
    if not uri:
        raise RuntimeError('未配置 HYDRO_MONGO_URI')
    sid = 'v' + secrets.token_hex(8)
    now = datetime.now(timezone.utc)
    doc = {
        '_id': sid,
        'tokenType': 0,
        'uid': 3,
        'scope': '-1',
        'createAt': now,
        'updateAt': now,
        'expireAt': now + timedelta(hours=6),
    }
    client = MongoClient(uri, serverSelectionTimeoutMS=8000)
    client['hydro']['token'].insert_one(doc)
    client.close()
    return sid


def _mongosh_docker(js: str) -> str:
    return subprocess.check_output(
        ['docker', 'exec', 'oj-mongo', 'mongosh', 'hydro', '--quiet', '--eval', js],
        text=True,
        stderr=subprocess.STDOUT,
    )


def mint_import_sid() -> str:
    if _mongo_uri():
        return _mint_via_pymongo()
    out = _mongosh_docker(
        'const id="v"+Date.now().toString(36);'
        'db.token.insertOne({_id:id, tokenType:0, uid:3, scope:"-1",'
        'createAt:new Date(), updateAt:new Date(),'
        'expireAt:new Date(Date.now()+6*3600*1000)});'
        'print(id)'
    )
    sid = [line.strip() for line in out.splitlines() if line.strip()][-1]
    if not sid.startswith('v'):
        raise RuntimeError('无法创建导入 sid（oj-mongo 未就绪？）')
    return sid


def revoke_import_sid(sid: str) -> None:
    if not sid or not sid.startswith('v'):
        return
    if _mongo_uri():
        from pymongo import MongoClient

        client = MongoClient(_mongo_uri(), serverSelectionTimeoutMS=8000)
        client['hydro']['token'].delete_one({'_id': sid})
        client.close()
        return
    _mongosh_docker(f'db.token.deleteOne({{_id:"{sid}"}})')
