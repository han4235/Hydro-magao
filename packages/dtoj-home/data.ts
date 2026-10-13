export const brand = '青石练习场';

export const homeCardIds = [
    'countdown', 'checkin', 'asset', 'activities', 'news', 'paths', 'docs',
] as const;
export type HomeCardId = typeof homeCardIds[number];

export const homeBoardCardIds: HomeCardId[] = ['countdown', 'checkin', 'asset', 'activities'];

export const defaultHomeLayout: HomeCardId[] = [...homeCardIds];

export const homeCardTitles: Record<HomeCardId, string> = {
    countdown: '赛事倒计时',
    checkin: '每日打卡',
    asset: '羊币与装扮',
    activities: '四项活动',
    news: '公告',
    paths: '学习路径',
    docs: '资料入口',
};

export const homeEditSectionIds = [
    'hero', 'layout', 'countdown', 'checkin', 'asset', 'activities', 'news', 'paths',
] as const;
export type HomeEditSectionId = typeof homeEditSectionIds[number];

export const homeSectionIds = homeEditSectionIds;
export type HomeSectionId = HomeEditSectionId;

export const homeSectionTitles: Record<HomeSectionId, string> = {
    hero: '首页头图',
    layout: '首页卡片',
    countdown: homeCardTitles.countdown,
    checkin: homeCardTitles.checkin,
    asset: homeCardTitles.asset,
    activities: homeCardTitles.activities,
    news: homeCardTitles.news,
    paths: homeCardTitles.paths,
};

export const homeEditMenu: { section: HomeSectionId; hint: string }[] = [
    { section: 'hero', hint: '头图背景、文字、按钮和链接' },
    { section: 'layout', hint: '增删、排序首页上的各模块' },
    { section: 'countdown', hint: '赛事倒计时行与日期' },
    { section: 'checkin', hint: '欢迎语、运势页底部文案' },
    { section: 'asset', hint: '羊币展示与说明' },
    { section: 'activities', hint: '四项活动入口' },
    { section: 'news', hint: '公告列表' },
    { section: 'paths', hint: '学习路径四步' },
];

export const countdownSubtitleDefault = 'CSP-J/S · NOIP 关键节点（示例）';

export type HeroFont =
    | 'sans' | 'yahei' | 'hei' | 'song' | 'serif' | 'fangsong' | 'kai' | 'round' | 'display' | 'mono';

export const heroFontIds: HeroFont[] = [
    'sans', 'yahei', 'hei', 'song', 'serif', 'fangsong', 'kai', 'round', 'display', 'mono',
];

export type HeroText = {
    text: string;
    size: number;
    font: HeroFont;
};

export type HeroLineVariant = 'kicker' | 'title' | 'tagline' | 'range';

export const heroLineVariantIds: HeroLineVariant[] = ['kicker', 'title', 'tagline', 'range'];

export const heroLineVariantOptions: { id: HeroLineVariant; label: string }[] = [
    { id: 'kicker', label: '眉题' },
    { id: 'title', label: '主标题' },
    { id: 'tagline', label: '副标题' },
    { id: 'range', label: '范围说明' },
];

export type HeroLine = {
    variant: HeroLineVariant;
    text: string;
    size: number;
    font: HeroFont;
    color: string;
};

export type HeroGradient =
    | 'brand' | 'teal' | 'ocean' | 'sunset' | 'rose' | 'violet' | 'slate';

export const heroGradientIds: HeroGradient[] = [
    'brand', 'teal', 'ocean', 'sunset', 'rose', 'violet', 'slate',
];

export const heroGradientOptions: { id: HeroGradient; label: string }[] = [
    { id: 'brand', label: '青蓝（默认）' },
    { id: 'teal', label: '青绿' },
    { id: 'ocean', label: '海蓝' },
    { id: 'sunset', label: '夕橙' },
    { id: 'rose', label: '玫红' },
    { id: 'violet', label: '紫罗兰' },
    { id: 'slate', label: '墨灰' },
];

export type HeroButton = {
    label: string;
    href: string;
    primary: boolean;
    font: HeroFont;
    color: string;
    gradient: HeroGradient;
};
export type HeroLink = { label: string; href: string };

export type HeroConfig = {
    background: string;
    lines: HeroLine[];
    buttons: HeroButton[];
    links: HeroLink[];
};

export const heroFontOptions: { id: HeroFont; label: string }[] = [
    { id: 'sans', label: '黑体（默认）' },
    { id: 'yahei', label: '微软雅黑' },
    { id: 'hei', label: '黑体' },
    { id: 'song', label: '宋体' },
    { id: 'serif', label: '思源宋体' },
    { id: 'fangsong', label: '仿宋' },
    { id: 'kai', label: '楷体' },
    { id: 'round', label: '圆体' },
    { id: 'display', label: '艺术标题' },
    { id: 'mono', label: '等宽' },
];

export const heroDefaults: HeroConfig = {
    background: '',
    lines: [
        { variant: 'kicker', text: '算法竞赛 · 本地练习', size: 12, font: 'sans', color: '' },
        { variant: 'title', text: brand, size: 48, font: 'serif', color: '' },
        { variant: 'tagline', text: '题库、训练、比赛放在一处', size: 22, font: 'sans', color: '' },
        { variant: 'range', text: '题库 · 训练 · 比赛', size: 13, font: 'sans', color: '' },
    ],
    buttons: [
        { label: '进入题库', href: '/dtoj/p', primary: true, font: 'sans', color: '', gradient: 'brand' },
        { label: '参加比赛', href: '/contest', primary: false, font: 'sans', color: '', gradient: 'brand' },
        { label: '查看排名', href: '/rank', primary: false, font: 'sans', color: '', gradient: 'brand' },
    ],
    links: [
        { label: '训练计划', href: '/training' },
        { label: 'WIKI', href: '/yzy-wiki' },
        { label: '讨论', href: '/discuss' },
        { label: '评测队列', href: '/record' },
    ],
};

export const checkinDefaults = {
    welcomeText: '欢迎回来，',
    fortuneTitleSuffix: '的运势',
    footerTemplate: '你已经在青石练习场连续打卡了 {{streak}} 天（示例，未入账）',
    emptyEventsText: '暂无赛事倒计时，请在「赛事倒计时」里配置日期。',
    demoStreak: 6,
    goodColor: '#15803d',
    badColor: '#b42318',
};

export const checkinFortuneCount = 365;

export const assetDefaults = {
    coin: 256,
    note: '示例余额，没有账本。',
};

export const countdowns = [
    {
        left: { tag: 'CSP-J/S 2026', title: '第一轮', date: '2026-09-18' },
        right: { tag: 'CSP-J/S 2027', title: '第一轮 · 预估', date: '2027-09-18' },
    },
    {
        left: { tag: 'CSP-J/S 2026', title: '第二轮', date: '2026-11-08' },
        right: { tag: '', title: '', date: '' },
    },
    {
        left: { tag: 'NOIP 2026', title: '正式比赛', date: '2026-11-28' },
        right: { tag: '', title: '', date: '' },
    },
];

export const activities = [
    { id: 'bugfind', href: '/bugfind', title: '找茬', about: '在示例代码里找出写错的地方。' },
    { id: 'jigsaw', href: '/jigsaw', title: '拼图', about: '把打乱的代码行排回可运行的顺序。' },
    { id: 'blackbox', href: '/blackbox', title: '黑盒', about: '只看输入和输出，猜程序在做什么。' },
    { id: 'farm', href: '/farm', title: '农场', about: '用代码经营一小块示例农场。' },
];

export const announcements = [
    { title: '界面示例已打开', body: '现在看到的是静态页面，数字都是写死的。' },
    { title: '课程和比赛尚未接上题库', body: '点进卡片只能看到占位说明，没有真实题目。' },
];

export const paths = [
    { title: '题库', href: '/dtoj/p', text: '先看名称、标签和难度长什么样。' },
    { title: '课程', href: '/training', text: '按方向和类型浏览示例课程。' },
    { title: '比赛', href: '/contest', text: '看赛制、时间和公开方式。' },
    { title: '复盘', href: '/discuss?node=题解', text: '到讨论里看题解分类的示例帖。' },
];

export const places: Record<string, { title: string, about: string, reward: string }> = {
    bugfind: {
        title: '找茬',
        about: '给出一段有错的代码，标出错误所在。没有关卡数据。',
        reward: '示例奖励：羊币 10。不会入账。',
    },
    jigsaw: {
        title: '拼图',
        about: '把语句拼成一段能通过样例的程序。没有关卡数据。',
        reward: '示例奖励：羊币 10。不会入账。',
    },
    blackbox: {
        title: '黑盒',
        about: '根据几组输入输出推断程序行为。没有关卡数据。',
        reward: '示例奖励：羊币 15。不会入账。',
    },
    farm: {
        title: '农场',
        about: '按说明完成一小段经营逻辑。没有关卡数据。',
        reward: '示例奖励：羊币 20。不会入账。',
    },
};
