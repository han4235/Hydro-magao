import {
    ObjectId, ProblemModel, PRIV, STATUS, db,
} from 'hydrooj';

/**
 * 最近浏览过的题目，用于训练页顶部那条「继续上次」。
 *
 * 每次打开题目页记一条 (domainId, uid, pid) 并刷新 at；同一道题只留一行。
 * 训练页取最近若干条，从新到旧挑第一道还没 AC 的 —— 这样做完一道，链接会自己跳到上一道没做完的，
 * 全都做完则整条不显示。
 */

/** 只在最近这么多道题里找「还没做完的那道」，避免把很久以前的题翻出来 */
const LOOKBACK = 12;

export interface RecentProblemDoc {
    _id: ObjectId;
    domainId: string;
    uid: number;
    pid: number;
    at: Date;
}

declare module 'hydrooj' {
    interface Collections {
        dtoj_recent_problem: RecentProblemDoc;
    }
}

const COLL = 'dtoj_recent_problem';
let indexEnsured = false;

async function ready() {
    if (indexEnsured) return;
    await db.collection(COLL).createIndex({ domainId: 1, uid: 1, pid: 1 }, { unique: true });
    indexEnsured = true;
}

/** 记下「这个人刚看过这道题」。没登录、没题号时什么都不做。 */
export async function markProblemVisited(domainId: string, uid: number, pid: number) {
    if (!domainId || !uid || !pid) return;
    await ready();
    const key = { domainId, uid, pid };
    try {
        await db.collection(COLL).updateOne(key, { $set: { at: new Date() } }, { upsert: true });
    } catch (e: any) {
        // 两个人同一瞬间 upsert 同一行会撞唯一索引，撞上说明这行已经在了，补一次纯更新即可
        if (e?.code !== 11000) throw e;
        await db.collection(COLL).updateOne(key, { $set: { at: new Date() } });
    }
}

export interface LastProblem {
    pid: number;
    show: string;
    title: string;
}

/**
 * 训练页顶部要显示的那道「上次没做完的题」，没有就返回 null。
 *
 * canViewHidden 与题目页一致：隐藏题只有作者、维护者和管理员能看，
 * 别人的浏览记录在我们这里也要按同一把尺子过滤掉，不然会给出一个点进去 404 的链接。
 */
export async function lastUnfinishedProblem(
    domainId: string, user: any, canViewHidden: number | boolean,
): Promise<LastProblem | null> {
    if (!user?.hasPriv?.(PRIV.PRIV_USER_PROFILE)) return null;
    const rows = await db.collection(COLL)
        .find({ domainId, uid: user._id })
        .sort({ at: -1 })
        .limit(LOOKBACK)
        .toArray();
    if (!rows.length) return null;

    const pids = rows.map((row) => +row.pid);
    const [pdict, psdict] = await Promise.all([
        ProblemModel.getList(domainId, pids, canViewHidden, false),
        ProblemModel.getListStatus(domainId, user._id, pids),
    ]);
    for (const row of rows) {
        const pid = +row.pid;
        if (psdict[pid]?.status === STATUS.STATUS_ACCEPTED) continue;
        const pdoc = pdict[pid];
        if (!pdoc?.docId) continue;
        return {
            pid: pdoc.docId,
            show: String(pdoc.pid || pdoc.docId),
            title: pdoc.title || '',
        };
    }
    return null;
}
