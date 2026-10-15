"""内存队列。进程重启后任务丢失，阶段 A 够用。"""
import asyncio
import hashlib
import os
import time
import uuid
from pathlib import Path

from app.hydro_import import make_zip, post_zip
from app.skills.base import SkillContext
from app.skills.registry import get_skill

JOBS: dict[str, dict] = {}
ROOT = Path(os.environ.get('JOB_DATA_DIR', '/tmp/ai-jobs'))
QUEUE: asyncio.Queue | None = None


def list_jobs() -> list[dict]:
    return sorted(JOBS.values(), key=lambda j: j['createdAt'], reverse=True)


def get_job(job_id: str) -> dict | None:
    return JOBS.get(job_id)


async def enqueue(skill: str, filename: str, data: bytes) -> dict:
    global QUEUE
    if QUEUE is None:
        QUEUE = asyncio.Queue()
        asyncio.create_task(_worker())
    job_id = uuid.uuid4().hex[:12]
    work = ROOT / job_id
    work.mkdir(parents=True, exist_ok=True)
    src = work / (filename or 'input.bin')
    src.write_bytes(data)
    job = {
        'id': job_id,
        'skill': skill,
        'status': 'queued',
        'filename': src.name,
        'logs': [],
        'errors': [],
        'pids': [],
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
            skill = get_skill(job['skill'])
            src = ROOT / job_id / job['filename']
            result = await skill.run(SkillContext(job_id, ROOT / job_id, {}), src)
            job['logs'].extend(result.logs)
            job['errors'].extend(result.errors)
            if result.errors and not result.work_dirs:
                job['status'] = 'failed'
                continue
            if not result.work_dirs:
                job['status'] = 'failed'
                job['errors'].append('没有生成题包')
                continue
            job['status'] = 'importing'
            zpath = ROOT / job_id / 'packs.zip'
            pids = make_zip(result.work_dirs, zpath)
            job['pids'] = pids
            base = os.environ.get('HYDRO_BASE_URL', '')
            sid = os.environ.get('HYDRO_IMPORT_TOKEN', '')
            if base and sid:
                code = post_zip(base, sid, zpath)
                job['logs'].append(f'导入接口返回 {code}')
                if code not in (200, 302):
                    job['status'] = 'failed'
                    job['errors'].append(f'导入失败 HTTP {code}')
                    continue
            else:
                job['logs'].append('未配置 HYDRO_BASE_URL / HYDRO_IMPORT_TOKEN，只生成了题包')
            job['status'] = 'done'
        except Exception as e:
            job['status'] = 'failed'
            job['errors'].append(str(e))


def digest_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
