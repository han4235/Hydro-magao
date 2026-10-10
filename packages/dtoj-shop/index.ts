import { Context } from 'hydrooj';
import { DtojPageHandler } from 'dtoj-ui';
import { places } from './data';

class DtojPlaceHandler extends DtojPageHandler {
    place = 'shop';
    pageName = 'dtoj_shop';

    async get() {
        this.view('dtoj_place', { ...places[this.place], pageName: this.pageName });
    }
}

class DtojShopHandler extends DtojPlaceHandler {
    place = 'shop';
    pageName = 'dtoj_shop';
}
class DtojThemeHandler extends DtojPlaceHandler {
    place = 'theme';
    pageName = 'dtoj_theme';
}
class DtojCardHandler extends DtojPlaceHandler {
    place = 'card';
    pageName = 'dtoj_card';
}

const titles = {
    dtoj_place: '说明',
    dtoj_shop: '神秘商店',
    dtoj_theme: '主题商店',
    dtoj_card: '闪卡',
};

export async function apply(ctx: Context) {
    ctx.Route('dtoj_shop', '/coin/shop', DtojShopHandler);
    ctx.Route('dtoj_theme', '/coin/theme', DtojThemeHandler);
    ctx.Route('dtoj_card', '/coin/cards', DtojCardHandler);
    for (const lang of ['zh', 'zh_TW', 'en', 'kr']) {
        ctx.i18n.load(lang, titles);
    }
}
