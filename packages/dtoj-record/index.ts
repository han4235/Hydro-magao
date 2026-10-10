import {
    Context, PERM, ProblemModel, RecordModel, STATUS, STATUS_CODES, STATUS_TEXTS,
    SettingModel, Types, UserModel, param,
} from 'hydrooj';
import { DtojDataHandler, dropEarlierRoutes, queryString } from 'dtoj-ui';

function memoryText(kb: number) {
    let s = kb * 1024;
    const unit = 1024;
    const names = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    for (const name of names) {
        if (s < unit) return `${Math.round(s * 10) / 10} ${name}`;
        s /= unit;
    }
    return `${Math.round(s * unit)} ${names[names.length - 1]}`;
}

function langChoices() {
    const langs = SettingModel.langs;
    const prefixes = new Set(
        Object.keys(langs).filter((key) => key.includes('.')).map((key) => key.split('.')[0]),
    );
    const choices = [];
    for (const key of Object.keys(langs)) {
        if (prefixes.has(key) || langs[key].hidden || langs[key].disabled) continue;
        choices.push({ id: key, display: langs[key].display });
    }
    return choices;
}

class DtojRecordHandler extends DtojDataHandler {
    @param('page', Types.PositiveInt, true)
    @param('pid', Types.ProblemId, true)
    @param('uidOrName', Types.UidOrName, true)
    @param('lang', Types.String, true)
    @param('status', Types.Int, true)
    async get(
        domainId: string, page = 1, pid?: string | number,
        uidOrName?: string, lang?: string, status?: number,
    ) {
        const q: any = { contest: null };
        let invalid = false;
        if (uidOrName) {
            const udoc = await UserModel.getById(domainId, +uidOrName)
                || await UserModel.getByUname(domainId, uidOrName)
                || await UserModel.getByEmail(domainId, uidOrName);
            if (udoc) q.uid = udoc._id;
            else invalid = true;
        }
        if (q.uid !== this.user._id) this.checkPerm(PERM.PERM_VIEW_RECORD);
        if (pid) {
            const pdoc = await ProblemModel.get(domainId, pid, ProblemModel.PROJECTION_LIST);
            if (pdoc) q.pid = pdoc.docId;
            else invalid = true;
        }
        if (lang) q.lang = lang;
        if (typeof status === 'number') q.status = status;
        const projection: Record<string, 1> = {};
        for (const key of RecordModel.PROJECTION_LIST) projection[key] = 1;
        const [rdocs, rpcount] = invalid
            ? [[], 0]
            : await this.paginate(
                RecordModel.getMulti(domainId, q).sort('_id', -1).project(projection),
                page,
                'record',
            );
        const canViewHidden = this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id;
        const [udict, pdict] = await Promise.all([
            UserModel.getList(domainId, rdocs.map((rdoc) => rdoc.uid)),
            this.user.hasPerm(PERM.PERM_VIEW_PROBLEM)
                ? ProblemModel.getList(domainId, rdocs.map((rdoc) => rdoc.pid), canViewHidden, false, ProblemModel.PROJECTION_LIST)
                : {},
        ]);
        const running = new Set([STATUS.STATUS_JUDGING, STATUS.STATUS_COMPILING, STATUS.STATUS_FETCHED]);
        const records = rdocs.map((rdoc) => {
            const pdoc = pdict[rdoc.pid];
            const visible = pdoc && pdoc.title && pdoc.title !== '*';
            return {
                id: rdoc._id,
                statusKey: STATUS_TEXTS[rdoc.status] || '',
                code: STATUS_CODES[rdoc.status] || '',
                progress: running.has(rdoc.status) && typeof rdoc.progress === 'number' ? rdoc.progress : null,
                score: typeof rdoc.score === 'number' ? rdoc.score : '—',
                time: rdoc.time ? `${Math.round(rdoc.time)}ms` : '—',
                memory: rdoc.memory ? memoryText(rdoc.memory) : '—',
                lang: SettingModel.langs[rdoc.lang]?.display || rdoc.lang || '—',
                problem: visible ? pdoc.title : '*',
                problemLink: visible ? (pdoc.pid || pdoc.docId) : '',
                user: udict[rdoc.uid]?.uname || '—',
            };
        });
        this.view('dtoj_record', {
            records,
            langs: langChoices(),
            statuses: Object.entries(STATUS_TEXTS).map(([id, text]) => ({ id, text })),
            uidOrName: uidOrName || '',
            pid: pid || '',
            lang: lang || '',
            status: typeof status === 'number' ? String(status) : '',
            page,
            pages: rpcount,
            qs: queryString({ uidOrName, pid, lang, status }),
        });
    }
}

export async function apply(ctx: Context) {
    ctx.Route('record_main', '/record', DtojRecordHandler);
    dropEarlierRoutes(ctx, ['/record']);
    for (const lang of ['zh', 'zh_TW', 'en', 'kr']) {
        ctx.i18n.load(lang, { dtoj_record: '评测记录' });
    }
}
