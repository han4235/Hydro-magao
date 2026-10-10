import { Context } from 'hydrooj';
import { DtojPageHandler, pick, queryOf } from 'dtoj-ui';
import { communityTabs, posts } from './data';

class DtojCommunityHandler extends DtojPageHandler {
    async get() {
        const tab = pick(queryOf(this, 'tab'), communityTabs, communityTabs[0]);
        this.view('dtoj_community', { tabs: communityTabs, tab, posts });
    }
}

class DtojCommunityDetailHandler extends DtojPageHandler {
    async get() {
        const id = String(this.args.id || '');
        const post = posts.find((item) => item.id === id) || posts[0];
        this.view('dtoj_post', { post });
    }
}

const titles = {
    dtoj_community: '社区',
    dtoj_post: '帖子',
    dtoj_community_detail: '帖子',
};

export async function apply(ctx: Context) {
    ctx.Route('dtoj_community', '/community', DtojCommunityHandler);
    ctx.Route('dtoj_community_detail', '/community/:id', DtojCommunityDetailHandler);
    for (const lang of ['zh', 'zh_TW', 'en', 'kr']) {
        ctx.i18n.load(lang, titles);
    }
}
