import {
    ContestModel, ContestNotFoundError, Context, NotAssignedError, ObjectId, PERM,
    Types, UserModel, param,
} from 'hydrooj';
import { DtojDataHandler, dropEarlierRoutes, pick, queryOf, queryString } from 'dtoj-ui';
import { contestTabs } from './data';

function contestHours(tdoc: { duration?: number, beginAt?: Date, endAt?: Date }) {
    const raw = tdoc.duration
        ? Number(tdoc.duration)
        : (new Date(tdoc.endAt).getTime() - new Date(tdoc.beginAt).getTime()) / 3600000;
    if (!Number.isFinite(raw)) return '—';
    return (Math.round(raw * 10) / 10).toFixed(1);
}

function contestCard(tdoc: any) {
    const rule = ContestModel.RULES[tdoc.rule];
    return {
        id: tdoc.docId.toHexString(),
        title: tdoc.title,
        group: '—',
        hours: contestHours(tdoc),
        problems: Array.isArray(tdoc.pids) ? tdoc.pids.length : 0,
        people: tdoc.attend || 0,
        rule: rule ? rule.TEXT : '',
        access: tdoc._code ? '邀请码' : '公开',
        beginAt: tdoc.beginAt,
        endAt: tdoc.endAt,
    };
}

class DtojContestHandler extends DtojDataHandler {
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, page = 1) {
        const tab = pick(queryOf(this, 'tab'), contestTabs, contestTabs[0]);
        const groups = (await UserModel.listGroup(
            domainId,
            this.user.hasPerm(PERM.PERM_VIEW_HIDDEN_CONTEST) ? undefined : this.user._id,
        )).map((group) => group.name);
        const rules = Object.keys(ContestModel.RULES).filter((rule) => !ContestModel.RULES[rule].hidden);
        const filter: any = {
            ...(this.user.hasPerm(PERM.PERM_VIEW_HIDDEN_CONTEST)
                ? {}
                : {
                    $or: [
                        { maintainer: this.user._id },
                        { owner: this.user._id },
                        { assign: { $in: groups } },
                        { assign: { $size: 0 } },
                    ],
                }),
            rule: { $in: rules },
        };
        await this.ctx.parallel('contest/list', filter, this);
        const [tdocs, tpcount] = await this.paginate(
            ContestModel.getMulti(domainId, filter).sort({ endAt: -1, beginAt: -1, _id: -1 }),
            page,
            'contest',
        );
        const cards = tdocs.map(contestCard);
        this.view('dtoj_contest', {
            tabs: contestTabs,
            tab,
            featured: page === 1 ? cards[0] : undefined,
            contests: cards,
            page,
            pages: tpcount,
            qs: queryString({ tab }),
        });
    }
}

class DtojContestDetailHandler extends DtojDataHandler {
    @param('tid', Types.ObjectId)
    async get(domainId: string, tid: ObjectId) {
        const tdoc = await ContestModel.get(domainId, tid);
        if (!ContestModel.RULES[tdoc.rule] || ContestModel.RULES[tdoc.rule].hidden) {
            throw new ContestNotFoundError(domainId, tid);
        }
        if (tdoc.assign?.length && !this.user.own(tdoc) && !this.user.hasPerm(PERM.PERM_VIEW_HIDDEN_CONTEST)) {
            const groups = await UserModel.listGroup(domainId, this.user._id);
            if (!new Set(tdoc.assign).intersection(new Set(groups.map((group) => group.name))).size) {
                throw new NotAssignedError('contest', tid);
            }
        }
        this.view('dtoj_contest_detail', { contest: contestCard(tdoc) });
    }
}

const titles = {
    dtoj_contest: '比赛',
    dtoj_contest_detail: '比赛详情',
};

export async function apply(ctx: Context) {
    ctx.Route('contest_main', '/contest', DtojContestHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('dtoj_contest_detail', '/contest/:tid', DtojContestDetailHandler, PERM.PERM_VIEW_CONTEST);
    dropEarlierRoutes(ctx, ['/contest', '/contest/:tid']);
    for (const lang of ['zh', 'zh_TW', 'en', 'kr']) {
        ctx.i18n.load(lang, titles);
    }
}
