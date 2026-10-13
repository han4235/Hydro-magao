export type CheckinFortune = {
    level: string;
    advice: string;
    taboos: { title: string; note: string }[];
};

const levels = ['大吉', '中吉', '小吉', '吉', '末吉', '凶', '小凶', '中凶', '大凶'];
const advicesGood = [
    '宜：写题', '宜：复盘', '宜：早睡', '宜：手敲一遍', '宜：对拍', '宜：看题解', '宜：整理错题',
];
const advicesBad = [
    '诸事不宜', '宜静不宜动', '宜休息不宜硬肝', '宜改题不宜开新坑',
];
const tabooTitles = [
    '忌：摸鱼', '忌：不写注释', '忌：盲交', '忌：复制粘贴', '忌：熬夜', '忌：不写对拍',
    '忌：写暴戾语言', '忌：跳过样例', '忌：不读题', '忌：死磕一题',
];
const tabooNotes = [
    '被教练制裁', '调试到天亮', 'WA 到怀疑人生', '爆零预定', '第二天起不来',
    '禁赛一年（示例）', '样例都过不去', '思路越写越偏', '罚时 +60',
];

function pick<T>(arr: T[], n: number) {
    return arr[n % arr.length];
}

function buildFortune(i: number): CheckinFortune {
    const bad = i % 9 >= 5;
    const level = pick(levels, i * 7 + 3);
    const advice = bad ? pick(advicesBad, i) : pick(advicesGood, i * 5);
    const t1 = pick(tabooTitles, i * 11);
    const t2 = pick(tabooTitles, i * 13 + 5);
    return {
        level,
        advice,
        taboos: [
            { title: t1, note: pick(tabooNotes, i + 1) },
            { title: t2 === t1 ? pick(tabooTitles, i + 17) : t2, note: pick(tabooNotes, i + 7) },
        ],
    };
}

export const checkinFortunes: CheckinFortune[] = Array.from({ length: 365 }, (_, i) => buildFortune(i));

export function fortuneIndexForDay(uid: number, dayKey: string) {
    const seed = `${uid}:${dayKey}`;
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) % checkinFortunes.length;
}
