import { Context, DomainModel, Handler, PERM, PRIV, canViewAllDomainRecords } from 'hydrooj';

const DOMAIN_ROLE_SETTING_KEYS = new Set(['default.userRole', 'default.teacherRole']);

/** 域用户列表不展示的系统内置账号（Hydro 安装账号、评测账号） */
const HIDDEN_DOMAIN_USER_IDS = new Set([1, 2]);

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
}
