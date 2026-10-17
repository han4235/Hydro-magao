import { escapeRegExp } from 'lodash';
import {
    Context, DomainModel, ObjectId, OplogModel, PERM, PRIV, ProblemModel, ProblemNotFoundError, STATUS, StorageModel, TrainingModel,
    Types, UserModel, ValidationError, param,
} from 'hydrooj';
import { DtojDataHandler, dropEarlierRoutes, pick, queryOf, queryString } from 'dtoj-ui';
import {
    courseKinds, directionBucket, directions, listed, markOf, noteOf,
} from './data';
import { lastUnfinishedProblem, markProblemVisited } from './recent';

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

/**
 * dag 是整份写回去的，改之前先拷一层。
 * TrainingModel.get 出来的 tdoc 可能在缓存里，直接改它的 node.pids 会改到别人手里那份。
 */
function cloneDag(dag: any[] = []) {
    return dag.map((node) => ({ ...node, pids: [...(node.pids || [])] }));
}

function shortChapterTitle(title: string) {
    const t = String(title || '').trim();
    const m = t.match(/第[^章]*章\s*(.+)$/);
    if (m) return m[1].trim();
    if (t.length > 28) return `${t.slice(0, 28)}…`;
    return t;
}

function courseIntro(title: string, tdoc: any) {
    const name = String(title || '').trim();
    const desc = String(tdoc.description || '').trim();
    const content = String(tdoc.content || '').trim();
    let intro = desc || (content !== name ? content : '');
    if (!intro) return '';
    if (name && intro.startsWith(name)) intro = intro.slice(name.length).trim();
    if (intro.startsWith('·')) intro = intro.slice(1).trim();
    return intro;
}

function courseOf(tdoc: any) {
    const dag = tdoc.dag || [];
    const mark = markOf(tdoc);
    const intro = courseIntro(tdoc.title, tdoc);
    return {
        id: tdoc.docId.toHexString(),
        title: tdoc.title,
        brief: intro,
        chapters: dag.length,
        problems: TrainingModel.getPids(dag).length,
        direction: mark.direction,
        kind: mark.kind,
        preview: dag.slice(0, 2).map((node, index) => ({
            n: String(index + 1).padStart(2, '0'),
            title: node.title || '',
            label: shortChapterTitle(node.title || ''),
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

function courseId(tdoc: any) {
    return tdoc.docId.toHexString();
}

function sortCourses(docs: any[], order: string[]) {
    const rank = new Map<string, number>();
    order.forEach((id, index) => {
        if (!rank.has(id)) rank.set(id, index);
    });
    return docs.slice().sort((a, b) => {
        const ia = rank.get(courseId(a));
        const ib = rank.get(courseId(b));
        const aKnown = ia != null;
        const bKnown = ib != null;
        if (aKnown && bKnown) return ia - ib;
        if (aKnown !== bKnown) return aKnown ? -1 : 1;
        const pin = (b.pin || 0) - (a.pin || 0);
        if (pin) return pin;
        return courseId(b).localeCompare(courseId(a));
    });
}

async function loadVocab(domainId: string) {
    const ddoc = await DomainModel.get(domainId);
    const saved = (ddoc as any)?.dtojTraining;
    const order = Array.isArray(saved?.order)
        ? saved.order.map((id: unknown) => String(id || '')).filter((id: string) => /^[a-f0-9]{24}$/.test(id))
        : [];
    return {
        directions: namesOf(saved?.directions, directions),
        kinds: namesOf(saved?.kinds, courseKinds),
        order,
    };
}

async function saveVocab(domainId: string, nextDirections: string[], nextKinds: string[]) {
    const ddoc = await DomainModel.get(domainId);
    const saved = (ddoc as any)?.dtojTraining || {};
    await DomainModel.edit(domainId, {
        dtojTraining: { ...saved, directions: nextDirections, kinds: nextKinds },
    } as any);
}

async function clearMark(domainId: string, field: 'direction' | 'kind', name: string) {
    const docs = await TrainingModel.getMulti(domainId, {}).toArray();
    for (const tdoc of docs) {
        if (markOf(tdoc)[field] !== name) continue;
        const dtoj = { ...(tdoc.dtoj || {}), [field]: '' };
        // eslint-disable-next-line no-await-in-loop
        await TrainingModel.edit(domainId, tdoc.docId, { dtoj } as any);
    }
}

async function renameMark(domainId: string, field: 'direction' | 'kind', from: string, to: string) {
    const docs = await TrainingModel.getMulti(domainId, {}).toArray();
    for (const tdoc of docs) {
        const mark = markOf(tdoc);
        if (mark[field] !== from) continue;
        const dtoj = {
            ...(tdoc.dtoj || {}),
            direction: field === 'direction' ? to : (tdoc.dtoj?.direction ?? mark.direction),
            kind: field === 'kind' ? to : (tdoc.dtoj?.kind ?? mark.kind),
        };
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
        const dir = directionBucket(mark.direction, dirs);
        if (direction[dir] != null) direction[dir] += 1;
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

async function learningOf(domainId: string, user: any) {
    if (!user.hasPriv(PRIV.PRIV_USER_PROFILE)) return [];
    const statuses = await TrainingModel.getMultiStatus(domainId, { uid: user._id, enroll: 1 }).limit(40).toArray();
    if (!statuses.length) return [];
    statuses.sort((a, b) => b._id.toString().localeCompare(a._id.toString()));
    const docs = await TrainingModel.getMulti(domainId, { docId: { $in: statuses.map((item) => item.docId) } }).toArray();
    const byId = new Map(docs.map((tdoc) => [tdoc.docId.toHexString(), tdoc]));
    const rows = [];
    for (const status of statuses) {
        const tdoc = byId.get(status.docId.toHexString());
        if (!tdoc) continue;
        const pids = TrainingModel.getPids(tdoc.dag || []);
        const doneSet = new Set((status.donePids || []).map((pid: number) => +pid));
        const done = pids.filter((pid) => doneSet.has(+pid)).length;
        if (pids.length && done >= pids.length) continue;
        const progress = pids.length ? Math.round((100 * done) / pids.length) : 0;
        rows.push({ ...courseOf(tdoc), learning: true, progress });
    }
    return rows;
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
        const searched = sortCourses(await TrainingModel.getMulti(domainId, query).toArray(), vocab.order);
        const hotDocs = searched.filter((tdoc) => tdoc.pin > 0);
        const learning = await learningOf(domainId, this.user);
        const lastProblem = await lastUnfinishedProblem(
            domainId, this.user, this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id,
        );
        const counts = tally(searched, vocab.directions, vocab.kinds);
        const matched = searched.filter((tdoc) => listed(tdoc, direction, kind, vocab.directions));
        const pageSize = 12;
        const pages = matched.length ? Math.floor((matched.length + pageSize - 1) / pageSize) : 0;
        const tdocs = matched.slice((page - 1) * pageSize, page * pageSize);
        this.view('dtoj_training', {
            directions: vocab.directions,
            kinds: vocab.kinds,
            direction,
            kind,
            q,
            hot: hotDocs.map(courseOf),
            learning,
            lastProblem,
            courses: tdocs.map(courseOf),
            page,
            pages,
            qs: queryString({ q, direction, kind }),
            counts,
            shown: matched.length,
            canCreate: this.user.hasPerm(PERM.PERM_CREATE_TRAINING),
            canSort: this.user.hasPerm(PERM.PERM_EDIT_TRAINING),
        });
    }

    @param('ids', Types.ArrayOf(Types.String))
    @param('page', Types.PositiveInt, true)
    @param('q', Types.String, true)
    @param('direction', Types.String, true)
    @param('kind', Types.String, true)
    async postReorder(domainId: string, ids: string[] = [], page = 1, q = '', direction = '', kind = '') {
        this.checkPerm(PERM.PERM_EDIT_TRAINING);
        const vocab = await loadVocab(domainId);
        direction = pick(direction, vocab.directions, '');
        kind = pick(kind, vocab.kinds, '');
        const query: any = {};
        if (q) query.title = { $regex: new RegExp(escapeRegExp(q), 'i') };
        await this.ctx.parallel('training/list', query, this);
        const catalog = sortCourses(await TrainingModel.getMulti(domainId, query).toArray(), vocab.order);
        const matched = catalog.filter((tdoc) => listed(tdoc, direction, kind, vocab.directions));
        const pageSize = 12;
        const start = (page - 1) * pageSize;
        const windowIds = matched.slice(start, start + pageSize).map(courseId);
        const posted = ids.map((id) => String(id || ''));
        const same = posted.length === windowIds.length
            && new Set(posted).size === posted.length
            && posted.every((id) => windowIds.includes(id));
        if (!same) {
            this.response.status = 400;
            this.response.body = { error: '顺序不对' };
            this.response.template = '';
            return;
        }
        const visible = new Set(matched.map(courseId));
        const nextVisible = matched.map(courseId);
        posted.forEach((id, index) => { nextVisible[start + index] = id; });
        const queue = nextVisible.slice();
        const next = catalog.map((tdoc) => (visible.has(courseId(tdoc)) ? queue.shift() : courseId(tdoc)));
        while (queue.length) next.push(queue.shift());
        const ddoc = await DomainModel.get(domainId);
        const saved = (ddoc as any)?.dtojTraining || {};
        await DomainModel.edit(domainId, { dtojTraining: { ...saved, order: next } } as any);
        this.response.body = { ok: true };
        this.response.template = '';
    }

    @param('names', Types.ArrayOf(Types.String))
    @param('field', Types.String)
    async postReorderTags(domainId: string, names: string[] = [], field = '') {
        this.checkPerm(PERM.PERM_EDIT_TRAINING);
        const key = field === 'direction' || field === 'kind' ? field : '';
        if (!key) {
            this.response.status = 400;
            this.response.body = { error: '顺序不对' };
            this.response.template = '';
            return;
        }
        const vocab = await loadVocab(domainId);
        const current = key === 'kind' ? vocab.kinds : vocab.directions;
        const posted = names.map((name) => String(name || '').trim());
        const same = posted.length === current.length
            && new Set(posted).size === posted.length
            && posted.every((name) => current.includes(name));
        if (!same) {
            this.response.status = 400;
            this.response.body = { error: '顺序不对' };
            this.response.template = '';
            return;
        }
        await saveVocab(
            domainId,
            key === 'direction' ? posted : vocab.directions,
            key === 'kind' ? posted : vocab.kinds,
        );
        this.response.body = { ok: true };
        this.response.template = '';
    }
}

const courseParts = ['讲义', '练习', '排行', '详情'];

function personName(udoc: any, uid: number) {
    const name = String(udoc?.displayName || udoc?.uname || '').trim();
    return name || `用户 ${uid}`;
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
        const chosen = pick(part, courseParts, '练习');
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
                        hang: !missing && String(pdoc.title || '').startsWith('【'),
                        missing,
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
        // 练习列表里的「移除这道题」「拖动排序」只给管理员和教师。
        // 不能用上面那个 canEdit：学生自己建的课程是可编辑的（PERM_EDIT_TRAINING_SELF 在默认权限里），
        // 照它放行的话学生也会看到这两个按钮。
        const canManageProblems = this.user.hasPerm(PERM.PERM_EDIT_TRAINING);
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
                const udoc = (udict[uid] || {}) as { uname?: string; avatar?: string };
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
            canManageProblems,
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

    /**
     * 把一道题从某一章里撤掉（练习列表里那个红叉）。
     *
     * 门槛用 PERM_EDIT_TRAINING：管理员和教师有，学生没有。跟页面上那个 canEdit 不是一回事，
     * 后者对「自己建的课程」放行，而 PERM_EDIT_TRAINING_SELF 在默认权限里，学生也拿得到。
     */
    @param('tid', Types.ObjectId)
    @param('nodeId', Types.PositiveInt)
    @param('pid', Types.PositiveInt)
    async postDropProblem(domainId: string, tid: ObjectId, nodeId: number, pid: number) {
        this.checkPerm(PERM.PERM_EDIT_TRAINING);
        const tdoc = await TrainingModel.get(domainId, tid);
        const dag = cloneDag(tdoc.dag || []);
        const node = dag.find((item) => +item._id === nodeId);
        const at = node ? node.pids.findIndex((item) => +item === pid) : -1;
        if (at < 0) {
            this.response.status = 404;
            this.response.body = { error: '这一章里没有这道题' };
            this.response.template = '';
            return;
        }
        node.pids.splice(at, 1);
        await TrainingModel.edit(domainId, tid, { dag } as any);
        await OplogModel.log(this, 'dtoj.training.dropProblem', {
            domainId, tid, nodeId, pid, left: node.pids.length,
        });
        this.response.body = { ok: true, left: node.pids.length };
        this.response.template = '';
    }

    /**
     * 保存某一章里题目的新顺序（拖完发过来的）。
     *
     * 传上来的 pid 名单必须和库里那一章的完全一致，只许换顺序：少一道、多一道、有重复都按 400 顶回去。
     * 页面可能是旧的（别人刚删过题），与其拿一份过期的名单覆盖，不如让前端刷新重来。
     */
    @param('tid', Types.ObjectId)
    @param('nodeId', Types.PositiveInt)
    @param('pids', Types.NumericArray)
    async postReorderProblems(domainId: string, tid: ObjectId, nodeId: number, pids: number[] = []) {
        this.checkPerm(PERM.PERM_EDIT_TRAINING);
        const tdoc = await TrainingModel.get(domainId, tid);
        const dag = cloneDag(tdoc.dag || []);
        const node = dag.find((item) => +item._id === nodeId);
        const same = !!node && pids.length === node.pids.length
            && new Set(pids).size === pids.length
            && pids.every((pid) => node.pids.includes(+pid));
        if (!same) {
            this.response.status = 400;
            this.response.body = { error: '题目对不上，刷新页面再试' };
            this.response.template = '';
            return;
        }
        node.pids = pids.map((pid) => +pid);
        await TrainingModel.edit(domainId, tid, { dag } as any);
        this.response.body = { ok: true };
        this.response.template = '';
    }
}

/**
 * 题目页「添加至课程」弹层要的清单：域内每门课程的每一章，外加这题在不在该章。
 *
 * 顺序跟 /training 列表一致（教师排过的在前，其余按置顶、再按 id 倒序），
 * 这样老师在哪见过的课程，在弹层里还是同一批顺序。
 * 一章都没有的课程不列 —— 放不进去，摆在那儿只会让人以为能选。
 *
 * direction 走 directionBucket、kind 过一遍词表，都跟 /training 的 tally 同一套规则：
 * 不这么归一的话，弹层里的标签计数会和列表页上的数字对不上。
 *
 * pids 用 + 转数字再比：TrainingModel.getMulti 拿到的 dag 里 pids 可能是字符串，
 * 只有 get() 会把它转成数字，这里走的是前者。
 */
async function courseAddOptions(domainId: string, pid: number) {
    const vocab = await loadVocab(domainId);
    const docs = sortCourses(await TrainingModel.getMulti(domainId, {}).toArray(), vocab.order);
    const courses = [];
    let total = 0;
    for (const tdoc of docs) {
        const dag = tdoc.dag || [];
        if (!dag.length) continue;
        total += dag.length;
        const mark = markOf(tdoc);
        courses.push({
            id: courseId(tdoc),
            title: tdoc.title,
            direction: directionBucket(mark.direction, vocab.directions),
            kind: vocab.kinds.includes(mark.kind) ? mark.kind : '',
            chapters: dag.map((node, index) => {
                const pids = (node.pids || []).map((item) => +item);
                return {
                    nodeId: node._id,
                    index: index + 1,
                    title: node.title || '',
                    has: pids.includes(+pid),
                };
            }),
        });
    }
    // 词表也一并给模板：标签要按 /training 的那套名字和顺序渲染
    return { courses, total, directions: vocab.directions, kinds: vocab.kinds };
}

/**
 * 题目页侧栏「添加至课程」：把这一题塞进若干门课程的某一章里。
 *
 * 门槛用 PERM_EDIT_TRAINING，跟课程详情页的「移除这道题 / 拖动排序」一致：
 * 学生自己建的课程能改标题和章节标题（PERM_EDIT_TRAINING_SELF），
 * 但章节里放哪些题只对管理员和教师开放。
 *
 * targets 是「课程 id:章节 id」的列表，来自弹层里勾中的那些行。整批先校验再写：
 * 页面可能是旧的（别人刚删过那一章），与其写一半留下半截状态，不如整个退回让人刷新重来。
 */
class DtojProblemAddCourseHandler extends DtojDataHandler {
    @param('pid', Types.ProblemId)
    @param('targets', Types.CommaSeperatedArray)
    async post(domainId: string, pid: string | number, targets: string[] = []) {
        this.checkPerm(PERM.PERM_EDIT_TRAINING);
        // 校验器按逗号切但不裁空白，空值也照收，所以这里自己清一遍
        const picked = [...new Set(targets.map((item) => item.trim()).filter((item) => item))];
        if (!picked.length) throw new ValidationError('targets');
        const pdoc = await ProblemModel.get(domainId, pid);
        if (!pdoc) throw new ProblemNotFoundError(domainId, pid);
        // 看不见的隐藏题不能往课程里塞；门槛与 core 的题目页一致（doThrow 默认开启）
        await ProblemModel.getList(
            domainId, [pdoc.docId], this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id,
        );

        // 先按课程归拢：一门课只加载、只写回一次，
        // 否则同一份 dag 会被同一批里的其余目标按加载时的旧值覆盖掉。
        const byCourse = new Map<string, { tid: ObjectId, nodeIds: number[] }>();
        for (const item of picked) {
            const at = item.indexOf(':');
            const tid = at < 0 ? '' : item.slice(0, at);
            const nodeId = Number(item.slice(at + 1));
            if (!/^[a-f0-9]{24}$/.test(tid) || !Number.isSafeInteger(nodeId) || nodeId <= 0) {
                throw new ValidationError('targets');
            }
            const row = byCourse.get(tid) || { tid: new ObjectId(tid), nodeIds: [] };
            row.nodeIds.push(nodeId);
            byCourse.set(tid, row);
        }

        const plans: { tid: ObjectId, nodeIds: number[], dag: any[] }[] = [];
        for (const row of byCourse.values()) {
            // eslint-disable-next-line no-await-in-loop
            const tdoc = await TrainingModel.get(domainId, row.tid);
            const dag = cloneDag(tdoc.dag || []);
            for (const nodeId of row.nodeIds) {
                if (!dag.some((node) => +node._id === nodeId)) {
                    throw new ValidationError('targets', null, '课程章节对不上，刷新页面再试');
                }
            }
            plans.push({ tid: row.tid, nodeIds: row.nodeIds, dag });
        }

        for (const plan of plans) {
            let added = 0;
            for (const node of plan.dag) {
                if (!plan.nodeIds.includes(+node._id)) continue;
                // 已经在这一章里的不重复加：弹层把那几行设成勾上但不给改，正常走不到这儿，
                // 留着是防两个人同时添同一题时插进两条一样的 pid。
                if (node.pids.some((item) => +item === +pdoc.docId)) continue;
                node.pids.push(pdoc.docId);
                added += 1;
            }
            if (!added) continue;
            // eslint-disable-next-line no-await-in-loop
            await TrainingModel.edit(domainId, plan.tid, { dag: plan.dag } as any);
            // eslint-disable-next-line no-await-in-loop
            await OplogModel.log(this, 'dtoj.training.addProblem', {
                domainId, tid: plan.tid, pid: pdoc.docId, nodeIds: plan.nodeIds, added,
            });
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
        if (String(this.args.suggest || '') === '1') {
            this.response.body = { hits: await searchProblems(domainId, pq) };
            this.response.template = '';
            return;
        }
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

    @param('title', Types.String, true)
    @param('content', Types.String, true)
    @param('direction', Types.String, true)
    @param('kind', Types.String, true)
    @param('pin', Types.String, true)
    @param('pq', Types.String, true)
    @param('chapterIndex', Types.String, true)
    async postDropChapter(
        domainId: string, title = '', content = '', direction = '', kind = '', pin = '', pq = '', chapterIndex = '',
    ) {
        const draft = this.draft(domainId, title, content, direction, kind, pin, pq);
        const index = Number(chapterIndex);
        const chapters = Number.isInteger(index) && index >= 0
            ? draft.chapters.filter((_, i) => i !== index)
            : draft.chapters;
        await this.form({
            ...draft,
            chapters,
            hits: await searchProblems(domainId, pq),
        });
    }

    async changeTag(
        domainId: string,
        draft: ReturnType<DtojTrainingEditHandler['draft']>,
        which: 'direction' | 'kind',
        mode: 'add' | 'drop' | 'rename',
        raw: string,
        nextRaw = '',
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
        } else if (name && vocab[key].includes(name)) {
            const next = cleanName(nextRaw);
            if (!next) {
                await this.form({ ...draft, vocab, error: `先写新的${label}。` });
                return;
            }
            if (next.length > 16) {
                await this.form({ ...draft, vocab, error: '标签不能超过 16 个字。' });
                return;
            }
            if (next !== name) {
                const at = vocab[key].indexOf(name);
                if (vocab[key].includes(next)) vocab[key].splice(at, 1);
                else vocab[key][at] = next;
                await saveVocab(domainId, vocab.directions, vocab.kinds);
                await renameMark(domainId, which, name, next);
                if (draft[which] === name) draft[which] = next;
            }
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

    @param('title', Types.String, true)
    @param('content', Types.String, true)
    @param('direction', Types.String, true)
    @param('kind', Types.String, true)
    @param('pin', Types.String, true)
    @param('pq', Types.String, true)
    @param('tagName', Types.String, true)
    @param('tagNext', Types.String, true)
    async postRenameDirection(
        domainId: string, title = '', content = '', direction = '', kind = '', pin = '', pq = '', tagName = '', tagNext = '',
    ) {
        const draft = this.draft(domainId, title, content, direction, kind, pin, pq);
        await this.changeTag(domainId, draft, 'direction', 'rename', tagName, tagNext);
    }

    @param('title', Types.String, true)
    @param('content', Types.String, true)
    @param('direction', Types.String, true)
    @param('kind', Types.String, true)
    @param('pin', Types.String, true)
    @param('pq', Types.String, true)
    @param('tagName', Types.String, true)
    @param('tagNext', Types.String, true)
    async postRenameKind(
        domainId: string, title = '', content = '', direction = '', kind = '', pin = '', pq = '', tagName = '', tagNext = '',
    ) {
        const draft = this.draft(domainId, title, content, direction, kind, pin, pq);
        await this.changeTag(domainId, draft, 'kind', 'rename', tagName, tagNext);
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
    // 题目页侧栏的「添加至课程」，见 DtojProblemAddCourseHandler
    ctx.Route('dtoj_problem_add_course', '/p/:pid/add-course', DtojProblemAddCourseHandler, PERM.PERM_EDIT_TRAINING);
    dropEarlierRoutes(ctx, ['/training', '/training/create', '/training/:tid', '/training/:tid/edit']);

    // 弹层要的课程章节清单。只给加得进去的人算，学生看题目页时这一段直接跳过。
    ctx.on('handler/after/ProblemDetail#get', async (that) => {
        const body = that.response.body as Record<string, any> | undefined;
        if (!body?.pdoc) return;
        if (!that.user.hasPerm(PERM.PERM_EDIT_TRAINING)) return;
        body.courseAdd = await courseAddOptions(that.args.domainId, body.pdoc.docId);
    });

    // 记下「这个人刚看过这道题」，训练页顶部那条「继续上次」就靠它。
    // 游客不记：写进去也永远不会有一条链接给游客看，只是白白多一次写入。
    // 写失败不能把题目页拖垮：这只是个便利入口，记不上就算了。
    ctx.on('handler/after/ProblemDetail#get', async (that) => {
        const body = that.response.body as Record<string, any> | undefined;
        const pdoc = body?.pdoc;
        if (!pdoc?.docId) return;
        if (!that.user.hasPriv(PRIV.PRIV_USER_PROFILE)) return;
        try {
            await markProblemVisited(that.args.domainId, that.user._id, pdoc.docId);
        } catch {
            // 忽略：记录失败不影响看题
        }
    });

    for (const lang of ['zh', 'zh_TW', 'en', 'kr']) {
        ctx.i18n.load(lang, titles);
    }
}
