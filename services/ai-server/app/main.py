from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile

from app.auth import check
from app.jobs import digest_of, enqueue, get_job, list_jobs
from app.skills.registry import SKILLS

app = FastAPI(title='ai-server')


@app.get('/health')
def health():
    return {'ok': True, 'skills': list(SKILLS)}


@app.get('/internal/jobs')
def jobs(x_ai_timestamp: str = Header(''), x_ai_signature: str = Header('')):
    try:
        check(x_ai_timestamp, 'list', 'list', x_ai_signature)
    except PermissionError as e:
        raise HTTPException(401, str(e)) from e
    return {'jobs': list_jobs()}


@app.get('/internal/jobs/{job_id}')
def job(job_id: str, x_ai_timestamp: str = Header(''), x_ai_signature: str = Header('')):
    try:
        check(x_ai_timestamp, 'get', job_id, x_ai_signature)
    except PermissionError as e:
        raise HTTPException(401, str(e)) from e
    found = get_job(job_id)
    if not found:
        raise HTTPException(404, '任务不存在')
    return found


@app.post('/internal/jobs')
async def create(
    skill: str = Form(...),
    file: UploadFile = File(...),
    x_ai_timestamp: str = Header(''),
    x_ai_signature: str = Header(''),
):
    data = await file.read()
    if len(data) > 32 * 1024 * 1024:
        raise HTTPException(413, '文件超过 32MB')
    if skill not in SKILLS:
        raise HTTPException(400, '未知 skill')
    try:
        check(x_ai_timestamp, skill, digest_of(data), x_ai_signature)
    except PermissionError as e:
        raise HTTPException(401, str(e)) from e
    return await enqueue(skill, file.filename or 'input.bin', data)
