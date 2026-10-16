import { UserModel } from 'hydrooj';

/*
 * 学生自助加入分组。分组存在 user.group 集合里（GDoc: { domainId, name, uids }），
 * 管理端在 /domain/group 维护。
 *
 * 这里只认「域里真实存在的分组」。UserModel.listGroup 在带 uid 时会额外补一条
 * 名字等于该 uid 的合成组，那是给作业按人布置用的，不是真分组，所以下面几个函数
 * 都走不带 uid 的那次查询，再自己按 uids 过滤。
 */

/** 学生能自助加入的分组名。 */
export async function joinableGroupNames(domainId: string) {
    const groups = await UserModel.listGroup(domainId);
    return groups.map((gdoc) => gdoc.name);
}

/** 我当前所在的分组名。 */
export async function myGroupNames(domainId: string, uid: number) {
    const groups = await UserModel.listGroup(domainId);
    return groups.filter((gdoc) => gdoc.uids.includes(uid)).map((gdoc) => gdoc.name);
}

/**
 * 把我的组籍对齐成 picked：勾了的加进去，没勾的把我摘出来。
 *
 * 传进来的名字要是域里没有的分组，在这儿对不上任何一条，会被直接忽略，
 * 所以调用方不用自己过滤。改动只落在真实分组上，不碰别的东西。
 */
export async function applyUserGroups(domainId: string, uid: number, picked: Set<string>) {
    const groups = await UserModel.listGroup(domainId);
    await Promise.all(groups.map((gdoc) => {
        const joined = gdoc.uids.includes(uid);
        const want = picked.has(gdoc.name);
        if (joined === want) return null;
        const uids = want ? [...gdoc.uids, uid] : gdoc.uids.filter((i) => i !== uid);
        return UserModel.updateGroup(domainId, gdoc.name, uids);
    }));
}
