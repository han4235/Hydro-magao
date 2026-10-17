import { ContestModel } from 'hydrooj';

/**
 * 作业合并：分给同一批人的几份作业并成一份。
 *
 * 「同一批人」按 assign 的集合判断：去空、去重、排序之后完全一样才算同一组。
 * 只判交集是不够的 —— 「A 班」和「A 班 + B 班」并起来会把 B 班的人卷进来，
 * 而 B 班本来没收到前面那份作业。
 *
 * 这里统一用 any 收参：Tdoc 没有从 plugin-api 导出，而作业文档里
 * assign / penaltySince 在类型上都是可选的，写死成接口只会在调用处来回断言。
 */

/** assign 的归一化签名。空 assign 也自成一类（对全站可见＝同一批人就是所有人）。 */
export function assignSignature(assign?: unknown[]) {
    const names = (assign || [])
        .map((name) => String(name ?? '').trim())
        .filter(Boolean);
    return [...new Set(names)].sort().join('\u0001');
}

export interface HomeworkMergeGroup {
    key: string;
    assign: string[];
    tdocs: any[];
}

/**
 * 从一批作业里挑出「可以合并」的组：同一批人收到了两份以上、且至少有一份还没结束。
 *
 * 已结束的作业默认不参与（成绩已定，改会动历史）。唯一的例外由 allowFinished 放行：
 * 那份已经结束、但没有任何人认领也没有任何提交 —— 没有历史可改，只是把题目并进来。
 *
 * 返回值按「组内份数从多到少、组内最早开始从早到晚」排，让最值得并的排在最前面。
 */
export function homeworkMergeGroups(
    tdocs: any[],
    allowFinished?: (tdoc: any) => boolean,
): HomeworkMergeGroup[] {
    const buckets = new Map<string, any[]>();
    for (const tdoc of tdocs) {
        const key = assignSignature(tdoc.assign);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(tdoc);
    }
    const groups: HomeworkMergeGroup[] = [];
    for (const [key, items] of buckets) {
        const active = items.filter((tdoc) => !ContestModel.isDone(tdoc));
        // 全都结束了就不提示：没有进行中的那份，并起来等于重开一份旧作业
        if (!active.length) continue;
        const pool = [...active, ...items.filter((tdoc) => ContestModel.isDone(tdoc) && allowFinished?.(tdoc))];
        if (pool.length < 2) continue;
        const sorted = [...pool].sort((a, b) => a.beginAt.getTime() - b.beginAt.getTime());
        groups.push({
            key,
            assign: (sorted[0].assign || []).map((name) => String(name)),
            tdocs: sorted,
        });
    }
    return groups.sort((a, b) => (b.tdocs.length - a.tdocs.length)
        || (a.tdocs[0].beginAt.getTime() - b.tdocs[0].beginAt.getTime()));
}

/**
 * 保留哪一份：优先还没结束的（这样并完仍然是进行中的那份继续在跑），
 * 其中开始最早的；都还没开始时取截止早的，再同取 docId 小的，保证同样的输入总是同一个结果。
 */
export function pickMergeTarget(tdocs: any[]) {
    const active = tdocs.filter((tdoc) => !ContestModel.isDone(tdoc));
    const pool = active.length ? active : tdocs;
    return [...pool].sort((a, b) => (a.beginAt.getTime() - b.beginAt.getTime())
        || (a.penaltySince.getTime() - b.penaltySince.getTime())
        || String(a.docId).localeCompare(String(b.docId)))[0];
}

/** 题目取并集：保留那份的顺序在前，其余按传入顺序往后接，同一道题只留一次。 */
export function mergedPids(tdocs: any[]) {
    const out: number[] = [];
    const seen = new Set<number>();
    for (const tdoc of tdocs) {
        for (const pid of tdoc.pids || []) {
            if (seen.has(pid)) continue;
            seen.add(pid);
            out.push(pid);
        }
    }
    return out;
}

/**
 * 时间取并集：最早开始、最晚截止，延期窗口跟着最晚的走。
 *
 * 已经结束又没人做过的那几份不参与：它们只贡献题目，不该把期限往后推，
 * 否则等于把一份旧作业重新开放。
 */
export function mergedWindow(tdocs: any[]) {
    const active = tdocs.filter((tdoc) => !ContestModel.isDone(tdoc));
    const pool = active.length ? active : tdocs;
    const at = (value: Date) => new Date(value).getTime();
    return {
        beginAt: new Date(Math.min(...pool.map((t) => at(t.beginAt)))),
        penaltySince: new Date(Math.max(...pool.map((t) => at(t.penaltySince)))),
        endAt: new Date(Math.max(...pool.map((t) => at(t.endAt)))),
    };
}

/**
 * 合并建议里显示「分给谁」：组名直接用，按人布置的（assign 里是 uid）
 * 换成学生名，多个顿号隔开，空的就是全站可见。
 */
export function mergeAssignLabel(assign: string[], nameOf?: (uid: number) => string | undefined) {
    if (!assign.length) return '全体（未指定分组）';
    return assign.map((name) => {
        if (!/^\d+$/.test(name)) return name;
        const shown = nameOf?.(+name);
        return shown ? `${shown}（#${name}）` : `#${name}`;
    }).join('、');
}
