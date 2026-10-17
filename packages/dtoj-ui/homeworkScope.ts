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

/**
 * 每份作业「还没认领」的人数 = 应到 - 已认领。返回的 Map 键是 docId 的字符串。
 *
 * 应到人数从 tdoc.assign 摊开算：里面既可能是用户组名（库里 user.group 那一套），
 * 也可能是单个 uid 的字符串 —— 按人布置时 assign 存的就是 '28' 这种，
 * UserModel.listGroup 会为每个用户补一条同名合成组，所以这两种要分开认。
 * 同一个人同时挂在两个组里只算一次，所以按 uid 去重。
 *
 * 值为 null 表示给不出数字：assign 为空时 core 认为作业对全站可见，
 * 「应到」就成了域内所有用户，这个数对老师没有意义。
 *
 * 组名一次查完再分发到各作业，避免一页 12 份作业查 12 次。
 */
export async function unclaimedCounts(domainId: string, tdocs: any[]) {
    const wanted = new Set<string>();
    for (const tdoc of tdocs) {
        for (const name of tdoc.assign || []) {
            const n = String(name || '').trim();
            if (n && !/^\d+$/.test(n)) wanted.add(n);
        }
    }
    const groups = wanted.size ? await UserModel.listGroup(domainId, undefined, [...wanted]) : [];
    const uidsOf = new Map<string, number[]>();
    for (const group of groups) uidsOf.set(group.name, group.uids || []);

    const out = new Map<string, number | null>();
    for (const tdoc of tdocs) {
        const key = String(tdoc.docId);
        const names = (tdoc.assign || [])
            .map((name: unknown) => String(name || '').trim())
            .filter((name: string) => name);
        if (!names.length) {
            out.set(key, null);
            continue;
        }
        const roster = new Set<number>();
        for (const name of names) {
            if (/^\d+$/.test(name)) roster.add(+name);
            else for (const uid of uidsOf.get(name) || []) roster.add(uid);
        }
        // 老师自己也可能认领过，或者组后来缩过人，认领数能超过应到，不能出现负数
        out.set(key, Math.max(0, roster.size - (tdoc.attend || 0)));
    }
    return out;
}
