#!/usr/bin/env python3
"""提交一条 kind=theory 文本任务并轮询到结束。用法见 phase_b_restart.sh 后执行。"""
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get('AI_SERVER_URL', 'http://127.0.0.1:8090').rstrip('/')
SECRET = os.environ.get('AI_SERVER_HMAC_SECRET', 'dev-ai-secret')
SKILL = 'pdf_to_problem_packs'
KIND = 'theory'

SAMPLE = """
GESP五级理论小测

一、单选题
1. 链表相对数组，在（）操作通常更方便。
A. 随机访问  B. 已知位置插入删除  C. 二分查找  D. 下标访问

二、判断题
2. 双向链表每个节点有两个指针。对 / 错
""".strip()


def sign(ts: str, skill: str, digest: str, kind: str) -> str:
    msg = f'{ts}\n{skill}\n{digest}\n{kind}'
    return hmac.new(SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()


def post_job(text: str) -> str:
    raw = text.encode('utf-8')
    digest = hashlib.sha256(raw).hexdigest()
    ts = str(int(time.time()))
    sig = sign(ts, SKILL, digest, KIND)
    boundary = '----phaseB'
    body = (
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="skill"\r\n\r\n{SKILL}\r\n'
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="kind"\r\n\r\n{KIND}\r\n'
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="text"\r\n\r\n{text}\r\n'
        f'--{boundary}--\r\n'
    ).encode()
    req = urllib.request.Request(
        f'{BASE}/internal/jobs',
        data=body,
        method='POST',
        headers={
            'Content-Type': f'multipart/form-data; boundary={boundary}',
            'x-ai-timestamp': ts,
            'x-ai-signature': sig,
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    return data['id']


def get_job(job_id: str) -> dict:
    ts = str(int(time.time()))
    sig = sign(ts, 'get', job_id, '')
    req = urllib.request.Request(
        f'{BASE}/internal/jobs/{job_id}',
        headers={'x-ai-timestamp': ts, 'x-ai-signature': sig},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def main() -> int:
    text = sys.argv[1] if len(sys.argv) > 1 else SAMPLE
    try:
        job_id = post_job(text)
    except urllib.error.HTTPError as e:
        print(e.read().decode(), file=sys.stderr)
        return 1
    print(f'job_id={job_id}')
    for _ in range(120):
        job = get_job(job_id)
        st = job.get('status')
        print(f'status={st}')
        if st in ('done', 'failed'):
            print(json.dumps(job, ensure_ascii=False, indent=2))
            return 0 if st == 'done' else 1
        time.sleep(3)
    print('超时', file=sys.stderr)
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
