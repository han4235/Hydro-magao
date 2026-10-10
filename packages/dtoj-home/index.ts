import {
    Context, difficultyAlgorithm, PERM, ProblemModel, Types, param,
} from 'hydrooj';
import {
    DtojDataHandler, DtojPageHandler, dropEarlierRoutes,
} from 'dtoj-ui';
import { wikiGroups } from 'dtoj-wiki';
import {
    activities, announcements, brand, countdowns, paths, places,
} from './data';

function problemLevel(pdoc: { difficulty?: number, nSubmit?: number, nAccept?: number }) {
    if (pdoc.difficulty) return pdoc.difficulty;
    return difficultyAlgorithm(pdoc.nSubmit || 0, pdoc.nAccept || 0) || '';
}

class DtojHomeHandler extends DtojPageHandler {
    async get() {
        const u = this.user;
        const guest = !u || !u._id;
        const name = guest ? '示例同学' : String(u.uname || '示例同学');
        this.view('dtoj_home', {
            brand,
            coin: 256,
            streak: 6,
            who: name,
            mark: name.slice(0, 1),
            countdowns,
            activities,
            announcements,
            paths,
            wikiGroups,
        });
    }
}

class DtojPlaceHandler extends DtojPageHandler {
    place = 'bugfind';
    pageName = 'dtoj_bugfind';

    async get() {
        this.view('dtoj_place', { ...places[this.place], pageName: this.pageName });
    }
}

class DtojBugfindHandler extends DtojPlaceHandler {
    place = 'bugfind';
    pageName = 'dtoj_bugfind';
}
class DtojJigsawHandler extends DtojPlaceHandler {
    place = 'jigsaw';
    pageName = 'dtoj_jigsaw';
}
class DtojBlackboxHandler extends DtojPlaceHandler {
    place = 'blackbox';
    pageName = 'dtoj_blackbox';
}
class DtojFarmHandler extends DtojPlaceHandler {
    place = 'farm';
    pageName = 'dtoj_farm';
}

class DtojProblemHandler extends DtojDataHandler {
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, page = 1) {
        const query: any = {};
        if (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) {
            query.$or = [
                { hidden: false },
                { owner: this.user._id },
                { maintainer: this.user._id },
            ];
        }
        await this.ctx.parallel('problem/list', query, this, []);
        const [pdocs, ppcount] = await this.paginate(
            ProblemModel.getMulti(domainId, query).sort({ sort: 1, docId: 1 }),
            page,
            'problem',
        );
        this.view('dtoj_problems', {
            problems: pdocs.map((pdoc) => ({
                title: pdoc.title,
                link: pdoc.pid || pdoc.docId,
                tags: pdoc.tag || [],
                level: problemLevel(pdoc),
            })),
            page,
            pages: ppcount,
        });
    }
}

const titles = {
    dtoj_home: '首页',
    dtoj_place: '说明',
    dtoj_bugfind: '找茬',
    dtoj_jigsaw: '拼图',
    dtoj_blackbox: '黑盒',
    dtoj_farm: '农场',
    dtoj_problems: '题库',
};

export async function apply(ctx: Context) {
    ctx.Route('homepage', '/', DtojHomeHandler);
    ctx.Route('dtoj_bugfind', '/bugfind', DtojBugfindHandler);
    ctx.Route('dtoj_jigsaw', '/jigsaw', DtojJigsawHandler);
    ctx.Route('dtoj_blackbox', '/blackbox', DtojBlackboxHandler);
    ctx.Route('dtoj_farm', '/farm', DtojFarmHandler);
    ctx.Route('dtoj_problems', '/dtoj/p', DtojProblemHandler, PERM.PERM_VIEW_PROBLEM);
    dropEarlierRoutes(ctx, ['/']);
    for (const lang of ['zh', 'zh_TW', 'en', 'kr']) {
        ctx.i18n.load(lang, titles);
    }
}
