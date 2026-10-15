import crypto from 'crypto';
import fs from 'fs-extra';
import { Context, PERM, ProblemModel, Types, param } from 'hydrooj';
import { DtojPageHandler } from 'dtoj-ui';

const SKILL = 'pdf_to_problem_packs';
const SAMPLE_SKILL = 'problem_sample_regen';

const KINDS = [
    ['single', '单题'],
    ['theory', '理论试卷'],
];

const FILE_EXT = ['.pdf', '.doc', '.docx', '.txt', '.md', '.markdown'];

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

function sign(skill: string, digest: string, kind = '') {
    const ts = String(Math.floor(Date.now() / 1000));
    const { secret } = aiConfig();
    const payload = kind ? `${ts}\n${skill}\n${digest}\n${kind}` : `${ts}\n${skill}\n${digest}`;
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return { ts, signature };
}

async function aiFetch(path: string, skill: string, digest: string, init: RequestInit = {}, kind = '') {
    const { ts, signature } = sign(skill, digest, kind);
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

function digestOf(buf: Buffer) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

/** 避免与 Hydro response.status 混淆，详情页轮询用 phase */
function jobForClient(raw: Record<string, unknown> | null) {
    if (!raw) return null;
    const status = raw.status;
    return { ...raw, phase: status, status };
}

class DtojAiJobsHandler extends DtojPageHandler {
    async get() {
        this.checkPerm(PERM.PERM_CREATE_PROBLEM);
        let jobs = [];
        let error = '';
        try {
            const data = await aiFetch('/internal/jobs', 'list', 'list');
            jobs = (data.jobs || []).map((job) => ({
                ...job,
                createdAtText: job.createdAt
                    ? new Date(job.createdAt * 1000).toLocaleString('zh-CN', { hour12: false })
                    : '',
                sourceLabel: job.source === 'url' ? '链接' : job.source === 'text' ? '文本' : '文件',
            }));
        } catch (e) {
            error = e.message || String(e);
        }
        this.view('dtoj_ai_jobs', { jobs, kinds: KINDS, error });
    }

    @param('kind', Types.String)
    @param('source', Types.String, true)
    @param('url', Types.String, true)
    @param('text', Types.String, true)
    @param('fetchCookie', Types.String, true)
    async post(domainId: string, kind: string, source = 'file', url = '', text = '', fetchCookie = '') {
        this.checkPerm(PERM.PERM_CREATE_PROBLEM);
        kind = (kind || '').trim();
        if (!KINDS.some(([id]) => id === kind)) throw new Error('请求不合理：必须标明生成单题还是理论试卷');
        source = (source || 'file').trim();
        const form = new FormData();
        form.append('skill', SKILL);
        form.append('kind', kind);
        let digest = '';
        if (source === 'url') {
            url = (url || '').trim();
            if (!url) throw new Error('请填写网页链接');
            if (!/^https?:\/\//i.test(url)) throw new Error('链接须以 http:// 或 https:// 开头');
            digest = digestOf(Buffer.from(url, 'utf8'));
            form.append('url', url);
            fetchCookie = (fetchCookie || '').trim();
            if (fetchCookie.length > 8192) throw new Error('Cookie 过长');
            if (fetchCookie) form.append('fetch_cookie', fetchCookie);
        } else if (source === 'text') {
            text = (text || '').trim();
            if (!text) throw new Error('请填写或粘贴文本');
            digest = digestOf(Buffer.from(text, 'utf8'));
            form.append('text', text);
        } else {
            const file = this.request.files?.file;
            if (!file?.filepath) throw new Error('请上传文件');
            const filename = file.originalFilename || '';
            const lower = filename.toLowerCase();
            if (!FILE_EXT.some((ext) => lower.endsWith(ext))) {
                throw new Error('支持 PDF、Word（doc/docx）、纯文本（txt/md）');
            }
            const data = await fs.readFile(file.filepath);
            digest = digestOf(data);
            form.append('file', new Blob([data]), filename || 'upload.bin');
        }
        const created = await aiFetch('/internal/jobs', SKILL, digest, { method: 'POST', body: form }, kind);
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
        this.view('dtoj_ai_job', { job: jobForClient(job), error });
    }
}

class DtojAiProblemSampleHandler extends DtojPageHandler {
    @param('pid', Types.PositiveInt)
    async post(domainId: string, pid: number) {
        const pdoc = await ProblemModel.get(domainId, pid);
        if (!pdoc) throw new Error('题目不存在');
        if (!this.user.hasPerm(PERM.PERM_EDIT_PROBLEM) && !this.user.own(pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) {
            this.checkPerm(PERM.PERM_EDIT_PROBLEM);
        }
        // 签名须覆盖 ai-server 实际收到的字节：text 源即该字符串本身
        const text = `regen:${domainId}:${pid}`;
        const digest = digestOf(Buffer.from(text, 'utf8'));
        const form = new FormData();
        form.append('skill', SAMPLE_SKILL);
        form.append('kind', 'sample_regen');
        form.append('domain_id', domainId);
        form.append('doc_id', String(pid));
        form.append('text', text);
        const created = await aiFetch('/internal/jobs', SAMPLE_SKILL, digest, { method: 'POST', body: form }, 'sample_regen');
        this.response.redirect = this.url('dtoj_ai_job', { id: created.id });
    }
}

class DtojAiJobApplyHandler extends DtojPageHandler {
    @param('id', Types.String)
    async post(domainId: string, id: string) {
        this.checkPerm(PERM.PERM_EDIT_PROBLEM);
        const job = await aiFetch(`/internal/jobs/${id}`, 'get', id);
        if (job.skill !== SAMPLE_SKILL || !job.payload) {
            throw new Error('该任务不支持写入题库');
        }
        const docId = Number(job.payload.docId || job.meta?.docId);
        if (!docId) throw new Error('任务缺少题号');
        const pdoc = await ProblemModel.get(domainId, docId);
        if (!pdoc) throw new Error('题目不存在');
        const contentZh = String(job.payload.contentZh || '');
        const samples = job.payload.samples || [];
        const files = job.payload.testdataFiles as Record<string, string> | undefined;
        const hasFiles = files && typeof files === 'object' && Object.keys(files).length > 0;
        if (!contentZh || (!hasFiles && (!Array.isArray(samples) || !samples.length))) {
            throw new Error('样例或测试数据不完整');
        }
        await ProblemModel.edit(domainId, docId, {
            content: JSON.stringify({ zh: contentZh }),
        });
        if (hasFiles) {
            for (const [name, body] of Object.entries(files!)) {
                if (!name || body == null) continue;
                await ProblemModel.addTestdata(
                    domainId,
                    docId,
                    name,
                    Buffer.from(String(body), 'utf8'),
                    this.user._id,
                );
            }
        } else {
            for (let i = 0; i < samples.length; i++) {
                const inp = String(samples[i].input ?? '');
                const out = String(samples[i].output ?? '');
                const n = i + 1;
                await ProblemModel.addTestdata(domainId, docId, `${n}.in`, Buffer.from(inp, 'utf8'), this.user._id);
                await ProblemModel.addTestdata(domainId, docId, `${n}.out`, Buffer.from(out, 'utf8'), this.user._id);
            }
        }
        this.response.type = 'application/json';
        this.response.body = { ok: true, docId, url: this.url('problem_detail', { pid: docId }) };
    }
}

class DtojAiJobPollHandler extends DtojPageHandler {
    @param('id', Types.String)
    async get(domainId: string, id: string) {
        this.checkPerm(PERM.PERM_CREATE_PROBLEM);
        try {
            const job = await aiFetch(`/internal/jobs/${id}`, 'get', id);
            this.response.type = 'application/json';
            this.response.body = jobForClient(job);
        } catch (e) {
            this.response.type = 'application/json';
            this.response.body = { error: e.message || String(e) };
        }
    }
}

export async function apply(ctx: Context) {
    ctx.Route('dtoj_ai_jobs', '/ai/jobs', DtojAiJobsHandler, PERM.PERM_CREATE_PROBLEM);
    ctx.Route('dtoj_ai_job', '/ai/jobs/:id', DtojAiJobHandler, PERM.PERM_CREATE_PROBLEM);
    ctx.Route('dtoj_ai_job_poll', '/ai/jobs/:id/poll', DtojAiJobPollHandler, PERM.PERM_CREATE_PROBLEM);
    ctx.Route('dtoj_ai_job_apply', '/ai/jobs/:id/apply-samples', DtojAiJobApplyHandler, PERM.PERM_EDIT_PROBLEM);
    ctx.Route('dtoj_ai_problem_sample', '/ai/problem/:pid/sample-regen', DtojAiProblemSampleHandler, PERM.PERM_EDIT_PROBLEM);
    ctx.injectUI('ProblemAdd', 'dtoj_ai_jobs', { icon: 'copy', text: 'Import From AI' });
    ctx.i18n.load('zh', {
        dtoj_ai_jobs: 'AI 导题',
        dtoj_ai_job: 'AI 任务',
        dtoj_ai_problem_sample: 'AI 样例再生',
        'Import From AI': '从 AI 导入',
    });
}
