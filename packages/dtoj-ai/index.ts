import crypto from 'crypto';
import fs from 'fs-extra';
import { Context, PERM, ProblemModel, SolutionModel, Types, param } from 'hydrooj';
import { DtojPageHandler } from 'dtoj-ui';

const SKILL = 'pdf_to_problem_packs';
const SAMPLE_SKILL = 'problem_sample_regen';
const SOLUTION_SKILL = 'problem_solution';

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

/** 「材料」该显示什么：链接来源要给能点的原链接，文件来源要给上传时的文件名。
 *  job.filename 对链接任务只是落盘的占位名 source.url，照搬出来等于没说。 */
const MATERIAL_MAX = 72;

function jobMaterial(job: Record<string, unknown>) {
    const source = String(job.source || 'file');
    const url = String(job.url || '').trim();
    if (source === 'url' && url) {
        const text = url.length > MATERIAL_MAX ? `${url.slice(0, MATERIAL_MAX - 1)}…` : url;
        return { text, url, title: url };
    }
    if (job.skill === SAMPLE_SKILL || job.skill === SOLUTION_SKILL) {
        const docId = (job.meta as { docId?: number } | undefined)?.docId;
        if (job.skill === SOLUTION_SKILL) return { text: docId ? `题目 P${docId} 题解` : '题目题解', url: '', title: '' };
        return { text: docId ? `题目 P${docId}` : '题目样例再生', url: '', title: '' };
    }
    if (source === 'text') return { text: '粘贴的文本', url: '', title: '' };
    return { text: String(job.filename || ''), url: '', title: '' };
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
                material: jobMaterial(job),
                createdAtText: job.createdAt
                    ? new Date(job.createdAt * 1000).toLocaleString('zh-CN', { hour12: false })
                    : '',
                sourceLabel: job.skill === SAMPLE_SKILL || job.skill === SOLUTION_SKILL
                    ? '题面'
                    : job.source === 'url' ? '链接' : job.source === 'text' ? '文本' : '文件',
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
            const raw = await aiFetch(`/internal/jobs/${id}`, 'get', id);
            job = jobForClient(raw);
            if (job) job.material = jobMaterial(raw);
        } catch (e) {
            error = e.message || String(e);
        }
        this.view('dtoj_ai_job', { job, error });
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

class DtojAiSolutionHandler extends DtojPageHandler {
    @param('pid', Types.PositiveInt)
    async post(domainId: string, pid: number) {
        this.checkPerm(PERM.PERM_EDIT_PROBLEM_SOLUTION);
        const pdoc = await ProblemModel.get(domainId, pid);
        if (!pdoc) throw new Error('题目不存在');
        // 与侧栏入口同一条件：已经有置顶题解就不再生成，避免多份都挂着置顶
        const topCnt = await SolutionModel.count(domainId, { parentId: pid, top: true });
        if (topCnt) throw new Error('本题已有置顶题解，先取消置顶再生成');
        // 签名须覆盖 ai-server 实际收到的字节：text 源即该字符串本身
        const text = `solution:${domainId}:${pid}`;
        const digest = digestOf(Buffer.from(text, 'utf8'));
        const form = new FormData();
        form.append('skill', SOLUTION_SKILL);
        form.append('kind', 'solution');
        form.append('domain_id', domainId);
        form.append('doc_id', String(pid));
        form.append('text', text);
        const created = await aiFetch('/internal/jobs', SOLUTION_SKILL, digest, { method: 'POST', body: form }, 'solution');
        this.response.redirect = this.url('dtoj_ai_job', { id: created.id });
    }
}

class DtojAiSolutionApplyHandler extends DtojPageHandler {
    @param('id', Types.String)
    async post(domainId: string, id: string) {
        this.checkPerm(PERM.PERM_EDIT_PROBLEM_SOLUTION);
        // 这个接口只给任务页的 fetch 用，出错也回 JSON，前端才能把原因显示出来
        try {
            const job = await aiFetch(`/internal/jobs/${id}`, 'get', id);
            if (job.skill !== SOLUTION_SKILL || !job.payload) throw new Error('该任务不是 AI 题解');
            const docId = Number(job.payload.docId || job.meta?.docId);
            if (!docId) throw new Error('任务缺少题号');
            const pdoc = await ProblemModel.get(domainId, docId);
            if (!pdoc) throw new Error('题目不存在');
            const content = String(job.payload.content || '').trim();
            if (!content) throw new Error('题解内容为空');
            const topCnt = await SolutionModel.count(domainId, { parentId: docId, top: true });
            if (topCnt) throw new Error('本题已有置顶题解，先取消置顶再写入');
            // add 返回的是新题解的 _id（不是文档），置顶要用它
            const psid = await SolutionModel.add(domainId, docId, this.user._id, content);
            await SolutionModel.setTop(domainId, psid as any, true);
            this.response.type = 'application/json';
            this.response.body = {
                ok: true,
                docId,
                psid: String(psid),
                url: this.url('problem_solution', { pid: docId }),
            };
        } catch (e) {
            this.response.status = 400;
            this.response.type = 'application/json';
            this.response.body = { error: e.message || String(e) };
        }
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

/** 列表页轮询用：只回 id 与状态。整份 job 里有 logs、errors、payload，
 *  payload 甚至装着整份测试数据，列表页每几秒拉一次不合适。
 *  路径特意取 /ai-jobs-status 而不是 /ai/jobs/status —— /ai/jobs/:id 会先把它吃掉。 */
class DtojAiJobsPollHandler extends DtojPageHandler {
    async get() {
        this.checkPerm(PERM.PERM_CREATE_PROBLEM);
        this.response.type = 'application/json';
        try {
            const data = await aiFetch('/internal/jobs', 'list', 'list');
            this.response.body = {
                jobs: (data.jobs || []).map((job: any) => ({ id: job.id, status: job.status })),
            };
        } catch (e) {
            this.response.body = { error: e.message || String(e) };
        }
    }
}

export async function apply(ctx: Context) {
    ctx.Route('dtoj_ai_jobs', '/ai/jobs', DtojAiJobsHandler, PERM.PERM_CREATE_PROBLEM);
    ctx.Route('dtoj_ai_job', '/ai/jobs/:id', DtojAiJobHandler, PERM.PERM_CREATE_PROBLEM);
    ctx.Route('dtoj_ai_job_poll', '/ai/jobs/:id/poll', DtojAiJobPollHandler, PERM.PERM_CREATE_PROBLEM);
    ctx.Route('dtoj_ai_jobs_poll', '/ai-jobs-status', DtojAiJobsPollHandler, PERM.PERM_CREATE_PROBLEM);
    ctx.Route('dtoj_ai_job_apply', '/ai/jobs/:id/apply-samples', DtojAiJobApplyHandler, PERM.PERM_EDIT_PROBLEM);
    ctx.Route('dtoj_ai_job_apply_solution', '/ai/jobs/:id/apply-solution', DtojAiSolutionApplyHandler, PERM.PERM_EDIT_PROBLEM_SOLUTION);
    ctx.Route('dtoj_ai_problem_sample', '/ai/problem/:pid/sample-regen', DtojAiProblemSampleHandler, PERM.PERM_EDIT_PROBLEM);
    ctx.Route('dtoj_ai_problem_solution', '/ai/problem/:pid/solution', DtojAiSolutionHandler, PERM.PERM_EDIT_PROBLEM_SOLUTION);
    ctx.injectUI('ProblemAdd', 'dtoj_ai_jobs', { icon: 'copy', text: 'Import From AI' });
    ctx.i18n.load('zh', {
        dtoj_ai_jobs: 'AI 导题',
        dtoj_ai_job: 'AI 任务',
        dtoj_ai_problem_sample: 'AI 样例再生',
        dtoj_ai_problem_solution: 'AI 生成题解',
        'Import From AI': '从 AI 导入',
    });
}
