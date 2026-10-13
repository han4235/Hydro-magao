import { moment } from 'hydrooj';
import { buildCountdownDisplay, CountdownRowStored } from './countdown';

export type CheckinEventLine = {
    label: string;
    days: number;
};

export function buildCheckinEvents(rows: CountdownRowStored[], zone: string): CheckinEventLine[] {
    const display = buildCountdownDisplay(rows, zone);
    const out: CheckinEventLine[] = [];
    for (const row of display) {
        const sides = [row.left, row.right].filter(Boolean);
        for (const side of sides) {
            if (!side || !side.date || side.ended) continue;
            const label = [side.tag, side.title].filter(Boolean).join(' ').trim();
            if (!label) continue;
            out.push({ label, days: side.days });
        }
    }
    return out.slice(0, 4);
}

export function checkinCalendar(zone: string) {
    const now = moment().tz(zone || 'Asia/Shanghai');
    const day = now.date();
    const cnMonth = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
    const monthCn = `${cnMonth[now.month()]}月`;
    const monthLong = `${monthCn}大`;
    const weekday = `星期${'日一二三四五六'[now.day()]}`;
    return {
        day,
        monthCn,
        monthLong,
        weekday,
        dayKey: now.format('YYYY-MM-DD'),
    };
}
