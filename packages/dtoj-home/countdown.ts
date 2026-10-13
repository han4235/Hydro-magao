import { moment } from 'hydrooj';

export type CountdownSideStored = {
    tag: string;
    title: string;
    date: string;
};

export type CountdownRowStored = {
    left: CountdownSideStored;
    right: CountdownSideStored;
};

export type CountdownSideView = {
    tag: string;
    title: string;
    date: string;
    ended: boolean;
    days: number;
};

export type CountdownRowView = {
    left: CountdownSideView;
    right: CountdownSideView | null;
    showRight: boolean;
};

export function clipSide(raw: unknown, maxTag = 40, maxTitle = 60): CountdownSideStored {
    const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    return {
        tag: String(o.tag ?? '').trim().slice(0, maxTag),
        title: String(o.title ?? '').trim().slice(0, maxTitle),
        date: normalizeDate(o.date ?? o.when),
    };
}

export function normalizeDate(raw: unknown) {
    const s = String(raw ?? '').trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
}

function parseLegacyDate(raw: unknown) {
    const s = String(raw ?? '').trim();
    const m = s.match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
}

export function migrateCountdownRow(raw: any): CountdownRowStored | null {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.left && typeof raw.left === 'object' && !raw.split) {
        const left = clipSide(raw.left);
        const right = clipSide(raw.right);
        if (!left.tag && !left.title && !right.tag && !right.title) return null;
        return { left, right };
    }
    if (raw.split) {
        const left = raw.left || {};
        const right = raw.right || {};
        return {
            left: {
                tag: String(left.tag || '').trim(),
                title: String(left.title || '').trim(),
                date: parseLegacyDate(left.when) || parseLegacyDate(left.date),
            },
            right: {
                tag: String(right.tag || '').trim(),
                title: String(right.title || '').trim(),
                date: parseLegacyDate(right.when) || parseLegacyDate(right.date),
            },
        };
    }
    const tag = String(raw.tag || '').trim();
    const title = String(raw.title || '').trim();
    if (!tag && !title) return null;
    return {
        left: { tag, title, date: '' },
        right: { tag: '', title: '', date: '' },
    };
}

function buildSide(side: CountdownSideStored, now: moment.Moment, zone: string): CountdownSideView {
    const tag = side.tag;
    const title = side.title;
    const date = normalizeDate(side.date);
    let ended = false;
    let days = 0;
    if (date) {
        const target = moment.tz(date, 'YYYY-MM-DD', zone).startOf('day');
        const today = now.clone().startOf('day');
        days = target.diff(today, 'days');
        ended = days < 0;
        if (ended) days = 0;
    }
    return { tag, title, date, ended, days };
}

export function buildCountdownDisplay(rows: CountdownRowStored[], zone: string): CountdownRowView[] {
    const now = moment().tz(zone || 'Asia/Shanghai');
    return rows.map((row) => {
        const left = buildSide(row.left, now, zone);
        const showRight = !!row.right.tag.trim();
        const right = showRight ? buildSide(row.right, now, zone) : null;
        return { left, right, showRight };
    });
}
