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
    global.Hydro.ui.inject('Nav', 'domain_dashboard', { prefix: 'domain', displayName: '管理域' }, PERM.PERM_EDIT_DOMAIN);
}
