export const brand = '青石练习场';

export const countdowns = [
    {
        split: true,
        left: { tag: 'CSP-J/S 2026', title: '第一轮', state: '已结束', when: '2026-09-18' },
        right: { tag: 'CSP-J/S 2027', title: '第一轮 · 预估', days: 343, when: '预计 2027-09-18' },
    },
    {
        tone: 'gold',
        tag: 'CSP-J/S 2026',
        title: '第二轮',
        days: 20,
        note: '距第二轮还剩 20 天（示例）',
    },
    {
        tone: 'blue',
        tag: 'NOIP 2026',
        title: '正式比赛 · 11 月 28 日',
        days: 49,
        note: '距 NOIP 2026 还剩 49 天（示例）',
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
