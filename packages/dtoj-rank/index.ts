import {
    Context, DomainModel, PERM, Types, UserModel, param,
} from 'hydrooj';
import { DtojDataHandler } from 'dtoj-ui';

class DtojRankHandler extends DtojDataHandler {
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, page = 1) {
        const [dudocs, upcount] = await this.paginate(
            DomainModel.getMultiUserInDomain(domainId, { uid: { $gt: 1 }, rp: { $gt: 0 }, join: true }).sort({ rp: -1 }),
            page,
            'ranking',
        );
        const udict = await UserModel.getList(domainId, dudocs.map((dudoc) => dudoc.uid));
        const rows = dudocs.map((dudoc) => {
            const udoc = udict[dudoc.uid];
            return {
                name: udoc?.uname || '—',
                now: Math.round(Number(udoc?.rp ?? dudoc.rp) || 0),
                best: '—',
            };
        });
        this.view('dtoj_rank', { rows, page, pages: upcount });
    }
}

export async function apply(ctx: Context) {
    ctx.Route('dtoj_rank', '/rank', DtojRankHandler, PERM.PERM_VIEW_RANKING);
    for (const lang of ['zh', 'zh_TW', 'en', 'kr']) {
        ctx.i18n.load(lang, { dtoj_rank: '等级分' });
    }
}
