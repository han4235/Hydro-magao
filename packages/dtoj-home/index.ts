import {
    Context, difficultyAlgorithm, PERM, ProblemModel, Types, param,
} from 'hydrooj';
import {
    DtojDataHandler, DtojPageHandler, dropEarlierRoutes, queryString,
} from 'dtoj-ui';
import { wikiGroups } from 'dtoj-wiki';
import {
    activities, announcements, brand, countdowns, paths, places,
} from './data';

const levelNames = ['入门', '简单', '中等', '困难', '挑战'];

function problemLevel(pdoc: { difficulty?: number, nSubmit?: number, nAccept?: number }) {
    const raw = pdoc.difficulty || difficultyAlgorithm(pdoc.nSubmit || 0, pdoc.nAccept || 0) || 0;
    const n = Number(raw);
    if (!n) return '';
    if (n <= 2) return '入门';
    if (n <= 4) return '简单';
    if (n <= 6) return '中等';
    if (n <= 8) return '困难';
    return '挑战';
}

function passRate(nSubmit = 0, nAccept = 0) {
    if (!nSubmit) return null;
    return Math.round((nAccept / nSubmit) * 100);
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
    @param('q', Types.String, true)
    @param('tag', Types.String, true)
    @param('diff', Types.String, true)
    @param('sort', Types.String, true)
    @param('tags', Types.String, true)
    async get(domainId: string, page = 1, q = '', tag = '', diff = '', sort = '', tags = '') {
        const query: any = {};
        if (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) {
            query.$or = [
                { hidden: false },
                { owner: this.user._id },
                { maintainer: this.user._id },
            ];
        }
        await this.ctx.parallel('problem/list', query, this, []);
        const docs = await ProblemModel.getMulti(domainId, query).toArray();
        const keyword = q.trim().toLowerCase();
        const wanted = levelNames.includes(diff) ? diff : '';
        const order = sort === 'old' || sort === 'id' ? sort : 'new';
        const cards = docs.map((pdoc) => ({
            title: pdoc.title,
            pid: String(pdoc.pid || pdoc.docId),
            link: pdoc.pid || pdoc.docId,
            docId: pdoc.docId,
            tags: pdoc.tag || [],
            level: problemLevel(pdoc),
            rate: passRate(pdoc.nSubmit, pdoc.nAccept),
        }));
        const tagSet = new Set<string>();
        for (const card of cards) for (const name of card.tags) tagSet.add(name);
        const matched = cards.filter((card) => {
            if (wanted && card.level !== wanted) return false;
            if (tag && !card.tags.includes(tag)) return false;
            if (!keyword) return true;
            const blob = `${card.pid} ${card.title} ${card.tags.join(' ')}`.toLowerCase();
            return blob.includes(keyword);
        });
        matched.sort((a, b) => {
            if (order === 'id') return a.pid.localeCompare(b.pid, 'en');
            const delta = a.docId - b.docId;
            return order === 'old' ? delta : -delta;
        });
        const size = 50;
        const pages = Math.max(1, Math.ceil(matched.length / size));
        const safePage = Math.min(page, pages);
        const lucky = matched.length ? matched[Math.floor(Math.random() * matched.length)] : null;
        this.view('dtoj_problems', {
            problems: matched.slice((safePage - 1) * size, safePage * size),
            tags: [...tagSet].sort((a, b) => a.localeCompare(b, 'zh')),
            levels: levelNames,
            total: matched.length,
            q,
            tag,
            diff: wanted,
            sort: order,
            showTags: tags !== '0',
            lucky: lucky ? lucky.link : '',
            page: safePage,
            pages,
            qs: queryString({ q, tag, diff: wanted, sort: order, tags }),
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
