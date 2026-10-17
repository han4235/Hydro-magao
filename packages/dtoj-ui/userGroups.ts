import {
    ContestModel, DomainModel, PERM, PRIV, UserModel,
} from 'hydrooj';

/*
 * 用户组的读写。分组存在 user.group 集合里（GDoc: { domainId, name, uids, owner }）。
 *
 * 两条线：
 *   - 学生自助加入（/user/:uid/group），只能改自己的组籍
 *   - 教师管理小组（/group），只能动自己名下的组，见下面的 manageableGroups
 * 管理员的全量维护仍走 /domain/group。
 *
 * 这里只认「域里真实存在的分组」。UserModel.listGroup 在带 uid 时会额外补一条
 * 名字等于该 uid 的合成组，那是给作业按人布置用的，不是真分组，所以下面几个函数
 * 都走不带 uid 的那次查询，再自己按 uids 过滤。
 */

/** 域用户列表不展示的系统内置账号（Hydro 安装账号、评测账号） */
export const HIDDEN_DOMAIN_USER_IDS = new Set([1, 2]);

/** 只用到 id 和权限位，所以不依赖 User 类（hydrooj 的包根没导出它） */
interface GroupActor {
    _id: number;
    hasPerm(...perms: bigint[]): boolean;
}

/**
 * 管组权限分两档：PERM_MANAGE_GROUP_ALL 是域内全部组（等同管理员），
 * PERM_MANAGE_GROUP 只管自己名下的那些。
 *
 * 不拿 PERM_EDIT_DOMAIN 当门槛：那个权限连域设置和角色表都能改，为了管个分组
 * 把整个域交出去不划算。
 */
export function managesAllGroups(actor: GroupActor) {
    return actor.hasPerm(PERM.PERM_MANAGE_GROUP_ALL);
}

export function canManageGroups(actor: GroupActor) {
    return actor.hasPerm(PERM.PERM_MANAGE_GROUP_ALL, PERM.PERM_MANAGE_GROUP);
}

/** 这个组在不在某个人名下：只比对 owner / maintainers，不看权限位。 */
export function groupOwnedBy(gdoc: { owner?: number, maintainers?: number[] }, uid: number) {
    return gdoc.owner === uid || (gdoc.maintainers || []).includes(uid);
}

/**
 * 域内「能管全部分组」的账号。
 *
 * 用来给没有 owner 的老组找主人：加 owner 字段之前，建组只能走 /domain/group，
 * 那个路由要 PERM_EDIT_DOMAIN，所以这些组是管理员建的，不该算无主。
 * 按角色位反查，比逐个账号算一遍权限省事：roles 里带 MANAGE_GROUP_ALL 的角色 +
 * 内置的 root（root 的权限是 PERM_ALL，不存在 roles 表里）。
 */
export async function groupAdminUids(domainId: string) {
    const ddoc = await DomainModel.get(domainId);
    const roles = Object.entries(ddoc?.roles || {})
        .filter(([, perm]) => (BigInt(perm) & PERM.PERM_MANAGE_GROUP_ALL) === PERM.PERM_MANAGE_GROUP_ALL)
        .map(([role]) => role);
    roles.push('root');
    const dudocs = await DomainModel.getMultiUserInDomain(domainId, { role: { $in: roles } })
        .project<{ uid: number }>({ uid: 1 })
        .toArray();
    return new Set(dudocs.map((dudoc) => dudoc.uid));
}

/**
 * 一个组归哪些账号。有 owner / maintainers 就按它们；一个都没有（老组）就摊给所有管理员，
 * 否则这些组在「按教师筛」的界面里谁也选不到。
 */
export function groupOwnerUids(gdoc: { owner?: number, maintainers?: number[] }, adminUids: Set<number>) {
    const owners = new Set<number>(gdoc.maintainers || []);
    if (typeof gdoc.owner === 'number') owners.add(gdoc.owner);
    if (!owners.size) for (const uid of adminUids) owners.add(uid);
    return owners;
}

/**
 * 这个组归我管吗。
 *
 * 老数据没有 owner 字段，等于没人「拥有」它 —— 只有管全部的够得着，
 * 这样加字段之前的组不会被顺手划给谁。
 */
export function ownsGroup(actor: GroupActor, gdoc: { owner?: number, maintainers?: number[] }) {
    if (managesAllGroups(actor)) return true;
    return groupOwnedBy(gdoc, actor._id);
}

/** 我能管的组。没权限时是空数组，调用方不用再单独判一次权限。 */
export async function manageableGroups(domainId: string, actor: GroupActor) {
    if (!canManageGroups(actor)) return [];
    const groups = await UserModel.listGroup(domainId);
    return groups.filter((gdoc) => ownsGroup(actor, gdoc));
}

/**
 * 能拉进小组的人：域内的正常账号，且没有任何管理类权限。
 *
 * 组一旦出现在 tdoc.assign 里就决定了「谁能看见哪些作业和比赛」，加人等于决定这件事的输入。
 * 所以把管理员和「能管全部组」的账号挡在名单外：既防老师把管理员拉进来，
 * 也防靠改组员给自己或别人开别的班的后门。写入时还会再查一遍（见 DtojGroupMembersHandler），
 * 这个函数只是让选择器别把不该给的人摆出来。
 */
export async function addableGroupMembers(domainId: string) {
    const dudocs = await DomainModel.getMultiUserInDomain(domainId, { join: true }).toArray();
    const udict = await UserModel.getList(domainId, dudocs.map((dudoc) => dudoc.uid));
    return Object.values(udict)
        .filter((u) => u.hasPriv(PRIV.PRIV_USER_PROFILE) && !HIDDEN_DOMAIN_USER_IDS.has(u._id))
        .filter((u) => !u.hasPerm(PERM.PERM_EDIT_DOMAIN, PERM.PERM_MANAGE_GROUP_ALL))
        .map((u) => ({ uid: u._id, uname: u.uname, name: u.displayName || u.uname }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

/**
 * 每个组被多少份作业/比赛用着。tdoc.assign 里挂的就是组名字符串，没有外键约束，
 * 删组会把这些 assign 留成死引用，所以删之前先数出来问一句。
 */
export async function groupUsageCounts(domainId: string, names: string[]) {
    const counts: Record<string, number> = {};
    if (!names.length) return counts;
    const want = new Set(names);
    const tdocs = await ContestModel.getMulti(domainId, { assign: { $in: names } })
        .project<{ assign?: string[] }>({ assign: 1 })
        .toArray();
    for (const tdoc of tdocs) {
        for (const name of new Set(tdoc.assign || [])) {
            if (want.has(name)) counts[name] = (counts[name] || 0) + 1;
        }
    }
    return counts;
}

/**
 * uid → 显示名，给模板渲染组员用。
 *
 * 不复用 addableGroupMembers 的结果当字典：组里可能有人已经不在「可加入」名单上了
 * （比如后来被提成了老师），那些人也得有名字，不能只显示个数字。
 */
export async function memberNames(domainId: string, uids: number[]) {
    const udict = await UserModel.getList(domainId, uids);
    const names: Record<number, string> = {};
    for (const uid of uids) {
        names[uid] = udict[uid]?.displayName || udict[uid]?.uname || `#${uid}`;
    }
    return names;
}

/** 渲染创建者要用的那点信息（不依赖 hydrooj 的 User 类，理由同 GroupActor） */
interface CreatorCandidate extends GroupActor {
    uname: string;
    displayName?: string;
}

/**
 * 一个人该标成什么身份。
 *
 * 拿 PERM_EDIT_DOMAIN 当「管理员」的分界：加 owner 字段之前，建组只能走 /domain/group，
 * 那个路由要的就是这个权限位，所以它正好等于「谁有能力建老组」。
 */
function creatorRole(udoc: CreatorCandidate) {
    if (udoc.hasPerm(PERM.PERM_EDIT_DOMAIN)) return '管理员';
    if (udoc.hasPerm(PERM.PERM_MANAGE_GROUP_ALL, PERM.PERM_MANAGE_GROUP)) return '教师';
    return '用户';
}

/**
 * 组名 → 创建者（形如「lizhi（教师）」），给页面直接渲染。
 *
 * 老组没有 owner —— 那时候只有域管理员建得了组，所以一律标「管理员」，
 * 不给它们编一个具体的人出来。
 */
export async function groupCreators(domainId: string, gdocs: { name: string, owner?: number }[]) {
    const owners = [...new Set(gdocs.map((gdoc) => gdoc.owner).filter((uid): uid is number => typeof uid === 'number'))];
    const udict = await UserModel.getList(domainId, owners) as unknown as Record<number, CreatorCandidate>;
    const labels: Record<string, string> = {};
    for (const gdoc of gdocs) {
        const owner = gdoc.owner;
        if (typeof owner !== 'number') {
            labels[gdoc.name] = '管理员';
            continue;
        }
        const udoc = udict[owner];
        labels[gdoc.name] = udoc
            ? `${udoc.displayName || udoc.uname}（${creatorRole(udoc)}）`
            : `#${owner}`;
    }
    return labels;
}

/** 学生能自助加入的分组：名字加上谁建的，弹层里好认。 */
export async function joinableGroups(domainId: string) {
    const groups = await UserModel.listGroup(domainId);
    const creators = await groupCreators(domainId, groups);
    return groups.map((gdoc) => ({ name: gdoc.name, creator: creators[gdoc.name] }));
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
 *
 * 走原子的加/减，不把整个 uids 读出来改再写回 —— 老师那边同时在改组员时会互相盖掉。
 */
export async function applyUserGroups(domainId: string, uid: number, picked: Set<string>) {
    const groups = await UserModel.listGroup(domainId);
    await Promise.all(groups.map((gdoc) => {
        const joined = gdoc.uids.includes(uid);
        const want = picked.has(gdoc.name);
        if (joined === want) return null;
        return want
            ? UserModel.addGroupUser(domainId, gdoc.name, uid)
            : UserModel.removeGroupUser(domainId, gdoc.name, uid);
    }));
}
