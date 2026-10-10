import { Context, Handler, PERM } from 'hydrooj';

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
    ['dtoj_rank', 'dtoj_rank', '等级分'],
    ['record_main', 'dtoj_record', '评测队列'],
    ['dtoj_community', 'dtoj_community', '社区'],
    ['discussion_main', 'dtoj_discuss', '讨论'],
    ['dtoj_shop', 'dtoj_shop', '神秘商店'],
];

export async function apply(ctx: Context) {
    const items = global.Hydro.ui.nodes.Nav as unknown[];
    items.splice(0, items.length);
    for (const [name, prefix, displayName] of nav) {
        global.Hydro.ui.inject('Nav', name, { prefix, displayName });
    }
    global.Hydro.ui.inject('Nav', 'domain_dashboard', { prefix: 'domain', displayName: '管理域' }, PERM.PERM_EDIT_DOMAIN);
}
