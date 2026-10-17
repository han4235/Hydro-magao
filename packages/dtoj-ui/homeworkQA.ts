import {
    ContestModel, DocumentModel, MessageModel, ObjectId, STATUS, db,
} from 'hydrooj';

/**
 * 作业答疑：学生在自己的作业页提问，老师收到站内消息；老师回复后学生也收到。
 *
 * 消息一律以「当事人」的身份发出，而不是系统账号：学生提问/认领/交完，发件人是该学生，
 * 老师那边落成一个学生一个会话；老师回复，发件人是该老师，学生那边同理。
 *
 * 存储复用 Hydro 的「澄清」文档（document 集合里 docType = TYPE_CONTEST_CLARIFICATION）：
 * parentType / parentId 把问题挂在某一次作业上，正文在 content，多轮往返在 reply 数组。
 * 没有再走比赛那条 clarify 路由，是因为它硬要求「已认领 + 比赛进行中」，
 * 而作业结束之后往往才是答疑高峰。
 *
 * 在澄清文档上多存两个字段：
 *   subject  —— 问的是哪道题（0 = 整份作业），沿用澄清原有的题号语义
 *   isPublic —— 是否公开给同一次作业的其他人；默认私问，只有提问的人自己和老师看得到
 *
 * 另有一个独立集合记录「谁已经交完」，用来保证完成通知每人只发一次。
 * 见 markCompletedOnce 的说明。
 */

const DOC_TYPE = DocumentModel.TYPE_CONTEST_CLARIFICATION;
const PARENT_TYPE = DocumentModel.TYPE_CONTEST;

/** 一条作业提问，reply 里是它和它的往返回复。 */
export interface HomeworkQuestion {
    _id: ObjectId;
    owner: number;
    content: string;
    subject?: number;
    /** 问的是哪道题，由 listHomeworkQuestions 补好给模板直接用 */
    subjectLabel?: string;
    isPublic?: boolean;
    reply?: { content: string, owner: number, isTeacher?: boolean }[];
}

/** 一条站内通知：说什么、占位符填什么、点进去看哪里。 */
interface Notice {
    message: string;
    params: (string | number)[];
    url: string;
    /**
     * 提问通知带上答疑文档的 id，供 bridgeInboxReply 定位。
     * 会话是按对话方聚成一条的，不带上这个就分不清老师回的是哪条提问。
     */
    did?: string;
}

/** 这次作业的老师：创建者与名单上的作业管理员。 */
function teacherIds(tdoc: any): number[] {
    return Array.from(new Set<number>(
        [tdoc?.owner, ...(tdoc?.maintainer || [])]
            .filter((uid) => Number.isInteger(uid) && (uid as number) > 0),
    ));
}

/**
 * 以 from 的身份给若干人发站内消息，文案走 i18n（FLAG_I18N），未读会让顶栏冒红点。
 *
 * 发件人是谁，收件人就排除谁：老师自己给自己开的作业认领、或反问自己提的广播问题时，
 * 不必收到自己的消息。
 */
async function sendTo(from: number, uids: number[], notice: Notice, flag = MessageModel.FLAG_UNREAD) {
    const to = uids.filter((uid) => uid !== from);
    if (!to.length) return;
    await MessageModel.send(
        from, to, JSON.stringify(notice),
        flag | MessageModel.FLAG_I18N,
    );
}

/**
 * 某位学生有事要告诉这次作业的老师，消息以该学生的身份发出。
 *
 * 不借用系统账号（uid=1）是因为消息列表按对话方分组：学生在自己的作业页提了问、
 * 认了领、交完了题，这些在老师那边都该落成「和这位学生的会话」；
 * 以系统账号发则全部并进同一个会话，分不清是谁，也回不了话。
 */
async function notifyTeachers(tdoc: any, from: number, notice: Notice) {
    await sendTo(from, teacherIds(tdoc), notice);
}

/**
 * 某次作业下来访者看得到的提问。
 *
 * 老师（作业归属者、作业管理员、或有编辑任意作业权限的人）看全部；
 * 其他人只看自己提的，以及别人标了公开的。
 */
export async function listHomeworkQuestions(
    domainId: string, tdoc: any, viewer: { uid: number, canManage: boolean },
): Promise<HomeworkQuestion[]> {
    const scope = viewer.canManage
        ? {}
        : { $or: [{ owner: viewer.uid }, { isPublic: true }] };
    const docs = await DocumentModel.getMulti(domainId, DOC_TYPE, {
        parentType: PARENT_TYPE, parentId: tdoc.docId, ...scope,
    }).sort({ _id: -1 }).limit(200).toArray();
    const pids: number[] = tdoc.pids || [];
    const teachers = new Set<number>(teacherIds(tdoc));
    return (docs as unknown as HomeworkQuestion[]).map((doc) => {
        const idx = pids.indexOf(doc.subject || 0);
        return {
            ...doc,
            subjectLabel: idx >= 0 ? `第 ${idx + 1} 题` : '整份作业',
            reply: (doc.reply || []).map((r) => ({ ...r, isTeacher: teachers.has(r.owner) })),
        };
    });
}

/** 学生提问。落库后给这次作业的老师都发一条消息。 */
export async function askHomeworkQuestion(
    domainId: string, tdoc: any, uid: number, content: string,
    isPublic: boolean, subject: number, ip: string, url: string,
) {
    const did = await DocumentModel.add(
        domainId, content, uid, DOC_TYPE, null, PARENT_TYPE, tdoc.docId,
        { ip, subject, isPublic } as any,
    );
    const idx = (tdoc.pids || []).indexOf(subject);
    const about = idx >= 0 ? `第 ${idx + 1} 题` : '整份作业';
    await notifyTeachers(tdoc, uid, {
        message: '想请教作业 {0}（{1}），点进来看看。',
        params: [tdoc.title, about],
        url,
        did: String(did),
    });
}

/** 老师回复一条提问，并通知提问的人。 */
export async function replyHomeworkQuestion(
    domainId: string, tdoc: any, did: ObjectId, uid: number,
    content: string, ip: string, url: string,
) {
    await DocumentModel.push(
        domainId, DOC_TYPE, did, 'reply',
        { content, owner: uid, ip } as any,
    );
    const qdoc = await DocumentModel.get(domainId, DOC_TYPE, did) as unknown as HomeworkQuestion | null;
    if (!qdoc?.owner) return;
    // 以回复的老师为发件人，学生那边落成「和这位老师的会话」；
    // 老师回自己提的广播问题时 sendTo 会把收件人剔空，不再重复判一次
    await sendTo(uid, [qdoc.owner], {
        message: '回复了你在作业 {0} 里的提问，点进来看看。',
        params: [tdoc.title],
        url,
    });
}

/**
 * 老师在站内消息会话里顺手回了一句，把这句话也写进他回的那条提问。
 *
 * 会话按对话方聚成一条，一条会话里可能夹着该学生在多份作业上的提问，只看会话分不清回的是哪条。
 * 所以取这位学生发给该老师、最近一条带 did 的通知，它对应的提问就是这次回话的对象。
 *
 * did 来自消息正文，而正文是对方能控制的，所以最后那道「发话人得是这份作业的老师」的校验不能省：
 * 学生即便伪造出 did，也过不了这一关，写不进答疑。
 */
export async function bridgeInboxReply(
    fromUid: number, toUid: number, content: string, ip: string,
) {
    if (fromUid === toUid) return;
    const recent = await db.collection('message')
        .find({ from: toUid, to: fromUid }).sort({ _id: -1 }).limit(50).toArray();
    let did: string | undefined;
    for (const row of recent) {
        try {
            const parsed = JSON.parse(row.content);
            if (typeof parsed?.did === 'string') { did = parsed.did; break; }
        } catch {
            // 普通的纯文本消息，跳过
        }
    }
    if (!did) return;
    let qid: ObjectId;
    try {
        qid = new ObjectId(did);
    } catch {
        return;
    }
    const qdoc = await db.collection('document').findOne({ _id: qid, docType: DOC_TYPE }) as any;
    if (!qdoc) return;
    const tdoc = await ContestModel.get(qdoc.domainId, qdoc.parentId) as any;
    if (!tdoc || !teacherIds(tdoc).includes(fromUid)) return;
    await DocumentModel.push(
        qdoc.domainId, DOC_TYPE, qdoc._id, 'reply',
        { content, owner: fromUid, ip } as any,
    );
}

/** 学生认领作业时告诉老师，消息以该学生的身份发出。 */
export async function notifyHomeworkAttended(
    tdoc: any, uid: number, url: string,
) {
    await notifyTeachers(tdoc, uid, {
        message: '认领了作业 {0}。',
        params: [tdoc.title],
        url,
    });
}

interface HomeworkDoneDoc {
    _id: ObjectId;
    domainId: string;
    tid: ObjectId;
    uid: number;
    at: Date;
}

declare module 'hydrooj' {
    interface Collections {
        dtoj_homework_done: HomeworkDoneDoc;
    }
}

const DONE_COLL = 'dtoj_homework_done';
let doneIndexEnsured = false;

/**
 * 首次「交完」返回 true，之后同一个人的重复提交一律返回 false。
 *
 * 靠集合上的唯一索引去重，而不是先查后写：提交可能并发，查与写之间的窗口
 * 会让同一个人被通知两次。写不进去（11000）就说明已经通知过。
 */
async function markCompletedOnce(domainId: string, tid: ObjectId, uid: number) {
    if (!doneIndexEnsured) {
        await db.collection(DONE_COLL).createIndex({ domainId: 1, tid: 1, uid: 1 }, { unique: true });
        doneIndexEnsured = true;
    }
    try {
        await db.collection(DONE_COLL).insertOne({
            _id: new ObjectId(), domainId, tid, uid, at: new Date(),
        });
        return true;
    } catch (e: any) {
        if (e?.code === 11000) return false;
        throw e;
    }
}

/** 学生交完这次作业的全部题目时告诉老师，以该学生的身份发出，每人只发一次。 */
export async function notifyHomeworkCompleted(
    domainId: string, tdoc: any, uid: number, url: string,
) {
    if (!(await markCompletedOnce(domainId, tdoc.docId, uid))) return;
    await notifyTeachers(tdoc, uid, {
        message: '交完了作业 {0} 的全部 {1} 道题。',
        params: [tdoc.title, (tdoc.pids || []).length],
        url,
    });
}

export interface HomeworkProgressRow {
    uid: number;
    /** 名单里但还没认领，进度表照样列出来，标「待认领」 */
    attended: boolean;
    done: number;
    lastAt: Date | null;
}

/** 一道题在整个班里的情况，给老师看的题目表用。 */
export interface HomeworkProblemStat {
    /** 通过（AC）的人数 */
    ac: number;
    /** 交过的人数，一个学生只算一次 */
    submitted: number;
    /** 这份作业里这道题最后一次提交的时间 */
    lastAt: Date | null;
}

/**
 * 这次作业的完成情况，以「编辑页保存的分配人」为准。
 *
 * roster 非空时列出名单上的每个人：认领了的给完成数与最后提交时间，
 * 没认领的标出来但完成记 0；已经不在名单上的认领记录不再显示。
 * roster 为空（作业对全站可见）时退回原来的口径，只列认领过的人。
 *
 * 只统计在作业题目列表里的提交（journal 会留下曾经提交过的题，改过题目列表后
 * 可能残留旧 pid）。按「交了最少」排前面，方便老师先看到该催的人。
 */
export async function listHomeworkProgress(domainId: string, tdoc: any, roster?: Set<number> | null) {
    const total = (tdoc.pids || []).length;
    const tsdocs = await ContestModel.getMultiStatus(
        domainId, { docId: tdoc.docId, attend: { $gte: 1 } },
    ).toArray();
    const done = new Map<number, { done: number, lastAt: Date | null }>();
    // 每道题按班统计。看过名单之外的人不参与，否则「2 / 1 通过」这种数字会冒出来
    const byPid: Record<number, HomeworkProblemStat> = {};
    for (const pid of tdoc.pids || []) byPid[pid] = { ac: 0, submitted: 0, lastAt: null };
    for (const tsdoc of tsdocs as any[]) {
        if (roster?.size && !roster.has(tsdoc.uid)) continue;
        // journal 一题可能有多条（交了好几次），和作业计分口径一致，只看最后一条
        const effective = new Map<number, any>();
        let lastAt: Date | null = null;
        for (const entry of tsdoc.journal || []) {
            if (!tdoc.pids.includes(entry.pid)) continue;
            effective.set(entry.pid, entry);
            const at = entry.rid?.getTimestamp?.();
            if (at && (!lastAt || at > lastAt)) lastAt = at;
        }
        done.set(tsdoc.uid, { done: effective.size, lastAt });
        for (const [pid, entry] of effective) {
            const cell = byPid[pid];
            if (!cell) continue;
            cell.submitted += 1;
            if (entry.status === STATUS.STATUS_ACCEPTED) cell.ac += 1;
            const at = entry.rid?.getTimestamp?.();
            if (at && (!cell.lastAt || at > cell.lastAt)) cell.lastAt = at;
        }
    }
    // 名单未知时只列认领过的人，否则等于把全站用户都列进来说没人认领
    const uids = roster?.size ? [...roster] : [...done.keys()];
    const rows: HomeworkProgressRow[] = uids.map((uid) => ({
        uid,
        attended: done.has(uid),
        done: done.get(uid)?.done || 0,
        lastAt: done.get(uid)?.lastAt || null,
    }));
    rows.sort((a, b) => (a.done - b.done) || (a.uid - b.uid));
    const attended = roster?.size
        ? [...roster].filter((uid) => done.has(uid)).length
        : done.size;
    // 名单已知才谈「全班都做完了」：对全站可见的作业，谁也不知道还会有谁来认领
    const allDone = !!roster?.size && total > 0
        && [...roster].every((uid) => done.get(uid)?.done === total)
        && Object.values(byPid).every((cell) => cell.ac === roster.size);
    return {
        rows,
        total,
        attended,
        rosterSize: roster?.size ?? null,
        byPid,
        denom: roster?.size || done.size,
        allDone,
    };
}

