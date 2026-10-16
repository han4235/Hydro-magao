import {
    ContestModel, ObjectId, RecordModel, UserModel,
} from 'hydrooj';

/**
 * 作业的「分给谁」记在 tdoc.assign 里，匹配的是 UserModel.listGroup 给出的组名。
 *
 * listGroup 除了真组名，还会补一条名字等于自己 uid 的合成组（见 user.ts），
 * 所以老师按人布置（assign 里写 '16' 这种）也能被这里匹配到。
 */
export async function myHomeworkGroups(domainId: string, uid: number) {
    const groups = await UserModel.listGroup(domainId, uid);
    return groups.map((i) => i.name);
}

/** 我已认领的作业 docId，用来区分「历史作业」和「还没认领的作业」。 */
export async function myAttendedHomeworkIds(domainId: string, uid: number) {
    // attend 在状态文档里是累加计数（见 contest.attend），所以按数值比较
    const rows = await ContestModel.getMultiStatus(domainId, { uid, attend: { $gte: 1 } })
        .project({ docId: 1 })
        .toArray();
    return new Set(rows.map((row) => String(row.docId)));
}

/**
 * 分给我、还没认领、并且还认领得了的作业，按截止时间从早到晚。
 *
 * 已经过了 endAt 的作业不再列进来：postAttend 会抛 HomeworkNotLiveError，
 * 提醒了也点不动。
 */
export async function myPendingHomework(domainId: string, uid: number) {
    const [groups, attended] = await Promise.all([
        myHomeworkGroups(domainId, uid),
        myAttendedHomeworkIds(domainId, uid),
    ]);
    const list = await ContestModel.getMulti(domainId, { rule: 'homework', assign: { $in: groups } }).toArray();
    return list
        .filter((tdoc) => !attended.has(String(tdoc.docId)) && !ContestModel.isDone(tdoc))
        .sort((a, b) => a.penaltySince.getTime() - b.penaltySince.getTime());
}

/**
 * 这次作业交过题没有。
 *
 * 撤销认领用的是 ContestModel.cancelAttend，它把状态文档整个删掉，而作业成绩表
 * 和「我的提交」都是从这个文档的 journal 里算出来的（见 contest.getScoreboard），
 * 删了就一起没了。所以交过题的作业不给撤，先让老师确认。
 */
export async function hasHomeworkSubmission(domainId: string, tid: ObjectId, uid: number) {
    const rdocs = await RecordModel.getMulti(domainId, { contest: tid, uid }, { projection: { _id: 1 } })
        .limit(1)
        .toArray();
    return rdocs.length > 0;
}
