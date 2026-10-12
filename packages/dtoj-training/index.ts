import { escapeRegExp } from 'lodash';
import {
    Context, DomainModel, ObjectId, PERM, PRIV, ProblemModel, STATUS, StorageModel, TrainingModel, Types, UserModel, param,
} from 'hydrooj';
import { DtojDataHandler, dropEarlierRoutes, pick, queryOf, queryString } from 'dtoj-ui';
import {
    courseKinds, directions, listed, markOf, noteOf,
} from './data';

const blankChapter = { title: '', note: '', pids: '' };
const luoguLevels = ['入门', '普及−', '普及/提高−', '普及+/提高', '提高+/省选−', '省选/NOI−', 'NOI/NOI+/CTSC'];

function luoguLevel(difficulty: unknown) {
    const n = Number(difficulty);
    if (!Number.isInteger(n) || n < 1 || n > luoguLevels.length) return '';
    return luoguLevels[n - 1];
}

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

function cleanName(raw: string) {
    return raw.trim().replace(/\s+/g, ' ');
}

function namesOf(raw: unknown, fallback: string[]) {
    if (!Array.isArray(raw)) return [...fallback];
    const out: string[] = [];
    for (const item of raw) {
        const name = cleanName(String(item || ''));
        if (!name || name.length > 16 || out.includes(name)) continue;
        out.push(name);
        if (out.length >= 40) break;
    }
    return out;
}

async function loadVocab(domainId: string) {
    const ddoc = await DomainModel.get(domainId);
    const saved = (ddoc as any)?.dtojTraining;
    return {
        directions: namesOf(saved?.directions, directions),
        kinds: namesOf(saved?.kinds, courseKinds),
    };
}

async function saveVocab(domainId: string, nextDirections: string[], nextKinds: string[]) {
    await DomainModel.edit(domainId, { dtojTraining: { directions: nextDirections, kinds: nextKinds } } as any);
}

async function clearMark(domainId: string, field: 'direction' | 'kind', name: string) {
    const docs = await TrainingModel.getMulti(domainId, {}).toArray();
    for (const tdoc of docs) {
        if (tdoc.dtoj?.[field] !== name) continue;
        const dtoj = { ...(tdoc.dtoj || {}), [field]: '' };
        // eslint-disable-next-line no-await-in-loop
        await TrainingModel.edit(domainId, tdoc.docId, { dtoj } as any);
    }
}

function tally(docs: any[], dirs: string[], kinds: string[]) {
    const direction: Record<string, number> = {};
    const kind: Record<string, number> = {};
    for (const name of dirs) direction[name] = 0;
    for (const name of kinds) kind[name] = 0;
    for (const tdoc of docs) {
        const mark = markOf(tdoc);
        if (mark.direction && direction[mark.direction] != null) direction[mark.direction] += 1;
        else if (direction['其他'] != null) direction['其他'] += 1;
        if (mark.kind && kind[mark.kind] != null) kind[mark.kind] += 1;
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
        const vocab = await loadVocab(domainId);
        const direction = pick(queryOf(this, 'direction'), vocab.directions, '');
        const kind = pick(queryOf(this, 'kind'), vocab.kinds, '');
        const query: any = {};
        if (q) query.title = { $regex: new RegExp(escapeRegExp(q), 'i') };
        await this.ctx.parallel('training/list', query, this);
        const searched = await TrainingModel.getMulti(domainId, query).toArray();
        const hotDocs = searched.filter((tdoc) => tdoc.pin > 0);
        const pool = searched.filter((tdoc) => !(tdoc.pin > 0));
        const counts = tally(pool, vocab.directions, vocab.kinds);
        const matched = pool.filter((tdoc) => listed(tdoc, direction, kind));
        const pageSize = Number(this.ctx.setting.get('pagination.training')) || 20;
        const pages = matched.length ? Math.floor((matched.length + pageSize - 1) / pageSize) : 0;
        const tdocs = matched.slice((page - 1) * pageSize, page * pageSize);
        this.view('dtoj_training', {
            directions: vocab.directions,
            kinds: vocab.kinds,
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

const courseParts = ['讲义', '练习', '排行', '详情'];

function personName(udoc: any, uid: number) {
    const name = String(udoc?.displayName || udoc?.uname || '').trim();
    return name || `用户 ${uid}`;
}

function tagsOf(pdoc: any) {
    const raw = pdoc?.tag;
    if (!raw) return [] as string[];
    const list = Array.isArray(raw) ? raw : [raw];
    return list.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3);
}

function markOfStatus(psdoc: any) {
    if (!psdoc?.status) return { ac: false, tried: false, score: 0 };
    const ac = psdoc.status === STATUS.STATUS_ACCEPTED;
    const score = typeof psdoc.score === 'number' ? psdoc.score : (ac ? 100 : 0);
    return { ac, tried: true, score };
}

function oneDecimal(n: number) {
    if (!Number.isFinite(n)) return '0';
    const rounded = Math.round(n * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

class DtojTrainingDetailHandler extends DtojDataHandler {
    @param('tid', Types.ObjectId)
    @param('part', Types.String, true)
    @param('q', Types.String, true)
    @param('stage', Types.String, true)
    async get(domainId: string, tid: ObjectId, part = '', q = '', stage = '') {
        const tdoc = await TrainingModel.get(domainId, tid);
        const chosen = pick(part, courseParts, '讲义');
        const dag = tdoc.dag || [];
        const pids = TrainingModel.getPids(dag);
        const loggedIn = this.user.hasPriv(PRIV.PRIV_USER_PROFILE);
        const canViewHidden = this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id;
        const [pdict, psdict, enrolledDocs, owner] = await Promise.all([
            ProblemModel.getList(domainId, pids, canViewHidden, false),
            loggedIn ? ProblemModel.getListStatus(domainId, this.user._id, pids) : {},
            TrainingModel.getMultiStatus(domainId, { docId: tid, uid: { $gt: 1 }, enroll: 1 }).project({ uid: 1 }).limit(500).toArray(),
            UserModel.getById(domainId, tdoc.owner),
        ]);
        const donePids = new Set<number>();
        const progPids = new Set<number>();
        for (const pid of pids) {
            const mark = markOfStatus(psdict[pid]);
            if (mark.ac) donePids.add(+pid);
            else if (mark.tried) progPids.add(+pid);
        }
        const doneNids = new Set<number>();
        const chapters = dag.map((node, index) => {
            const total = (node.pids || []).length;
            const nsdoc = {
                isDone: TrainingModel.isDone(node, doneNids, donePids),
                isProgress: TrainingModel.isProgress(node, doneNids, donePids, progPids),
                isOpen: TrainingModel.isOpen(node, doneNids, donePids, progPids),
            };
            if (nsdoc.isDone) doneNids.add(node._id);
            let state = '';
            let stateKey = '';
            if (loggedIn) {
                if (nsdoc.isDone) {
                    state = '已完成';
                    stateKey = 'done';
                } else if (nsdoc.isProgress) {
                    state = '进行中';
                    stateKey = 'progress';
                } else if (nsdoc.isOpen || total) {
                    state = '未开始';
                    stateKey = 'open';
                }
            }
            return {
                index: index + 1,
                id: node._id,
                title: node.title || '',
                note: noteOf(tdoc, node._id, index + 1),
                state,
                stateKey,
                pids: node.pids || [],
                problems: (node.pids || []).map((pid) => {
                    const pdoc = pdict[pid];
                    const missing = !pdoc?.docId;
                    const mine = markOfStatus(psdict[pid]);
                    const tried = missing ? 0 : (pdoc.nSubmit || 0);
                    const accepted = missing ? 0 : (pdoc.nAccept || 0);
                    return {
                        pid,
                        show: missing ? String(pid) : (pdoc.pid || pid),
                        title: missing ? '' : (pdoc.title || ''),
                        missing,
                        tags: missing ? [] : tagsOf(pdoc),
                        difficulty: !missing && typeof pdoc.difficulty === 'number' && pdoc.difficulty > 0 ? pdoc.difficulty : null,
                        level: !missing ? luoguLevel(pdoc.difficulty) : '',
                        rate: tried ? Math.round((100 * accepted) / tried) : null,
                        mine: mine.ac ? 'pass' : (mine.tried ? 'try' : ''),
                        mineScore: mine.tried && typeof psdict[pid]?.score === 'number' ? psdict[pid].score : null,
                    };
                }),
            };
        });
        const enrolledSelf = loggedIn && !!(await TrainingModel.getStatus(domainId, tid, this.user._id))?.enroll;
        if (enrolledSelf) {
            await TrainingModel.setStatus(domainId, tid, this.user._id, {
                doneNids: Array.from(doneNids),
                donePids: Array.from(donePids),
                done: doneNids.size === dag.length,
            });
        }
        const uids = enrolledDocs.map((item) => +item.uid);
        const canEdit = this.user.own(tdoc)
            ? this.user.hasPerm(PERM.PERM_EDIT_TRAINING_SELF)
            : this.user.hasPerm(PERM.PERM_EDIT_TRAINING);
        const stageIds = chapters.map((chapter) => String(chapter.index));
        const stagePick = pick(stage, ['', ...stageIds], '');
        const scope = stagePick ? chapters.filter((chapter) => String(chapter.index) === stagePick) : chapters;
        const scopePids = new Set<number>(scope.flatMap((chapter) => chapter.pids));
        let board: any[] = [];
        let stats = {
            people: '0', problems: String(scopePids.size), avgScore: '0', full: String(scopePids.size * 100), avgPass: '0', rate: '0', submitted: '0',
        };
        let members: any[] = [];
        if (chosen === '排行' || chosen === '详情') {
            const udict = uids.length
                ? await UserModel.getListForRender(domainId, uids, this.user.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO))
                : {};
            members = uids.map((uid) => {
                const udoc = udict[uid] || {};
                return {
                    uid,
                    name: personName(udoc, uid),
                    uname: String(udoc.uname || ''),
                    avatar: udoc.avatar || '',
                    self: uid === this.user._id,
                };
            });
            if (chosen === '排行' && uids.length && pids.length) {
                const rows = await ProblemModel.getMultiStatus(domainId, { uid: { $in: uids }, docId: { $in: pids } }).toArray();
                const byUser = new Map<number, Map<number, any>>();
                for (const row of rows) {
                    if (!byUser.has(row.uid)) byUser.set(row.uid, new Map());
                    byUser.get(row.uid).set(row.docId, row);
                }
                const needle = q.trim().toLowerCase();
                board = members.filter((member) => !needle
                    || member.name.toLowerCase().includes(needle)
                    || member.uname.toLowerCase().includes(needle)
                    || String(member.uid).includes(needle)).map((member) => {
                    const mine = byUser.get(member.uid) || new Map();
                    const cells = chapters.map((chapter) => {
                        let ac = 0;
                        let score = 0;
                        for (const pid of chapter.pids) {
                            const mark = markOfStatus(mine.get(pid));
                            if (mark.ac) ac += 1;
                            score += mark.score;
                        }
                        return { ac, total: chapter.pids.length, score: Math.round(score) };
                    });
                    let totalScore = 0;
                    let ac = 0;
                    let tried = false;
                    for (const pid of scopePids) {
                        const mark = markOfStatus(mine.get(pid));
                        totalScore += mark.score;
                        if (mark.ac) ac += 1;
                        if (mark.tried) tried = true;
                    }
                    return {
                        ...member,
                        cells,
                        score: Math.round(totalScore),
                        ac,
                        total: scopePids.size,
                        tried,
                    };
                }).sort((a, b) => b.score - a.score || b.ac - a.ac || a.uid - b.uid);
                const people = board.length;
                const scoreSum = board.reduce((sum, row) => sum + row.score, 0);
                const acSum = board.reduce((sum, row) => sum + row.ac, 0);
                const full = scopePids.size * 100;
                stats = {
                    people: String(people),
                    problems: String(scopePids.size),
                    avgScore: people ? oneDecimal(scoreSum / people) : '0',
                    full: String(full),
                    avgPass: people ? oneDecimal(acSum / people) : '0',
                    rate: people && full ? oneDecimal((100 * scoreSum) / (people * full)) : '0',
                    submitted: String(board.filter((row) => row.tried).length),
                };
            }
        }
        const progress = enrolledSelf && pids.length ? Math.round((100 * donePids.size) / pids.length) : null;
        let joined = '未登录';
        if (loggedIn) joined = enrolledSelf ? (doneNids.size === dag.length && dag.length ? '已完成' : '进行中') : '未参加';
        const about = String(tdoc.description || '').trim();
        const brief = String(tdoc.content || '').trim();
        this.view('dtoj_training_detail', {
            course: courseOf(tdoc),
            canEdit,
            part: chosen,
            parts: courseParts,
            loggedIn,
            enrolled: enrolledSelf,
            chapters,
            q,
            stage: stagePick,
            board,
            stats,
            members,
            attend: uids.length,
            progress,
            joined,
            brief,
            about: about && about !== brief ? about : '',
            owner: {
                name: personName(owner, tdoc.owner),
                avatar: owner?.avatar || '',
            },
        });
    }

    @param('tid', Types.ObjectId)
    async postEnroll(domainId: string, tid: ObjectId) {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        try {
            await TrainingModel.enroll(domainId, tid, this.user._id);
        } catch (err) {
            const name = String((err as any)?.name || (err as any)?.constructor?.name || '');
            if (!name.includes('TrainingAlreadyEnroll')) throw err;
        }
        this.back();
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

    async form(body: Record<string, any>) {
        const tdoc = this.tdoc;
        const vocab = body.vocab || await loadVocab(this.args.domainId);
        this.view('dtoj_training_edit', {
            pageName: tdoc ? 'dtoj_training_edit' : 'dtoj_training_create',
            directions: vocab.directions,
            kinds: vocab.kinds,
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
        await this.form({
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
        await this.form({ ...draft, hits: await searchProblems(domainId, pq) });
    }

    @param('title', Types.String, true)
    @param('content', Types.String, true)
    @param('direction', Types.String, true)
    @param('kind', Types.String, true)
    @param('pin', Types.String, true)
    @param('pq', Types.String, true)
    async postAdd(domainId: string, title = '', content = '', direction = '', kind = '', pin = '', pq = '') {
        const draft = this.draft(domainId, title, content, direction, kind, pin, pq);
        await this.form({
            ...draft,
            chapters: draft.chapters.concat([{ ...blankChapter }]),
            hits: await searchProblems(domainId, pq),
        });
    }

    async changeTag(
        domainId: string,
        draft: ReturnType<DtojTrainingEditHandler['draft']>,
        which: 'direction' | 'kind',
        mode: 'add' | 'drop',
        raw: string,
    ) {
        const vocab = await loadVocab(domainId);
        const key = which === 'direction' ? 'directions' : 'kinds';
        const name = cleanName(raw);
        const label = which === 'direction' ? '学习方向' : '课程类型';
        if (mode === 'add') {
            if (!name) {
                await this.form({ ...draft, vocab, error: `先写${label}。` });
                return;
            }
            if (name.length > 16) {
                await this.form({ ...draft, vocab, error: '标签不能超过 16 个字。' });
                return;
            }
            if (!vocab[key].includes(name)) {
                if (vocab[key].length >= 40) {
                    await this.form({ ...draft, vocab, error: '标签太多了，先删掉不用的。' });
                    return;
                }
                vocab[key].push(name);
                await saveVocab(domainId, vocab.directions, vocab.kinds);
            }
            draft[which] = name;
        } else if (name && vocab[key].includes(name)) {
            vocab[key] = vocab[key].filter((item) => item !== name);
            await saveVocab(domainId, vocab.directions, vocab.kinds);
            await clearMark(domainId, which, name);
            if (draft[which] === name) draft[which] = '';
        }
        await this.form({ ...draft, vocab });
    }

    @param('title', Types.String, true)
    @param('content', Types.String, true)
    @param('direction', Types.String, true)
    @param('kind', Types.String, true)
    @param('pin', Types.String, true)
    @param('pq', Types.String, true)
    @param('newDirection', Types.String, true)
    async postAddDirection(
        domainId: string, title = '', content = '', direction = '', kind = '', pin = '', pq = '', newDirection = '',
    ) {
        const draft = this.draft(domainId, title, content, direction, kind, pin, pq);
        await this.changeTag(domainId, draft, 'direction', 'add', newDirection);
    }

    @param('title', Types.String, true)
    @param('content', Types.String, true)
    @param('direction', Types.String, true)
    @param('kind', Types.String, true)
    @param('pin', Types.String, true)
    @param('pq', Types.String, true)
    @param('tagName', Types.String, true)
    async postDropDirection(
        domainId: string, title = '', content = '', direction = '', kind = '', pin = '', pq = '', tagName = '',
    ) {
        const draft = this.draft(domainId, title, content, direction, kind, pin, pq);
        await this.changeTag(domainId, draft, 'direction', 'drop', tagName);
    }

    @param('title', Types.String, true)
    @param('content', Types.String, true)
    @param('direction', Types.String, true)
    @param('kind', Types.String, true)
    @param('pin', Types.String, true)
    @param('pq', Types.String, true)
    @param('newKind', Types.String, true)
    async postAddKind(
        domainId: string, title = '', content = '', direction = '', kind = '', pin = '', pq = '', newKind = '',
    ) {
        const draft = this.draft(domainId, title, content, direction, kind, pin, pq);
        await this.changeTag(domainId, draft, 'kind', 'add', newKind);
    }

    @param('title', Types.String, true)
    @param('content', Types.String, true)
    @param('direction', Types.String, true)
    @param('kind', Types.String, true)
    @param('pin', Types.String, true)
    @param('pq', Types.String, true)
    @param('tagName', Types.String, true)
    async postDropKind(
        domainId: string, title = '', content = '', direction = '', kind = '', pin = '', pq = '', tagName = '',
    ) {
        const draft = this.draft(domainId, title, content, direction, kind, pin, pq);
        await this.changeTag(domainId, draft, 'kind', 'drop', tagName);
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
        const vocab = await loadVocab(domainId);
        const nextDirection = pick(direction, vocab.directions, '');
        const nextKind = pick(kind, vocab.kinds, '');
        const nextPin = pinOf(pin);
        const { chapters } = draft;
        if (!nextTitle) {
            await this.form({ ...draft, vocab, error: '先写标题。' });
            return;
        }
        if (nextTitle.length > 128) {
            await this.form({ ...draft, vocab, error: '标题不能超过 128 个字。' });
            return;
        }
        if (nextContent.length > 500) {
            await this.form({ ...draft, vocab, error: '简介不能超过 500 个字。' });
            return;
        }
        if (nextPin == null) {
            await this.form({ ...draft, vocab, error: '置顶要写非负整数。' });
            return;
        }
        if ((!!this.tdoc?.pin) !== (!!nextPin)) this.checkPerm(PERM.PERM_PIN_TRAINING);
        const plan = await buildPlan(domainId, chapters);
        if ('error' in plan && plan.error) {
            await this.form({ ...draft, vocab, error: plan.error });
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
    dtoj_training_detail: '课程',
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
