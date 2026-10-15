from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile

from app.auth import check
from app.jobs import digest_of, enqueue, get_job, list_jobs
from app.kinds import require_kind
from app.llm import LlmClient
from app.ojimport_spec import bundle_missing, spec_version
from app.skills.registry import SKILLS

app = FastAPI(title='ai-server')


@app.get('/health')
def health():
    missing = bundle_missing()
    bundle_ok = len(missing) == 0
    return {
        'ok': bundle_ok,
        'skills': list(SKILLS),
        'llm': LlmClient().status(),
        'ojimport': {
            'version': spec_version(),
            'bundle_ok': bundle_ok,
            'missing': missing,
        },
    }


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


def _pick_source(
    file: UploadFile | None,
    file_data: bytes,
    url: str,
    text: str,
) -> tuple[str, bytes, str, str, str]:
    """返回 source, data, filename, url, text。"""
    url = (url or '').strip()
    text = (text or '').strip()
    name = (file.filename or '').strip() if file else ''
    if file_data:
        if len(file_data) > 32 * 1024 * 1024:
            raise HTTPException(413, '文件超过 32MB')
        return 'file', file_data, name or 'upload.bin', '', ''
    if url:
        if len(url) > 4096:
            raise HTTPException(400, '链接过长')
        raw = url.encode('utf-8')
        return 'url', raw, 'source.url', url, ''
    if text:
        if len(text) > 512 * 1024:
            raise HTTPException(400, '文本超过 512KB')
        raw = text.encode('utf-8')
        return 'text', raw, 'source.txt', '', text
    raise HTTPException(400, '请提供文件、链接或文本之一')


@app.post('/internal/jobs')
async def create(
    skill: str = Form(...),
    kind: str = Form(''),
    file: UploadFile | None = File(None),
    url: str = Form(''),
    text: str = Form(''),
    fetch_cookie: str = Form(''),
    domain_id: str = Form(''),
    doc_id: str = Form(''),
    x_ai_timestamp: str = Header(''),
    x_ai_signature: str = Header(''),
):
    try:
        kind = require_kind(kind)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    file_data = b''
    if file and file.filename:
        file_data = await file.read()
    try:
        source, data, filename, url, text = _pick_source(file, file_data, url, text)
    except HTTPException:
        raise
    if skill not in SKILLS:
        raise HTTPException(400, '未知 skill')
    if skill == 'pdf_to_problem_packs':
        missing = bundle_missing()
        if missing:
            raise HTTPException(
                503,
                f'搬题姬材料未就绪: {", ".join(missing[:5])}'
                + ('…' if len(missing) > 5 else ''),
            )
    try:
        check(x_ai_timestamp, skill, digest_of(data), x_ai_signature, kind)
    except PermissionError as e:
        raise HTTPException(401, str(e)) from e
    cookie = (fetch_cookie or '').strip()
    if cookie and len(cookie) > 8192:
        raise HTTPException(400, 'Cookie 过长')
    if cookie and source != 'url':
        cookie = ''
    return await enqueue(
        skill,
        filename,
        data,
        kind,
        source=source,
        url=url,
        text=text,
        fetch_cookie=cookie,
        domain_id=domain_id,
        doc_id=doc_id,
    )
