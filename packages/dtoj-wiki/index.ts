import { Context } from 'hydrooj';
import { DtojPageHandler } from 'dtoj-ui';
import { wikiGroups } from './data';

export { wikiGroups } from './data';

class DtojWikiHandler extends DtojPageHandler {
    async get() {
        this.view('dtoj_wiki', { groups: wikiGroups });
    }
}

class DtojWikiArticleHandler extends DtojPageHandler {
    async get() {
        const id = String(this.args.slug || '');
        let hit = { title: '占位文章', group: '知识库' };
        for (const group of wikiGroups) {
            const cell = group.cells.find((item) => item.id === id);
            if (cell) hit = { title: cell.title, group: group.title };
        }
        this.view('dtoj_wiki_article', hit);
    }
}

const titles = {
    dtoj_wiki: 'WIKI',
    dtoj_wiki_article: 'WIKI',
};

export async function apply(ctx: Context) {
    ctx.Route('dtoj_wiki', '/yzy-wiki', DtojWikiHandler);
    ctx.Route('dtoj_wiki_article', '/yzy-wiki/:slug', DtojWikiArticleHandler);
    for (const lang of ['zh', 'zh_TW', 'en', 'kr']) {
        ctx.i18n.load(lang, titles);
    }
}
