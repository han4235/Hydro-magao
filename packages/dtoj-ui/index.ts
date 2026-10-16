import { escapeRegExp } from 'lodash';
import {
    canViewAllDomainRecords, ContestModel, ContestNotFoundError, Context, CreateError as Err, DocumentModel, DomainModel, ForbiddenError, Handler,
    HomeworkNotAttendedError, HomeworkNotLiveError, NotAssignedError, ObjectId, param,
    PERM, ProblemModel, ProblemNotFoundError, PRIV, Types, UserModel, ValidationError,
} from 'hydrooj';
import {
    askHomeworkQuestion, bridgeInboxReply, listHomeworkProgress, listHomeworkQuestions,
    notifyHomeworkAttended, notifyHomeworkCompleted, replyHomeworkQuestion,
} from './homeworkQA';
import { applyInboxNotices } from './inboxNotices';
import { hasHomeworkSubmission, myAttendedHomeworkIds, myHomeworkGroups } from './homeworkScope';
import { applyUserGroups, joinableGroupNames, myGroupNames } from './userGroups';

export { hasHomeworkSubmission, myAttendedHomeworkIds, myHomeworkGroups, myPendingHomework } from './homeworkScope';

/** 交过题的作业不给撤认领，见 DtojHomeworkUnclaimHandler 与 hasHomeworkSubmission。 */
export const HomeworkSubmittedError = Err(
    'HomeworkSubmittedError',
    ForbiddenError,
    '这套作业已经交过题了，撤销认领会把认领记录和成绩一起清掉，先跟老师确认。',
);

const DOMAIN_ROLE_SETTING_KEYS = new Set(['default.userRole', 'default.teacherRole']);

/** 域用户列表不展示的系统内置账号（Hydro 安装账号、评测账号） */
const HIDDEN_DOMAIN_USER_IDS = new Set([1, 2]);

/**
 * 题目页「添加作业」建的作业用的扣分规则，抄自 partials/homework_default_penalty_rules.yaml。
 *
 * 这份作业的截止（penaltySince）与结束（endAt）是同一时刻，延期窗口为 0，规则本身用不上；
 * 留着是为了老师事后在作业编辑页加了延期天数时，扣分能照常生效而不是撞上 undefined。
 */
const HOMEWORK_PENALTY_RULES = {
    1: 0.9, 3: 0.8, 12: 0.75, 9999: 0.5,
};

/**
 * 加一个月。
 *
 * JS 的 setMonth 会让 1-31 溢出成 3-3 这种日子，所以先把日号压到月初、加完月份再把
 * 日号放回去，放不回去就夹到目标月最后一天（3-31 → 4-30），与 moment 的行为一致。
 */
function addOneMonth(from: Date) {
    const day = from.getDate();
    const to = new Date(from);
    to.setDate(1);
    to.setMonth(to.getMonth() + 1);
    const lastDay = new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate();
    to.setDate(Math.min(day, lastDay));
    return to;
}

/** 按用户时区把时间点写成「YYYY-MM-DD HH:mm」，给弹层里的时间提示用。 */
function timeText(date: Date, timeZone: string) {
    // sv-SE 给的是 ISO 形状的「YYYY-MM-DD HH:mm:ss」，裁掉秒即可
    return date.toLocaleString('sv-SE', { timeZone }).slice(0, 16);
}

/**
 * 「添加作业」弹层里可勾的分组与人员。
 *
 * 两边的取值都直接当 assign 提交：真分组用组名，按人布置用 uid 的字符串
 * （listGroup 会为每个 uid 合成一条同名的组，见 homeworkScope.ts）。
 */
async function homeworkAssignOptions(domainId: string) {
    const [groups, dudocs] = await Promise.all([
        UserModel.listGroup(domainId),
        DomainModel.getMultiUserInDomain(domainId, { join: true }).project({ uid: 1 }).toArray(),
    ]);
    const udict = await UserModel.getList(domainId, dudocs.map((d) => d.uid));
    const students = Object.values(udict)
        .filter((u) => u.hasPriv(PRIV.PRIV_USER_PROFILE) && !HIDDEN_DOMAIN_USER_IDS.has(u._id))
        .map((u) => ({ uid: u._id, uname: u.uname, name: u.displayName || u.uname }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
    return {
        groups: groups.map((g) => ({ name: g.name, count: g.uids?.length || 0 })),
        students,
    };
}

function filterDomainUserRudocs(rudocs: Record<string, { _id: number }[]>) {
    for (const role of Object.keys(rudocs)) {
        rudocs[role] = rudocs[role].filter((u) => !HIDDEN_DOMAIN_USER_IDS.has(u._id));
        if (!rudocs[role].length) delete rudocs[role];
    }
}

async function domainRoleSelectRange(domainId: string) {
    const roles = await DomainModel.getRoles(domainId);
    const range: Record<string, string> = {};
    for (const role of roles) {
        if (role._id === 'guest') continue;
        range[role._id] = role._id;
    }
    return range;
}

export function queryOf(handler: Handler, key: string) {
    const raw = handler.args[key];
    if (Array.isArray(raw)) return String(raw[0] || '');
    if (raw == null) return '';
    return String(raw);
}

export function pick(raw: string, allowed: string[], fallback: string) {
    return allowed.includes(raw) ? raw : fallback;
}

export function queryString(parts: Record<string, string | number | undefined>) {
    return Object.entries(parts)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
        .join('&');
}

export class DtojPageHandler extends Handler {
    noCheckPermView = true;

    view(name: string, body: Record<string, any> = {}) {
        this.response.template = `${name}.html`;
        this.response.body = body;
    }
}

export class DtojDataHandler extends DtojPageHandler {
    noCheckPermView = false;
}

/**
 * 作业列表。行为对齐 core 的 HomeworkMainHandler，只改一件事：
 * 没有「看全部作业」权限的人（学生）不再看到分给别人的作业。
 *
 * core 的过滤条件里有一条 `assign: { $size: 0 }`，意思是没指定给任何人的作业对全站可见，
 * 于是学生会在列表里看到别人班的作业。这里把这条去掉，学生只看两类：
 *   - assign 命中自己的用户组（含按 uid 单点布置）→ 待认领或已认领的作业
 *   - 自己已经认领过的（哪怕后来被移出用户组）→ 历史作业
 * 老师（PERM_VIEW_HIDDEN_HOMEWORK）仍然看到全部。
 *
 * 另外给每行补 hwAssigned / hwAttended，让页面能标出「待认领 / 已认领」。
 */
class DtojHomeworkMainHandler extends DtojPageHandler {
    @param('group', Types.Name, true)
    @param('page', Types.PositiveInt, true)
    @param('q', Types.String, true)
    async get(domainId: string, group = '', page = 1, q = '') {
        const canViewAll = this.user.hasPerm(PERM.PERM_VIEW_HIDDEN_HOMEWORK);
        const loggedIn = this.user.hasPriv(PRIV.PRIV_USER_PROFILE);
        const groups = (await UserModel.listGroup(domainId, canViewAll ? undefined : this.user._id))
            .map((i) => i.name);
        if (group && !groups.includes(group)) throw new NotAssignedError(group);

        const myGroups = loggedIn ? await myHomeworkGroups(domainId, this.user._id) : [];
        const attended = loggedIn ? await myAttendedHomeworkIds(domainId, this.user._id) : new Set<string>();

        const filter: Record<string, any> = { rule: 'homework' };
        if (!canViewAll || group) {
            const scope: Record<string, any>[] = [
                { owner: this.user._id },
                { maintainer: this.user._id },
                { assign: { $in: myGroups } },
            ];
            if (attended.size) scope.push({ _id: { $in: [...attended] } });
            filter.$or = scope;
        }
        if (group) filter.assign = { $in: [group] };
        if (q) {
            const escaped = escapeRegExp(q.toLowerCase());
            filter.title = { $regex: new RegExp(q.length >= 2 ? escaped : `\\A${escaped}`, 'gim') };
        }

        const cursor = ContestModel.getMulti(domainId, filter)
            .sort({ penaltySince: -1, endAt: -1, beginAt: -1, _id: -1 });
        const [tdocs, tpcount] = await this.paginate(cursor, page, 'contest');

        // 月历只画当前页：未开始/进行中的作业只占截止那天，结束的才画真实区间
        const calendar = [];
        for (const tdoc of tdocs) {
            const cal = { ...tdoc, url: this.url('homework_detail', { tid: tdoc.docId }) };
            if (ContestModel.isExtended(tdoc) || ContestModel.isDone(tdoc)) {
                cal.endAt = tdoc.endAt;
                cal.penaltySince = tdoc.penaltySince;
            } else cal.endAt = tdoc.penaltySince;
            calendar.push(cal);
        }

        // 行上要标「待认领 / 已认领」：assign 命中我就是分给我的，attend 记录我认领过没有
        const groupSet = new Set(myGroups);
        const rows = tdocs.map((tdoc) => ({
            ...tdoc,
            hwAssigned: (tdoc.assign || []).some((name) => groupSet.has(name)),
            hwAttended: attended.has(String(tdoc.docId)),
        }));

        let qs = group ? `group=${group}` : '';
        if (q) qs += `${qs ? '&' : ''}q=${encodeURIComponent(q)}`;
        this.response.body = {
            tdocs: rows,
            calendar,
            tpcount,
            page,
            qs,
            groups: groups.filter((i) => !Number.isSafeInteger(+i)),
            group,
            q,
            hwSelfOnly: !canViewAll && loggedIn,
        };
        this.response.template = 'homework_main.html';
    }
}

/**
 * 撤销认领。
 *
 * core 的作业详情只有认领（HomeworkDetailHandler.postAttend），点错了没法往回走，
 * 所以在插件这侧单开一条 POST 路由，作业详情页的「取消认领」按钮指向它。
 *
 * 只在「还撤得动」时放行：自己认领过、作业没结束、且一道题都没交。最后一条是硬要求，
 * 理由见 hasHomeworkSubmission。
 */
class DtojHomeworkUnclaimHandler extends DtojDataHandler {
    @param('tid', Types.ObjectId)
    async post(domainId: string, tid: ObjectId) {
        const tdoc = await ContestModel.get(domainId, tid);
        if (tdoc?.rule !== 'homework') throw new ContestNotFoundError(domainId, tid);
        // 和作业详情页同一道门槛：不是分给我的作业，连这个接口都不该够得着
        if (tdoc.assign?.length && !this.user.own(tdoc) && !this.user.hasPerm(PERM.PERM_VIEW_HIDDEN_HOMEWORK)) {
            const groups = await myHomeworkGroups(domainId, this.user._id);
            if (!new Set(tdoc.assign).intersection(new Set(groups)).size) throw new NotAssignedError('homework', tid);
        }
        this.checkPerm(PERM.PERM_ATTEND_HOMEWORK);
        const tsdoc = await ContestModel.getStatus(domainId, tid, this.user._id);
        if (!tsdoc?.attend) throw new HomeworkNotAttendedError(this.user._id);
        if (ContestModel.isDone(tdoc)) throw new HomeworkNotLiveError(tid);
        if (await hasHomeworkSubmission(domainId, tid, this.user._id)) throw new HomeworkSubmittedError(tid);
        await ContestModel.cancelAttend(domainId, tid, this.user._id);
        this.response.redirect = this.url('homework_detail', { tid });
    }
}

/** 这次作业算不算「我管得着」：作业归属（创建者/作业管理员）或有编辑任意作业的权限。 */
function canManageHomework(handler: Handler, tdoc: any) {
    return handler.user.own(tdoc) || handler.user.hasPerm(PERM.PERM_EDIT_HOMEWORK);
}

/**
 * 题目页侧栏的「添加作业」：给这道题现建一份作业，分给勾中的分组或同学。
 *
 * 为什么不复用 core 的作业编辑表单：那边新建时默认「明天零点开始、七天后截止」，
 * 而这里要的是「现在开始、一个月后截止」；走自己的入口，默认值才不用回来改。
 * assign 的语义与 core 完全一致（见 homeworkAssignOptions），建完直接跳作业详情页，
 * 想改时间或加题都在那页上做。
 */
class DtojProblemAddHomeworkHandler extends DtojDataHandler {
    @param('pid', Types.ProblemId)
    @param('title', Types.Title)
    @param('assign', Types.CommaSeperatedArray, true)
    async post(domainId: string, pid: string | number, title: string, assign: string[] = []) {
        // 校验器按逗号切但不裁空白，空值也照收，所以这里自己清一遍
        const picked = [...new Set(assign.map((i) => i.trim()).filter((i) => i))];
        if (!picked.length) throw new ValidationError('assign');
        const pdoc = await ProblemModel.get(domainId, pid);
        if (!pdoc) throw new ProblemNotFoundError(domainId, pid);
        // 看不见的隐藏题不能拿来布置；门槛与 core 的作业编辑页一致（doThrow 默认开启）
        await ProblemModel.getList(
            domainId, [pdoc.docId], this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id,
        );
        const beginAt = new Date();
        const penaltySince = addOneMonth(beginAt);
        const tid = await ContestModel.add(
            domainId, title, '', this.user._id, 'homework', beginAt, penaltySince, [pdoc.docId], false,
            { penaltySince, penaltyRules: HOMEWORK_PENALTY_RULES, assign: picked },
        );
        this.response.redirect = this.url('homework_detail', { tid });
    }
}

/**
 * 学生在作业页提问。
 *
 * 门槛和作业详情页一致：分给我的、或我认领过的才够得着；老师不受「分给谁」限制。
 * 默认私问，学生自己勾「公开」才会让同一次作业的其他人看到，见 homeworkQA。
 */
class DtojHomeworkAskHandler extends DtojDataHandler {
    @param('tid', Types.ObjectId)
    @param('content', Types.Content)
    @param('subject', Types.Int, true)
    @param('isPublic', Types.Boolean, true)
    async post(domainId: string, tid: ObjectId, content: string, subject = 0, isPublic = false) {
        const tdoc = await ContestModel.get(domainId, tid);
        if (tdoc?.rule !== 'homework') throw new ContestNotFoundError(domainId, tid);
        this.checkPerm(PERM.PERM_VIEW_HOMEWORK);
        if (!canManageHomework(this, tdoc)) {
            const groups = await myHomeworkGroups(domainId, this.user._id);
            if (tdoc.assign?.length && !new Set(tdoc.assign).intersection(new Set(groups)).size) {
                throw new NotAssignedError('homework', tid);
            }
        }
        await this.limitRate('add_discussion', 3600, 60);
        await askHomeworkQuestion(
            domainId, tdoc, this.user._id, content, !!isPublic, +subject || 0,
            this.request.ip, this.url('homework_detail', { tid }),
        );
        this.back();
    }
}

/** 老师回复一条提问。管不了这次作业的人用不了。 */
class DtojHomeworkReplyHandler extends DtojDataHandler {
    @param('tid', Types.ObjectId)
    @param('did', Types.ObjectId)
    @param('content', Types.Content)
    async post(domainId: string, tid: ObjectId, did: ObjectId, content: string) {
        const tdoc = await ContestModel.get(domainId, tid);
        if (tdoc?.rule !== 'homework') throw new ContestNotFoundError(domainId, tid);
        if (!canManageHomework(this, tdoc)) throw new ForbiddenError(PERM.PERM_EDIT_HOMEWORK);
        // 只认挂在这份作业下的提问，免得拿别的作业的 did 来回帖
        const qdoc = await DocumentModel.get(domainId, DocumentModel.TYPE_CONTEST_CLARIFICATION, did);
        if (!qdoc || String(qdoc.parentId) !== String(tid)) throw new ContestNotFoundError(domainId, tid);
        await this.limitRate('add_discussion', 3600, 60);
        await replyHomeworkQuestion(
            domainId, tdoc, did, this.user._id, content, this.request.ip,
            this.url('homework_detail', { tid }),
        );
        this.back();
    }
}

/**
 * 自助加入分组。
 *
 * 个人主页的「加入分组」弹层提交到这里：勾上的加进去，取消勾选的把我摘出来。
 * 只能改自己的组籍，管理员那边另有 /domain/group 管全部。规则见 userGroups.ts。
 */
class DtojUserGroupHandler extends Handler {
    noCheckPermView = true;

    @param('uid', Types.Int)
    @param('groups', Types.CommaSeperatedArray, true)
    async post(domainId: string, uid: number, groups: string[] = []) {
        if (uid !== this.user._id) throw new ForbiddenError('Not your own profile');
        await applyUserGroups(domainId, this.user._id, new Set(groups));
        this.response.redirect = this.url('user_detail', { uid });
    }
}

/**
 * 供课件系统（ppt-system）确认「当前来访者是谁」。
 *
 * ppt-system 与 OJ 同域部署（/ppt/），浏览器会把 OJ 的 sid Cookie 一并带过去，
 * 它拿这个 Cookie 来调本接口，据此在自己那边建会话 —— 这样站内用户不必再登录一次。
 *
 * 只返回调用者自己的身份，不泄露他人信息；未登录一律 401。
 * 课件系统按「能否编辑任意题目」区分教师与访客：这比按角色名判断稳，角色名可被改动，
 * 权限位不会。本站是单域部署，所以取当前（system）域的权限。
 */
class DtojOjSessionHandler extends Handler {
    noCheckPermView = true;
    notUsage = true;

    async get() {
        // 身份相关的响应绝不能被缓存，否则会把甲的身份回给乙
        this.response.addHeader('Cache-Control', 'no-store');
        this.response.type = 'application/json';

        if (!this.user.hasPriv(PRIV.PRIV_USER_PROFILE)) {
            this.response.status = 401;
            this.response.body = { ok: false };
            return;
        }

        // 区分三种身份：
        //   域管理员（域内角色 root，拥有全部域权限，含 PERM_EDIT_DOMAIN）→ ADMIN
        //   教师（域内「教师」角色，含 PERM_EDIT_PROBLEM）→ TEACHER
        //   其他人（学生等）→ USER
        // 课件系统据此决定能否阅览课件，所以这里的判定要稳。
        const isAdmin = this.user.hasPerm(PERM.PERM_EDIT_DOMAIN);
        const isTeacher = this.user.hasPerm(PERM.PERM_EDIT_PROBLEM);
        this.response.body = {
            ok: true,
            uid: this.user._id,
            uname: this.user.uname,
            displayName: this.user.displayName || this.user.uname,
            role: isAdmin ? 'ADMIN' : (isTeacher ? 'TEACHER' : 'USER'),
        };
    }
}

/**
 * 顶栏未读角标的对账接口，给 nav.html 里那段实时脚本用。
 *
 * 角标本身是服务端渲染的，页面里那段脚本订阅 message 频道负责实时加一；但切到后台
 * 期间连接是断的，而且消息可能已经在别的标签页读完了 —— 单靠本地计数会挂着一个假的
 * 未读数，所以切回前台时来这里问一次真数。
 *
 * 只回自己的计数，别人的碰不到；未登录由路由上的 PRIV_USER_PROFILE 挡掉。
 */
class DtojUnreadHandler extends DtojDataHandler {
    async get() {
        this.response.addHeader('Cache-Control', 'no-store');
        this.response.type = 'application/json';
        this.response.body = { n: this.user.unreadMsg || 0 };
    }
}

export function dropEarlierRoutes(ctx: Context, paths: string[]) {
    const stack = (ctx as any).server.router.stack as { path?: string }[];
    const want = new Set(paths);
    const last = new Map<string, number>();
    for (let i = 0; i < stack.length; i++) {
        const path = stack[i].path;
        if (path && want.has(path)) last.set(path, i);
    }
    for (let i = stack.length - 1; i >= 0; i--) {
        const path = stack[i].path;
        if (path && want.has(path) && last.get(path) !== i) stack.splice(i, 1);
    }
}

const nav: [string, string, string][] = [
    ['homepage', 'dtoj_home', '首页'],
    ['dtoj_problems', 'dtoj_problems', '题库'],
    ['training_main', 'dtoj_training', '训练'],
    ['contest_main', 'dtoj_contest', '比赛'],
    ['record_main', 'dtoj_record', '评测记录'],
    ['homework_main', 'homework', '作业'],
    ['home_messages', 'home_messages', '站内消息'],
    ['dtoj_rank', 'dtoj_rank', '等级分'],
    ['dtoj_community', 'dtoj_community', '社区'],
    ['discussion_main', 'dtoj_discuss', '讨论'],
    ['dtoj_shop', 'dtoj_shop', '神秘商店'],
];

export async function apply(ctx: Context) {
    ctx.on('handler/after/DomainUser#get', async (that) => {
        const rudocs = that.response.body?.rudocs as Record<string, { _id: number }[]> | undefined;
        if (rudocs) filterDomainUserRudocs(rudocs);
    });

    ctx.on('handler/after/UserDetail#get', async (that) => {
        const body = that.response.body as Record<string, any> | undefined;
        if (!body?.isSelfProfile) return;
        // 只给本人看：别人的主页上没有加入分组这个入口
        body.joinableGroups = await joinableGroupNames(that.args.domainId);
        body.myGroups = await myGroupNames(that.args.domainId, that.user._id);
    });

    ctx.on('handler/after/SystemSetting#get', async (that) => {
        const settings = that.response.body?.settings as { key?: string, type?: string, range?: Record<string, string> }[] | undefined;
        if (!settings?.length) return;
        const range = await domainRoleSelectRange(that.args.domainId || 'system');
        if (!Object.keys(range).length) return;
        for (const item of settings) {
            if (item.key && DOMAIN_ROLE_SETTING_KEYS.has(item.key)) {
                item.type = 'select';
                item.range = range;
            }
        }
    });

    // 顶栏「站内消息」的未读红点（见 nav.html）读的是本请求的 UserContext，
    // 而 HomeMessages 在方法里才把 unreadMsg 清零，这里补一刀，免得停在消息页还亮着。
    ctx.on('handler/after/HomeMessages#get', (that) => {
        that.user.unreadMsg = 0;
    });

    // 通知类消息的正文要在后端出口翻好，见 inboxNotices.ts
    applyInboxNotices(ctx);

    const items = global.Hydro.ui.nodes.Nav as unknown[];
    items.splice(0, items.length);
    for (const [name, prefix, displayName] of nav) {
        if (name === 'record_main') {
            global.Hydro.ui.inject('Nav', name, {
                prefix,
                displayName,
                query: (handler: Handler) => (
                    handler.user.hasPriv(PRIV.PRIV_USER_PROFILE)
                    && !canViewAllDomainRecords(handler.user)
                        ? { uidOrName: handler.user._id }
                        : {}
                ),
            }, (handler: Handler) => (
                handler.user.hasPriv(PRIV.PRIV_USER_PROFILE)
                || canViewAllDomainRecords(handler.user)
            ));
            continue;
        }
        if (name === 'home_messages') {
            // 站内消息只给已登录用户。未读红点在 nav.html 里按 UserContext.unreadMsg 渲染。
            global.Hydro.ui.inject('Nav', name, { prefix, displayName }, PRIV.PRIV_USER_PROFILE);
            continue;
        }
        global.Hydro.ui.inject('Nav', name, { prefix, displayName });
    }
    // 课件系统入口。站点挂在 OJ 同域子路径 /ppt/（由 ppt-system 的 basePath 决定），
    // 因此在 OJ 侧不存在对应的 Hydro 路由，这里用显式 href 而不是路由名 ——
    // url() 只解析已注册的路由，找不到会退化成 '#'。
    // 登录即可见：课件对教师和学生都开放，能看哪些标签由 ppt-system 的授权决定，
    // 未登录访客不给入口（进去了也只会被弹去登录页）。
    global.Hydro.ui.inject('Nav', 'dtoj_courseware', {
        href: '/ppt/',
        displayName: '课件',
        before: 'contest_main',
    }, (handler: Handler) => handler.user.hasPriv(PRIV.PRIV_USER_PROFILE));
    global.Hydro.ui.inject('Nav', 'domain_dashboard', { prefix: 'domain', displayName: '管理域' }, PERM.PERM_EDIT_DOMAIN);

    // Nav 项的文字取自 item.name 的 i18n 目录（见 nav.html 的 _() 调用），
    // 不注册的话顶栏会直接显示 'dtoj_courseware' 这个名字。
    ctx.i18n.load('zh', { dtoj_courseware: '课件' });
    ctx.i18n.load('zh_TW', { dtoj_courseware: '課件' });
    ctx.i18n.load('en', { dtoj_courseware: 'Courseware' });

    // 课件系统据此确认来访者身份，见 DtojOjSessionHandler
    ctx.Route('dtoj_oj_session', '/oj-session', DtojOjSessionHandler);

    // 顶栏未读角标切回前台时的对账接口，见 DtojUnreadHandler
    ctx.Route('dtoj_unread', '/dtoj/unread', DtojUnreadHandler, PRIV.PRIV_USER_PROFILE);

    // 作业列表按「只看自己的作业」重写过滤条件，见 DtojHomeworkMainHandler
    ctx.Route('homework_main', '/homework', DtojHomeworkMainHandler, PERM.PERM_VIEW_HOMEWORK);
    dropEarlierRoutes(ctx, ['/homework']);

    // 撤销认领。core 没有这个接口，见 DtojHomeworkUnclaimHandler
    ctx.Route('homework_unclaim', '/homework/:tid/unclaim', DtojHomeworkUnclaimHandler, PERM.PERM_ATTEND_HOMEWORK);

    // 个人主页自助加入分组，见 DtojUserGroupHandler
    ctx.Route('dtoj_user_group', '/user/:uid/group', DtojUserGroupHandler, PRIV.PRIV_USER_PROFILE);

    // 题目页侧栏的「添加作业」，见 DtojProblemAddHomeworkHandler
    ctx.Route(
        'dtoj_problem_add_homework', '/p/:pid/add-homework',
        DtojProblemAddHomeworkHandler, PERM.PERM_CREATE_HOMEWORK,
    );

    // 弹层要的分组与人员清单。只给建得了作业的人算，学生看题目页时这一段直接跳过。
    ctx.on('handler/after/ProblemDetail#get', async (that) => {
        const body = that.response.body as Record<string, any> | undefined;
        if (!body?.pdoc) return;
        if (!that.user.hasPerm(PERM.PERM_CREATE_HOMEWORK)) return;
        const beginAt = new Date();
        body.hwAdd = {
            ...await homeworkAssignOptions(that.args.domainId),
            beginText: timeText(beginAt, that.user.timeZone),
            endText: timeText(addOneMonth(beginAt), that.user.timeZone),
        };
    });

    // 作业答疑与进度，见 homeworkQA。
    // 不覆盖 core 的作业详情路由，改为往它的响应里补数据，模板那边再渲染。
    ctx.on('handler/after/HomeworkDetail#get', async (that) => {
        const body = that.response.body as Record<string, any> | undefined;
        const tdoc = body?.tdoc;
        if (!tdoc || tdoc.rule !== 'homework') return;
        const canManage = canManageHomework(that, tdoc);
        const questions = await listHomeworkQuestions(tdoc.domainId, tdoc, {
            uid: that.user._id, canManage,
        });
        const uids = new Set<number>();
        for (const q of questions) {
            uids.add(q.owner);
            for (const r of q.reply || []) uids.add(r.owner);
        }
        body.hwQuestions = questions;
        body.hwQuestionUsers = await UserModel.getListForRender(
            tdoc.domainId, [...uids], that.user.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO),
        );
        body.hwCanManage = canManage;
        if (!canManage) return;
        const progress = await listHomeworkProgress(tdoc.domainId, tdoc);
        body.hwProgress = {
            ...progress,
            udict: await UserModel.getListForRender(tdoc.domainId, progress.rows.map((row) => row.uid), false),
        };
    });

    // 认领后告诉老师。core 用 operation 字段派发 postAttend，钩子只报 #post，所以这里自己判
    ctx.on('handler/after/HomeworkDetail#post', async (that) => {
        if (that.request.body?.operation !== 'attend') return;
        const tdoc = that.tdoc;
        if (!tdoc || tdoc.rule !== 'homework') return;
        await notifyHomeworkAttended(
            tdoc, that.user._id,
            that.url('homework_detail', { tid: tdoc.docId }),
        );
    });

    // 交完所有题后告诉老师。提交时 contest.updateStatus 已写好 journal，这里直接数覆盖了几题
    ctx.on('handler/after/ProblemSubmit#post', async (that) => {
        const tdoc = that.tdoc;
        if (!tdoc || tdoc.rule !== 'homework') return;
        const tsdoc = await ContestModel.getStatus(tdoc.domainId, tdoc.docId, that.user._id);
        const done = new Set<number>((tsdoc?.journal || [])
            .map((entry: any) => entry.pid)
            .filter((pid: number) => tdoc.pids.includes(pid)));
        if (done.size < tdoc.pids.length) return;
        await notifyHomeworkCompleted(
            tdoc.domainId, tdoc, that.user._id,
            that.url('homework_detail', { tid: tdoc.docId }),
        );
    });

    // 老师在站内消息会话里直接回话，也写进他回的那条提问，见 bridgeInboxReply。
    // postSend 与 postDeleteMessage 都报 #post，靠参数区分：删消息那条没有 uid/content
    ctx.on('handler/after/HomeMessages#post', async (that) => {
        const args = that.args as { uid?: number, content?: string };
        if (!args.uid || !args.content) return;
        await bridgeInboxReply(
            that.user._id, +args.uid, String(args.content), that.request.ip,
        );
    });

    // 作业答疑的两条写入口，见 DtojHomeworkAskHandler / DtojHomeworkReplyHandler
    ctx.Route('homework_ask', '/homework/:tid/ask', DtojHomeworkAskHandler, PERM.PERM_VIEW_HOMEWORK);
    ctx.Route('homework_ask_reply', '/homework/:tid/ask/:did/reply', DtojHomeworkReplyHandler, PERM.PERM_VIEW_HOMEWORK);
}
