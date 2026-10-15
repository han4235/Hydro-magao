"""从 Hydro Mongo 读取题目（oj-ai 容器内 HYDRO_MONGO_URI）。"""
import json
import os
import re

from app.hydro_session import _mongo_uri

TYPE_PROBLEM = 10


def _client():
    from pymongo import MongoClient

    uri = _mongo_uri()
    if not uri:
        raise RuntimeError('未配置 HYDRO_MONGO_URI')
    return MongoClient(uri, serverSelectionTimeoutMS=8000)


def load_problem(domain_id: str, doc_id: int) -> dict:
    client = _client()
    try:
        doc = client['hydro']['document'].find_one(
            {'domainId': domain_id, 'docType': TYPE_PROBLEM, 'docId': doc_id},
        )
    finally:
        client.close()
    if not doc:
        raise ValueError(f'题目不存在: {domain_id} #{doc_id}')
    return doc


def content_zh(pdoc: dict) -> str:
    raw = pdoc.get('content') or ''
    if isinstance(raw, dict):
        return str(raw.get('zh') or raw.get('en') or '')
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return str(parsed.get('zh') or parsed.get('en') or raw)
        except json.JSONDecodeError:
            return raw
    return str(raw)


def replace_sample_blocks(md: str, samples: list[tuple[str, str]]) -> str:
    """替换 ```inputN / ```outputN 块（N 从 1 起）。"""
    out = md
    for i, (inp, ans) in enumerate(samples, 1):
        inp = inp.rstrip() + '\n'
        ans = ans.rstrip() + '\n'
        out = re.sub(
            rf'```input{i}\s*\n[\s\S]*?```',
            f'```input{i}\n{inp}```',
            out,
            count=1,
        )
        out = re.sub(
            rf'```output{i}\s*\n[\s\S]*?```',
            f'```output{i}\n{ans}```',
            out,
            count=1,
        )
    return out
