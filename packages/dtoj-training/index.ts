import { escapeRegExp } from 'lodash';
import {
    Context, ObjectId, PERM, ProblemModel, StorageModel, TrainingModel, Types, param,
} from 'hydrooj';
import { DtojDataHandler, dropEarlierRoutes, pick, queryOf, queryString } from 'dtoj-ui';
import {
    courseKinds, directions, listed, markOf, noteOf,
} from './data';

const blankChapter = { title: '', note: '', pids: '' };

function many(raw: unknown) {
    if (raw == null || raw === '') return [] as string[];
    if (Array.isArray(raw)) return raw.map((item) => String(item ?? ''));
    return [String(raw)];
}

function chaptersOf(raw: any) {
    const titles = many(raw?.chapterTitle);
    const notes = many(raw?.chapterNote);
    const pids = many(raw?.chapterPids);
    const n = Math.max(titles.length, notes.length, pids.length);
    const rows = [];
    for (let i = 0; i < n; i++) {
        rows.push({
            title: titles[i] || '',
            note: notes[i] || '',
            pids: pids[i] || '',
        });
    }
    return rows.length ? rows : [{ ...blankChapter }];
}

async function chaptersFromDoc(domainId: string, tdoc: any) {
    const dag = tdoc?.dag || [];
    if (!dag.length) return [{ ...blankChapter }];
    const notes = tdoc.dtoj?.notes || {};
    const rows = [];
    for (const node of dag) {
        const shown = [];
        for (const pid of node.pids || []) {
            // eslint-disable-next-line no-await-in-loop
            const pdoc = await ProblemModel.get(domainId, pid);
            shown.push(pdoc?.pid || String(pid));
        }
        rows.push({
            title: node.title || '',
            note: notes[String(node._id)] || '',
            pids: shown.join(' '),
        });
    }
    return rows;
}

function pinOf(raw: unknown) {
    if (raw == null || raw === '') return 0;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) return null;
    return n;
}

function courseOf(tdoc: any) {
    const dag = tdoc.dag || [];
    const mark = markOf(tdoc);
    return {
        id: tdoc.docId.toHexString(),
        title: tdoc.title,
        brief: tdoc.content || '',
        chapters: dag.length,
        problems: TrainingModel.getPids(dag).length,
        direction: mark.direction,
        kind: mark.kind,
        preview: dag.slice(0, 2).map((node, index) => ({
            n: String(index + 1).padStart(2, '0'),
            title: node.title || '',
        })),
    };
}

function tally(docs: any[]) {
    const direction: Record<string, number> = {};
    const kind: Record<string, number> = {};
    for (const name of directions) direction[name] = 0;
    for (const name of courseKinds) kind[name] = 0;
    for (const tdoc of docs) {
        const mark = markOf(tdoc);
        const name = mark.direction && directions.includes(mark.direction) ? mark.direction : '其他';
        direction[name] += 1;
        if (mark.kind && courseKinds.includes(mark.kind)) kind[mark.kind] += 1;
    }
    return { total: docs.length, direction, kind };
}

async function searchProblems(domainId: string, pq: string) {
    const q = pq.trim();
    if (!q) return [];
    const query: any = /^\d+$/.test(q)
        ? { docId: +q }
        : { $or: [{ pid: new RegExp(escapeRegExp(q), 'i') }, { title: new RegExp(escapeRegExp(q), 'i') }] };
    const docs = await ProblemModel.getMulti(domainId, query).limit(12).toArray();
    return docs.map((pdoc) => ({
        pid: pdoc.pid || String(pdoc.docId),
        title: pdoc.title || '',
    }));
}

async function buildPlan(domainId: string, rows: { title: string, note: string, pids: string }[]) {
    const filled = rows.filter((row) => row.title.trim() || row.note.trim() || row.pids.trim());
    if (!filled.length) return { error: '至少写一章，并填上题号。' };
    const dag = [];
    const notes: Record<string, string> = {};
    const missing = [];
    for (let i = 0; i < filled.length; i++) {
        const title = filled[i].title.trim();
        const tokens = filled[i].pids.split(/[\s,，]+/).filter(Boolean);
        if (!title) return { error: `第 ${i + 1} 章还没有标题。` };
        if (!tokens.length) return { error: `第 ${i + 1} 章还没有题号。` };
        const pids = [];
        for (const token of tokens) {
            // eslint-disable-next-line no-await-in-loop
            const pdoc = await ProblemModel.get(domainId, token);
            if (!pdoc) missing.push(token);
            else if (!pids.includes(pdoc.docId)) pids.push(pdoc.docId);
        }
        if (missing.length) return { error: `题库里没有这些题号：${Array.from(new Set(missing)).join('、')}` };
        const id = i + 1;
        dag.push({ _id: id, title, requireNids: [], pids });
        const note = filled[i].note.trim();
        if (note) notes[String(id)] = note;
    }
    return { dag, notes };
}

class DtojTrainingHandler extends DtojDataHandler {
    @param('page', Types.PositiveInt, true)
    @param('q', Types.String, true)
    async get(domainId: string, page = 1, q = '') {
        const direction = pick(queryOf(this, 'direction'), directions, '');
        const kind = pick(queryOf(this, 'kind'), courseKinds, '');
        const query: any = {};
        if (q) query.title = { $regex: new RegExp(escapeRegExp(q), 'i') };
        await this.ctx.parallel('training/list', query, this);
        const searched = await TrainingModel.getMulti(domainId, query).toArray();
        const hotDocs = searched.filter((tdoc) => tdoc.pin > 0);
        const pool = searched.filter((tdoc) => !(tdoc.pin > 0));
        const counts = tally(pool);
        const matched = pool.filter((tdoc) => listed(tdoc, direction, kind));
        const pageSize = Number(this.ctx.setting.get('pagination.training')) || 20;
        const pages = matched.length ? Math.floor((matched.length + pageSize - 1) / pageSize) : 0;
        const tdocs = matched.slice((page - 1) * pageSize, page * pageSize);
        this.view('dtoj_training', {
            directions,
            kinds: courseKinds,
            direction,
            kind,
            q,
            hot: hotDocs.map(courseOf),
            courses: tdocs.map(courseOf),
            page,
            pages,
            qs: queryString({ q, direction, kind }),
            counts,
            shown: matched.length,
            canCreate: this.user.hasPerm(PERM.PERM_CREATE_TRAINING),
        });
    }
}

class DtojTrainingDetailHandler extends DtojDataHandler {
    @param('tid', Types.ObjectId)
    async get(domainId: string, tid: ObjectId) {
        const tdoc = await TrainingModel.get(domainId, tid);
        const dag = tdoc.dag || [];
        const pids = TrainingModel.getPids(dag);
        const canViewHidden = this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id;
        const pdict = await ProblemModel.getList(domainId, pids, canViewHidden, false);
        const canEdit = this.user.own(tdoc)
            ? this.user.hasPerm(PERM.PERM_EDIT_TRAINING_SELF)
            : this.user.hasPerm(PERM.PERM_EDIT_TRAINING);
        this.view('dtoj_training_detail', {
            course: courseOf(tdoc),
            canEdit,
            chapters: dag.map((node, index) => ({
                index: index + 1,
                title: node.title,
                note: noteOf(tdoc, node._id, index + 1),
                problems: (node.pids || []).map((pid) => {
                    const pdoc = pdict[pid];
                    const missing = !pdoc?.docId;
                    return {
                        pid,
                        show: missing ? String(pid) : (pdoc.pid || pid),
                        title: missing ? '' : (pdoc.title || ''),
                        missing,
                    };
                }),
            })),
        });
    }
}

class DtojTrainingEditHandler extends DtojDataHandler {
    tdoc: any;

    @param('tid', Types.ObjectId, true)
    async prepare(domainId: string, tid?: ObjectId) {
        if (tid) {
            this.tdoc = await TrainingModel.get(domainId, tid);
            if (!this.user.own(this.tdoc)) this.checkPerm(PERM.PERM_EDIT_TRAINING);
            else this.checkPerm(PERM.PERM_EDIT_TRAINING_SELF);
        } else this.checkPerm(PERM.PERM_CREATE_TRAINING);
    }

    form(body: Record<string, any>) {
        const tdoc = this.tdoc;
        this.view('dtoj_training_edit', {
            pageName: tdoc ? 'dtoj_training_edit' : 'dtoj_training_create',
            directions,
            kinds: courseKinds,
            title: body.title ?? tdoc?.title ?? '',
            content: body.content ?? tdoc?.content ?? '',
            direction: body.direction ?? tdoc?.dtoj?.direction ?? '',
            kind: body.kind ?? tdoc?.dtoj?.kind ?? '',
            pin: body.pin ?? tdoc?.pin ?? 0,
            pq: body.pq || '',
            chapters: body.chapters,
            hits: body.hits || [],
            error: body.error || '',
            canDelete: !!tdoc,
        });
    }

    @param('pq', Types.String, true)
    async get(domainId: string, pq = '') {
        this.form({
            pq,
            chapters: await chaptersFromDoc(domainId, this.tdoc),
            hits: await searchProblems(domainId, pq),
        });
    }

    draft(domainId: string, title: string, content: string, direction: string, kind: string, pin: string, pq: string) {
        const chapters = chaptersOf(this.args);
        return {
            domainId, title, content, direction, kind, pin, pq, chapters,
        };
    }

    @param('title', Types.String, true)
    @param('content', Types.String, true)
    @param('direction', Types.String, true)
    @param('kind', Types.String, true)
    @param('pin', Types.String, true)
    @param('pq', Types.String, true)
    async postSearch(domainId: string, title = '', content = '', direction = '', kind = '', pin = '', pq = '') {
        const draft = this.draft(domainId, title, content, direction, kind, pin, pq);
        this.form({ ...draft, hits: await searchProblems(domainId, pq) });
    }

    @param('title', Types.String, true)
    @param('content', Types.String, true)
    @param('direction', Types.String, true)
    @param('kind', Types.String, true)
    @param('pin', Types.String, true)
    @param('pq', Types.String, true)
    async postAdd(domainId: string, title = '', content = '', direction = '', kind = '', pin = '', pq = '') {
        const draft = this.draft(domainId, title, content, direction, kind, pin, pq);
        this.form({
            ...draft,
            chapters: draft.chapters.concat([{ ...blankChapter }]),
            hits: await searchProblems(domainId, pq),
        });
    }

    async postDelete() {
        const domainId = this.args.domainId;
        if (!this.tdoc) return;
        const tid = this.tdoc.docId;
        await TrainingModel.del(domainId, tid);
        if (this.tdoc.files?.length) {
            await StorageModel.del(
                this.tdoc.files.map((file) => `training/${domainId}/${tid}/${file.name}`),
                this.user._id,
            );
        }
        this.response.redirect = this.url('training_main');
    }

    @param('title', Types.String, true)
    @param('content', Types.String, true)
    @param('direction', Types.String, true)
    @param('kind', Types.String, true)
    @param('pin', Types.String, true)
    @param('pq', Types.String, true)
    async postSave(
        domainId: string,
        title = '',
        content = '',
        direction = '',
        kind = '',
        pin = '',
        pq = '',
    ) {
        const draft = this.draft(domainId, title, content, direction, kind, pin, pq);
        const nextTitle = title.trim();
        const nextContent = content.trim();
        const nextDirection = pick(direction, directions, '');
        const nextKind = pick(kind, courseKinds, '');
        const nextPin = pinOf(pin);
        const { chapters } = draft;
        if (!nextTitle) {
            this.form({ ...draft, error: '先写标题。' });
            return;
        }
        if (nextTitle.length > 128) {
            this.form({ ...draft, error: '标题不能超过 128 个字。' });
            return;
        }
        if (nextContent.length > 500) {
            this.form({ ...draft, error: '简介不能超过 500 个字。' });
            return;
        }
        if (nextPin == null) {
            this.form({ ...draft, error: '置顶要写非负整数。' });
            return;
        }
        if ((!!this.tdoc?.pin) !== (!!nextPin)) this.checkPerm(PERM.PERM_PIN_TRAINING);
        const plan = await buildPlan(domainId, chapters);
        if ('error' in plan && plan.error) {
            this.form({ ...draft, error: plan.error });
            return;
        }
        const dtoj = { direction: nextDirection, kind: nextKind, notes: plan.notes };
        let tid = this.tdoc?.docId as ObjectId | undefined;
        if (!tid) {
            tid = await TrainingModel.add(domainId, nextTitle, nextContent, this.user._id, plan.dag, '', nextPin);
            await TrainingModel.edit(domainId, tid, { dtoj } as any);
        } else {
            await TrainingModel.edit(domainId, tid, {
                title: nextTitle,
                content: nextContent,
                dag: plan.dag,
                description: this.tdoc.description || '',
                pin: nextPin,
                dtoj,
            } as any);
        }
        this.response.redirect = this.url('dtoj_training_detail', { tid });
    }
}

const titles = {
    dtoj_training: '训练',
    dtoj_training_detail: '课程章节',
    dtoj_training_create: '新建训练',
    dtoj_training_edit: '编辑训练',
};

export async function apply(ctx: Context) {
    ctx.Route('training_main', '/training', DtojTrainingHandler, PERM.PERM_VIEW_TRAINING);
    ctx.Route('dtoj_training_create', '/training/create', DtojTrainingEditHandler);
    ctx.Route('dtoj_training_detail', '/training/:tid', DtojTrainingDetailHandler, PERM.PERM_VIEW_TRAINING);
    ctx.Route('dtoj_training_edit', '/training/:tid/edit', DtojTrainingEditHandler);
    dropEarlierRoutes(ctx, ['/training', '/training/create', '/training/:tid', '/training/:tid/edit']);
    for (const lang of ['zh', 'zh_TW', 'en', 'kr']) {
        ctx.i18n.load(lang, titles);
    }
}
