import { homeCardIds, HomeCardId } from './data';

export type HomeCardSize = 'narrow' | 'wide' | 'full';

export const homeCardSizeOptions: { id: HomeCardSize; label: string }[] = [
    { id: 'narrow', label: '窄（约 1/3 宽）' },
    { id: 'wide', label: '宽（约 2/3 宽）' },
    { id: 'full', label: '整行' },
];

/** 上排卡片与赛事倒计时同宽（约 1/3），通栏模块整行。 */
export const defaultCardSizes: Record<HomeCardId, HomeCardSize> = {
    countdown: 'narrow',
    checkin: 'narrow',
    asset: 'narrow',
    activities: 'narrow',
    news: 'narrow',
    paths: 'full',
    docs: 'full',
};

export function normalizeCardSize(raw: unknown, cardId: HomeCardId): HomeCardSize {
    const s = String(raw ?? '').trim();
    if (s === 'narrow' || s === 'wide' || s === 'full') return s;
    if (s === 's') return 'narrow';
    if (s === 'l') return 'full';
    return defaultCardSizes[cardId];
}

export function normalizeCardSizes(raw: unknown): Record<HomeCardId, HomeCardSize> {
    const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    const out = {} as Record<HomeCardId, HomeCardSize>;
    for (const id of homeCardIds) {
        out[id] = normalizeCardSize(o[id], id);
    }
    return out;
}

export type CardPlace = { row: number; col: number };

export function spanOfSize(size: HomeCardSize) {
    if (size === 'full') return 6;
    if (size === 'wide') return 4;
    return 2;
}

export function sizeForSpan(span: number): HomeCardSize {
    if (span >= 6) return 'full';
    if (span >= 4) return 'wide';
    return 'narrow';
}

export function packCardPlaces(
    ids: HomeCardId[],
    sizes: Record<HomeCardId, HomeCardSize>,
): Record<HomeCardId, CardPlace> {
    const out = {} as Record<HomeCardId, CardPlace>;
    let col = 1;
    let row = 1;
    for (const id of ids) {
        const span = spanOfSize(sizes[id]);
        if (col + span - 1 > 6) {
            row += 1;
            col = 1;
        }
        out[id] = { row, col };
        col += span;
        if (col > 6) {
            row += 1;
            col = 1;
        }
    }
    return out;
}

export function normalizeCardPlaces(
    raw: unknown,
    ids: HomeCardId[],
    sizes: Record<HomeCardId, HomeCardSize>,
): Record<HomeCardId, CardPlace> {
    const packed = packCardPlaces(ids, sizes);
    const o = (raw && typeof raw === 'object') ? raw as Record<string, { row?: unknown; col?: unknown }> : null;
    if (!o) return packed;
    const out = {} as Record<HomeCardId, CardPlace>;
    for (const id of ids) {
        const row = Number(o[id]?.row);
        const col = Number(o[id]?.col);
        if (row >= 1 && row <= 24 && (col === 1 || col === 3 || col === 5)) {
            out[id] = { row: Math.floor(row), col };
        } else {
            out[id] = packed[id];
        }
    }
    return compactCardPlaces(out, ids);
}

/** 空行不占高度，只留下行距。把用到的行号收成 1、2、3，卡片才能贴到上面。 */
export function compactCardPlaces(
    places: Record<HomeCardId, CardPlace>,
    ids: HomeCardId[],
): Record<HomeCardId, CardPlace> {
    const used: number[] = [];
    for (const id of ids) {
        const row = places[id]?.row || 0;
        if (row >= 1 && used.indexOf(row) < 0) used.push(row);
    }
    used.sort((a, b) => a - b);
    const map: Record<number, number> = {};
    used.forEach((row, index) => { map[row] = index + 1; });
    const out = { ...places };
    for (const id of ids) {
        const place = out[id];
        if (!place || !map[place.row]) continue;
        out[id] = { row: map[place.row], col: place.col };
    }
    return out;
}

export type CardLook = { border: string; background: string };

export function normalizeHexColor(raw: unknown): string {
    const s = String(raw ?? '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : '';
}

export function normalizeCardLooks(raw: unknown): Record<HomeCardId, CardLook> {
    const o = (raw && typeof raw === 'object')
        ? raw as Record<string, { border?: unknown; background?: unknown }>
        : {};
    const out = {} as Record<HomeCardId, CardLook>;
    for (const id of homeCardIds) {
        out[id] = {
            border: normalizeHexColor(o[id]?.border),
            background: normalizeHexColor(o[id]?.background),
        };
    }
    return out;
}

export function cardLookStyle(look: CardLook): string {
    const parts: string[] = [];
    if (look.border) parts.push(`border:1px solid ${look.border}`);
    if (look.background) parts.push(`background-color:${look.background}`);
    return parts.join(';');
}

/** 取色器在未自定义时显示的底色，不写进配置。 */
export function cardLookPicker(id: HomeCardId, look: CardLook) {
    const dark = id === 'paths';
    return {
        border: look.border || (dark ? '#172237' : '#e5e7eb'),
        background: look.background || (dark ? '#172237' : '#ffffff'),
        on: Boolean(look.border || look.background),
    };
}

export const homeEditSectionToCardId: Partial<Record<string, HomeCardId>> = {
    countdown: 'countdown',
    checkin: 'checkin',
    asset: 'asset',
    activities: 'activities',
    news: 'news',
    paths: 'paths',
};
