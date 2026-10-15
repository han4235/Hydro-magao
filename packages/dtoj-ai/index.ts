import crypto from 'crypto';
import fs from 'fs-extra';
import { Context, PERM, Types, param } from 'hydrooj';
import { DtojPageHandler } from 'dtoj-ui';

const SKILLS = [
    ['mock_pack', '连通测试（生成一道 A+B）'],
    ['pdf_to_problem_packs', 'PDF 转题包（尚未实现）'],
    ['url_to_problem_packs', '网页转题包（尚未实现）'],
    ['doc_to_problem_packs', '文档转题包（尚未实现）'],
];

function aiConfig() {
    let file: { url?: string, secret?: string } = {};
    try {
        file = JSON.parse(fs.readFileSync('/root/.hydro/ai-server.json', 'utf8'));
    } catch (e) { /* 本地没有这份配置时走环境变量 */ }
    return {
        url: (process.env.AI_SERVER_URL || file.url || 'http://host.docker.internal:8090').replace(/\/$/, ''),
        secret: process.env.AI_SERVER_HMAC_SECRET || file.secret || 'dev-ai-secret',
    };
}

function sign(skill: string, digest: string) {
    const ts = String(Math.floor(Date.now() / 1000));
    const { secret } = aiConfig();
    const signature = crypto.createHmac('sha256', secret).update(`${ts}\n${skill}\n${digest}`).digest('hex');
    return { ts, signature };
}

async function aiFetch(path: string, skill: string, digest: string, init: RequestInit = {}) {
    const { ts, signature } = sign(skill, digest);
    const res = await fetch(`${aiConfig().url}${path}`, {
        ...init,
        headers: {
            ...(init.headers || {}),
            'x-ai-timestamp': ts,
            'x-ai-signature': signature,
        },
    });
    const text = await res.text();
    let body: any = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    if (!res.ok) {
        const detail = body.detail || text || String(res.status);
        throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
    return body;
}

class DtojAiJobsHandler extends DtojPageHandler {
    async get() {
        this.checkPerm(PERM.PERM_CREATE_PROBLEM);
        let jobs = [];
        let error = '';
        try {
            const data = await aiFetch('/internal/jobs', 'list', 'list');
            jobs = data.jobs || [];
        } catch (e) {
            error = e.message || String(e);
        }
        this.view('dtoj_ai_jobs', { jobs, skills: SKILLS, error });
    }

    @param('skill', Types.String)
    async post(domainId: string, skill: string) {
        this.checkPerm(PERM.PERM_CREATE_PROBLEM);
        if (!SKILLS.some(([id]) => id === skill)) throw new Error('未知的处理方式');
        const file = this.request.files?.file;
        if (!file?.filepath) throw new Error('请选择文件');
        const data = await fs.readFile(file.filepath);
        const digest = crypto.createHash('sha256').update(data).digest('hex');
        const form = new FormData();
        form.append('skill', skill);
        form.append('file', new Blob([data]), file.originalFilename || 'upload.bin');
        const created = await aiFetch('/internal/jobs', skill, digest, { method: 'POST', body: form });
        this.response.redirect = this.url('dtoj_ai_job', { id: created.id });
    }
}

class DtojAiJobHandler extends DtojPageHandler {
    @param('id', Types.String)
    async get(domainId: string, id: string) {
        this.checkPerm(PERM.PERM_CREATE_PROBLEM);
        let job = null;
        let error = '';
        try {
            job = await aiFetch(`/internal/jobs/${id}`, 'get', id);
        } catch (e) {
            error = e.message || String(e);
        }
        this.view('dtoj_ai_job', { job, error });
    }
}

export async function apply(ctx: Context) {
    ctx.Route('dtoj_ai_jobs', '/ai/jobs', DtojAiJobsHandler, PERM.PERM_CREATE_PROBLEM);
    ctx.Route('dtoj_ai_job', '/ai/jobs/:id', DtojAiJobHandler, PERM.PERM_CREATE_PROBLEM);
    ctx.injectUI('ProblemAdd', 'dtoj_ai_jobs', { icon: 'copy', text: 'Import From AI' });
    ctx.i18n.load('zh', {
        dtoj_ai_jobs: 'AI 导题',
        dtoj_ai_job: 'AI 任务',
        'Import From AI': '从 AI 导入',
    });
}
