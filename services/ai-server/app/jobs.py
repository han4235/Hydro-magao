"""内存队列。进程重启后任务丢失，阶段 A 够用。"""
import asyncio
import hashlib
import os
import time
import uuid
from pathlib import Path

from app.hydro_import import make_zip, post_zip
from app.hydro_session import mint_import_sid, revoke_import_sid
from app.llm import LlmClient
from app.ojimport_spec import bundle_missing
from app.skills.base import SkillContext
from app.skills.registry import get_skill

JOBS: dict[str, dict] = {}
ROOT = Path(os.environ.get('JOB_DATA_DIR', '/tmp/ai-jobs'))
QUEUE: asyncio.Queue | None = None


def list_jobs() -> list[dict]:
    return sorted(JOBS.values(), key=lambda j: j['createdAt'], reverse=True)


def get_job(job_id: str) -> dict | None:
    return JOBS.get(job_id)


async def enqueue(
    skill: str,
    filename: str,
    data: bytes,
    kind: str,
    source: str = 'file',
    url: str = '',
    text: str = '',
    fetch_cookie: str = '',
    domain_id: str = '',
    doc_id: str = '',
) -> dict:
    global QUEUE
    if QUEUE is None:
        QUEUE = asyncio.Queue()
        asyncio.create_task(_worker())
    job_id = uuid.uuid4().hex[:12]
    work = ROOT / job_id
    work.mkdir(parents=True, exist_ok=True)
    src = work / (filename or 'input.bin')
    src.write_bytes(data)
    if source == 'url' and (fetch_cookie or '').strip():
        (work / '.fetch_cookie').write_text(fetch_cookie.strip(), encoding='utf-8')
    meta = {}
    if (domain_id or '').strip() and (doc_id or '').strip():
        meta = {'domainId': domain_id.strip(), 'docId': int(doc_id.strip())}
    job = {
        'id': job_id,
        'skill': skill,
        'kind': kind,
        'source': source,
        'url': url if source == 'url' else '',
        'text': text if source == 'text' else '',
        'status': 'queued',
        'filename': src.name,
        'logs': [],
        'errors': [],
        'pids': [],
        'meta': meta,
        'payload': None,
        'createdAt': int(time.time()),
    }
    JOBS[job_id] = job
    await QUEUE.put(job_id)
    return job


async def _worker():
    while True:
        job_id = await QUEUE.get()
        job = JOBS.get(job_id)
        if not job:
            continue
        job['status'] = 'running'
        try:
            if job['skill'] == 'problem_sample_regen':
                miss = bundle_missing()
                if miss:
                    job['status'] = 'failed'
                    job['errors'].append(f'搬题姬材料缺失: {", ".join(miss[:5])}')
                    continue
                skill = get_skill(job['skill'])
                src = ROOT / job_id / job['filename']
                meta = job.get('meta') or {}
                opts = {
                    'kind': job['kind'],
                    'domain_id': meta.get('domainId', ''),
                    'doc_id': meta.get('docId', ''),
                }
                ctx = SkillContext(job_id, ROOT / job_id, opts, LlmClient())
                result = await skill.run(ctx, src)
                job['logs'].extend(result.logs)
                if result.errors:
                    job['status'] = 'failed'
                    job['errors'].extend(result.errors)
                    continue
                if not result.payload:
                    job['status'] = 'failed'
                    job['errors'].append('未生成样例 payload')
                    continue
                job['payload'] = result.payload
                job['status'] = 'done'
                continue
            if job['skill'] == 'pdf_to_problem_packs':
                miss = bundle_missing()
                if miss:
                    job['status'] = 'failed'
                    job['errors'].append(f'搬题姬材料缺失: {", ".join(miss)}')
                    continue
            skill = get_skill(job['skill'])
            src = ROOT / job_id / job['filename']
            cookie_file = ROOT / job_id / '.fetch_cookie'
            task_cookie = ''
            if cookie_file.is_file():
                task_cookie = cookie_file.read_text(encoding='utf-8').strip()
            opts = {
                'kind': job['kind'],
                'source': job.get('source', 'file'),
                'url': url if (url := job.get('url')) else '',
                'text': text if (text := job.get('text')) else '',
                'fetch_cookie': task_cookie,
            }
            if opts['source'] == 'url' and not opts['url'] and src.is_file():
                opts['url'] = src.read_text(encoding='utf-8').strip()
            if opts['source'] == 'text' and not opts['text'] and src.is_file():
                opts['text'] = src.read_text(encoding='utf-8')
            ctx = SkillContext(job_id, ROOT / job_id, opts, LlmClient())
            result = await skill.run(ctx, src)
            job['logs'].extend(result.logs)
            if result.errors and not result.work_dirs:
                job['status'] = 'failed'
                job['errors'].extend(result.errors)
                continue
            job['errors'].extend(result.errors)
            if not result.work_dirs:
                job['status'] = 'failed'
                job['errors'].append('没有生成题包')
                continue
            job['status'] = 'importing'
            zpath = ROOT / job_id / 'packs.zip'
            job['logs'].append('step08: 打包题包 zip')
            pids = make_zip(result.work_dirs, zpath)
            job['pids'] = pids
            base = os.environ.get('HYDRO_BASE_URL', '')
            sid = os.environ.get('HYDRO_IMPORT_TOKEN', '').strip()
            auto_sid = False
            if base and not sid and os.environ.get('HYDRO_AUTO_SID', '1') == '1':
                try:
                    sid = mint_import_sid()
                    auto_sid = True
                    job['logs'].append('已自动签发本机导入 sid（uid 3，6 小时）')
                except Exception as e:
                    job['errors'].append(f'自动 sid 失败: {e}')
            imported = False
            if base and sid:
                try:
                    code = post_zip(base, sid, zpath)
                    job['logs'].append(f'导入接口返回 {code}')
                    if code not in (200, 302):
                        job['status'] = 'failed'
                        job['errors'].append(f'导入失败 HTTP {code}')
                        continue
                    imported = True
                finally:
                    if auto_sid:
                        revoke_import_sid(sid)
            elif not base:
                job['logs'].append('未配置 HYDRO_BASE_URL，只生成了题包')
            elif not sid:
                job['logs'].append('未拿到导入 sid，只生成了题包（未写入题库）')
                job['status'] = 'failed'
                continue
            else:
                job['logs'].append('未配置 HYDRO_IMPORT_TOKEN 且自动 sid 未启用，只生成了题包')
            job['status'] = 'done' if imported or not base else 'failed'
        except Exception as e:
            job['status'] = 'failed'
            job['errors'].append(str(e))


def digest_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
