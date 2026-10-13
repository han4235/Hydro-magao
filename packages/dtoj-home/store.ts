import { DomainModel } from 'hydrooj';
import {
    CountdownRowStored,
    migrateCountdownRow,
    normalizeDate,
} from './countdown';
import {
    activities,
    announcements,
    assetDefaults,
    checkinDefaults,
    countdownSubtitleDefault,
    countdowns,
    heroDefaults,
    heroFontIds,
    heroGradientIds,
    heroLineVariantIds,
    HeroButton,
    HeroConfig,
    HeroFont,
    HeroGradient,
    HeroLine,
    HeroLineVariant,
    HeroLink,
    HeroText,
    homeCardIds,
    HomeCardId,
    paths,
} from './data';
import { normalizeHomeLayout } from './layout';
import {
    CardLook,
    CardPlace,
    HomeCardSize,
    homeEditSectionToCardId,
    compactCardPlaces,
    normalizeCardLooks,
    normalizeCardPlaces,
    normalizeCardSize,
    normalizeCardSizes,
    normalizeHexColor,
    sizeForSpan,
} from './cardSize';

export type HomeConfig = {
    layout: HomeCardId[];
    cardSizes: Record<HomeCardId, HomeCardSize>;
    cardPlaces: Record<HomeCardId, CardPlace>;
    cardLooks: Record<HomeCardId, CardLook>;
    countdownSubtitle: string;
    countdowns: CountdownRowStored[];
    checkin: typeof checkinDefaults;
    asset: typeof assetDefaults;
    activities: typeof activities;
    announcements: typeof announcements;
    paths: typeof paths;
    hero: HeroConfig;
};

function normalizeCheckinConfig(raw: unknown) {
    const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    const legacyFooter = Array.isArray(o.lines) && o.lines[0]
        ? String(o.lines[0]).trim()
        : '';
    const footer = clip(o.footerTemplate, 200)
        || (legacyFooter.includes('{{streak}}') ? legacyFooter : '')
        || checkinDefaults.footerTemplate;
    return {
        welcomeText: clip(o.welcomeText, 40) || checkinDefaults.welcomeText,
        fortuneTitleSuffix: clip(o.fortuneTitleSuffix, 20) || checkinDefaults.fortuneTitleSuffix,
        footerTemplate: footer,
        emptyEventsText: checkinDefaults.emptyEventsText,
        demoStreak: checkinDefaults.demoStreak,
        goodColor: normalizeHexColor(o.goodColor) || checkinDefaults.goodColor,
        badColor: normalizeHexColor(o.badColor) || checkinDefaults.badColor,
    };
}

function heroFontOf(raw: unknown, fallback: HeroFont): HeroFont {
    const s = String(raw ?? '').trim() as HeroFont;
    if (heroFontIds.includes(s)) return s;
    return fallback;
}

function heroGradientOf(raw: unknown, fallback: HeroGradient): HeroGradient {
    const s = String(raw ?? '').trim() as HeroGradient;
    if (heroGradientIds.includes(s)) return s;
    return fallback;
}

function heroLineVariantOf(raw: unknown, fallback: HeroLineVariant): HeroLineVariant {
    const s = String(raw ?? '').trim() as HeroLineVariant;
    if (heroLineVariantIds.includes(s)) return s;
    return fallback;
}

function heroLineFromLegacy(
    variant: HeroLineVariant,
    raw: unknown,
    fallback: HeroLine,
): HeroLine {
    const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    return {
        variant,
        text: clip(o.text, 80) || fallback.text,
        size: heroSizeOf(o.size, fallback.size),
        font: heroFontOf(o.font, fallback.font),
        color: normalizeHexColor(o.color),
    };
}

function defaultHeroLine(variant: HeroLineVariant): HeroLine {
    const hit = heroDefaults.lines.find((item) => item.variant === variant);
    if (hit) return { ...hit };
    return {
        variant,
        text: '',
        size: 16,
        font: 'sans',
        color: '',
    };
}

function normalizeHeroLines(raw: unknown, legacy: Record<string, unknown>): HeroLine[] {
    if (Array.isArray(raw)) {
        if (!raw.length) return [];
        return raw.slice(0, 12).map((item, index) => {
            const fallback = heroDefaults.lines[index] || defaultHeroLine('tagline');
            const row = (item && typeof item === 'object') ? item as Record<string, unknown> : {};
            return {
                variant: heroLineVariantOf(row.variant, fallback.variant),
                text: clip(row.text, 80),
                size: heroSizeOf(row.size, fallback.size),
                font: heroFontOf(row.font, fallback.font),
                color: normalizeHexColor(row.color),
            };
        });
    }
    const variants: HeroLineVariant[] = ['kicker', 'title', 'tagline', 'range'];
    return variants.map((variant) => heroLineFromLegacy(
        variant,
        legacy[variant],
        defaultHeroLine(variant),
    ));
}

function heroSizeOf(raw: unknown, fallback: number) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(10, Math.min(72, Math.floor(n)));
}

function heroAssetUrl(raw: unknown) {
    const s = clip(raw, 500);
    if (!s || /[\s"'<>\\()]/.test(s)) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('/') && !s.startsWith('//')) return s;
    return '';
}

function heroHref(raw: unknown) {
    const s = clip(raw, 200);
    if (!s || /[\s"'<>\\]/.test(s)) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('/') && !s.startsWith('//')) return s;
    return '';
}

function normalizeHeroText(raw: unknown, fallback: HeroText): HeroText {
    const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : null;
    if (!o) return { ...fallback };
    return {
        text: clip(o.text, 80),
        size: heroSizeOf(o.size, fallback.size),
        font: heroFontOf(o.font, fallback.font),
    };
}

function normalizeHero(raw: unknown): HeroConfig {
    const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    const buttons = Array.isArray(o.buttons)
        ? o.buttons.slice(0, 8).map((item) => {
            const row = (item && typeof item === 'object') ? item as Record<string, unknown> : {};
            return {
                label: clip(row.label, 20),
                href: heroHref(row.href),
                primary: Boolean(row.primary),
                font: heroFontOf(row.font, 'sans'),
                color: normalizeHexColor(row.color),
                gradient: heroGradientOf(row.gradient, 'brand'),
            };
        }).filter((item) => item.label && item.href)
        : heroDefaults.buttons.map((item) => ({ ...item }));
    const links = Array.isArray(o.links)
        ? o.links.slice(0, 12).map((item) => {
            const row = (item && typeof item === 'object') ? item as Record<string, unknown> : {};
            return { label: clip(row.label, 20), href: heroHref(row.href) };
        }).filter((item) => item.label && item.href)
        : heroDefaults.links.map((item) => ({ ...item }));
    const lines = Array.isArray(o.lines)
        ? normalizeHeroLines(o.lines, o)
        : normalizeHeroLines(undefined, o);
    return {
        background: heroAssetUrl(o.background),
        lines,
        buttons,
        links,
    };
}

function clip(raw: unknown, max: number) {
    return String(raw ?? '').trim().slice(0, max);
}

function posInt(raw: unknown, fallback: number, max = 99999) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.min(max, Math.floor(n));
}

const maxActivities = 12;

function activityIdFromHref(href: string, fallback: string) {
    const slug = String(href ?? '').trim().replace(/^\/+/, '').split(/[/?#]/)[0];
    return clip(slug, 24) || fallback;
}

function normalizeActivityItem(
    item: { id?: string; href?: string; title?: string; about?: string },
    index: number,
) {
    const href = clip(item.href, 120);
    const title = clip(item.title, 40);
    const about = clip(item.about, 120);
    const id = clip(item.id, 24) || activityIdFromHref(href, `act${index}`);
    return { id, href, title, about };
}

async function savedBlob(domainId: string) {
    const id = typeof domainId === 'string' ? domainId : '';
    if (!id) return {};
    const ddoc = await DomainModel.get(id);
    return ((ddoc as any)?.dtojHome || {}) as Partial<HomeConfig>;
}

export async function loadHomeConfig(domainId: string): Promise<HomeConfig> {
    const saved = await savedBlob(domainId);
    const layout = normalizeHomeLayout(saved.layout);
    const cardSizes = normalizeCardSizes(saved.cardSizes);
    return {
        layout,
        cardSizes,
        cardPlaces: normalizeCardPlaces(saved.cardPlaces, layout, cardSizes),
        cardLooks: normalizeCardLooks(saved.cardLooks),
        countdownSubtitle: clip(saved.countdownSubtitle, 120) || countdownSubtitleDefault,
        countdowns: normalizeCountdownList(saved.countdowns),
        checkin: normalizeCheckinConfig(saved.checkin),
        asset: {
            coin: posInt(saved.asset?.coin, assetDefaults.coin),
            note: clip(saved.asset?.note, 200) || assetDefaults.note,
        },
        activities: Array.isArray(saved.activities)
            ? saved.activities.slice(0, maxActivities)
                .map((item, i) => normalizeActivityItem(item, i))
                .filter((item) => item.title || item.href)
            : activities.map((item) => ({ ...item })),
        announcements: Array.isArray(saved.announcements)
            ? saved.announcements.slice(0, 20).map((item) => ({
                title: clip(item.title, 80),
                body: clip(item.body, 400),
            })).filter((item) => item.title)
            : announcements.map((item) => ({ ...item })),
        paths: Array.isArray(saved.paths) && saved.paths.length === 4
            ? saved.paths.map((item, i) => ({
                title: clip(item.title, 40) || paths[i].title,
                href: clip(item.href, 120) || paths[i].href,
                text: clip(item.text, 200) || paths[i].text,
            }))
            : paths.map((item) => ({ ...item })),
        hero: normalizeHero(saved.hero),
    };
}

async function mergeSave(domainId: string, patch: Partial<HomeConfig>) {
    const saved = await savedBlob(domainId);
    await DomainModel.edit(domainId, { dtojHome: { ...saved, ...patch } } as any);
}

export async function patchHeroBackground(domainId: string, background: string) {
    const cfg = await loadHomeConfig(domainId);
    await mergeSave(domainId, {
        hero: normalizeHero({
            ...cfg.hero,
            background,
        }),
    });
}

async function saveCardSizeForSection(
    domainId: string,
    section: string,
    body: Record<string, unknown>,
) {
    if (section === 'layout') {
        if (body.cardSize_docs === undefined) return;
        const saved = await savedBlob(domainId);
        const sizes = normalizeCardSizes(saved.cardSizes);
        sizes.docs = normalizeCardSize(body.cardSize_docs, 'docs');
        await mergeSave(domainId, { cardSizes: sizes });
        return;
    }
    const cardId = homeEditSectionToCardId[section];
    if (!cardId || body.cardSize === undefined) return;
    const saved = await savedBlob(domainId);
    const sizes = normalizeCardSizes(saved.cardSizes);
    sizes[cardId] = normalizeCardSize(body.cardSize, cardId);
    await mergeSave(domainId, { cardSizes: sizes });
}

async function saveCardLookForSection(
    domainId: string,
    section: string,
    body: Record<string, unknown>,
) {
    if (body.cardColorFields === undefined) return;
    const cardId = section === 'layout' ? 'docs' : homeEditSectionToCardId[section];
    if (!cardId) return;
    const saved = await savedBlob(domainId);
    const looks = normalizeCardLooks(saved.cardLooks);
    looks[cardId] = body.cardColorOn
        ? {
            border: normalizeHexColor(body.cardBorder),
            background: normalizeHexColor(body.cardBackground),
        }
        : { border: '', background: '' };
    await mergeSave(domainId, { cardLooks: looks });
}

export async function saveCardPlaces(
    domainId: string,
    items: { id: string; row: number; col: number; span: number }[],
) {
    const cfg = await loadHomeConfig(domainId);
    const places = { ...cfg.cardPlaces };
    const sizes = { ...cfg.cardSizes };
    const allow = new Set<string>(cfg.layout);
    for (const item of items) {
        if (!allow.has(item.id)) continue;
        const span = item.span >= 6 ? 6 : item.span >= 4 ? 4 : 2;
        let col = item.col === 3 || item.col === 5 ? item.col : 1;
        if (span === 6) col = 1;
        if (span === 4 && col === 5) col = 3;
        const row = Math.max(1, Math.min(12, Math.floor(Number(item.row)) || 1));
        places[item.id as HomeCardId] = { row, col };
        sizes[item.id as HomeCardId] = sizeForSpan(span);
    }
    const packed = compactCardPlaces(places, cfg.layout);
    await mergeSave(domainId, { cardPlaces: packed, cardSizes: sizes });
}

export function fillTokens(text: string, vars: Record<string, string | number>) {
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

const MAX_COUNTDOWN_ROWS = 20;

function sanitizeCountdownRow(raw: unknown): CountdownRowStored | null {
    const row = migrateCountdownRow(raw);
    if (!row) return null;
    return {
        left: {
            tag: clip(row.left.tag, 40),
            title: clip(row.left.title, 60),
            date: normalizeDate(row.left.date),
        },
        right: {
            tag: clip(row.right.tag, 40),
            title: clip(row.right.title, 60),
            date: normalizeDate(row.right.date),
        },
    };
}

function normalizeCountdownList(raw: unknown): CountdownRowStored[] {
    if (!Array.isArray(raw) || !raw.length) {
        return countdowns.map((item) => ({
            left: { ...item.left },
            right: { ...item.right },
        }));
    }
    const rows = raw.map((item) => sanitizeCountdownRow(item)).filter(Boolean) as CountdownRowStored[];
    return rows.length ? rows.slice(0, MAX_COUNTDOWN_ROWS) : countdowns.map((item) => ({
        left: { ...item.left },
        right: { ...item.right },
    }));
}

export function countdownRowsForEdit(items: CountdownRowStored[]) {
    return normalizeCountdownList(items);
}

function parseCountdownBody(body: Record<string, unknown>) {
    const n = Math.min(MAX_COUNTDOWN_ROWS, posInt(body.rowCount, 0));
    const rows: CountdownRowStored[] = [];
    for (let i = 0; i < n; i++) {
        const row = sanitizeCountdownRow({
            left: {
                tag: body[`left_tag_${i}`],
                title: body[`left_title_${i}`],
                date: body[`left_date_${i}`],
            },
            right: {
                tag: body[`right_tag_${i}`],
                title: body[`right_title_${i}`],
                date: body[`right_date_${i}`],
            },
        });
        if (row) rows.push(row);
    }
    return rows.slice(0, MAX_COUNTDOWN_ROWS);
}

export async function saveHomeSection(domainId: string, section: string, body: Record<string, unknown>) {
    if (section === 'countdown') {
        const parsed = parseCountdownBody(body);
        const next = parsed.length ? parsed : normalizeCountdownList([]);
        await mergeSave(domainId, {
            countdownSubtitle: clip(body.countdownSubtitle, 120) || countdownSubtitleDefault,
            countdowns: next,
        });
    } else if (section === 'checkin') {
        await mergeSave(domainId, {
            checkin: normalizeCheckinConfig({
                welcomeText: body.welcomeText,
                fortuneTitleSuffix: body.fortuneTitleSuffix,
                footerTemplate: body.footerTemplate,
                goodColor: body.goodColor,
                badColor: body.badColor,
            }),
        });
    } else if (section === 'asset') {
        await mergeSave(domainId, {
            asset: {
                coin: posInt(body.coin, assetDefaults.coin),
                note: clip(body.note, 200) || assetDefaults.note,
            },
        });
    } else if (section === 'activities') {
        const n = Math.min(maxActivities, posInt(body.rowCount, 0));
        const next = [];
        for (let i = 0; i < n; i++) {
            const title = clip(body[`act${i}_title`], 40);
            const about = clip(body[`act${i}_about`], 120);
            const href = clip(body[`act${i}_href`], 120);
            if (!title && !href) continue;
            const id = clip(body[`act${i}_id`], 24) || activityIdFromHref(href, `act${next.length}`);
            next.push({
                id,
                href: href || '#',
                title: title || '活动',
                about,
            });
        }
        await mergeSave(domainId, { activities: next });
    } else if (section === 'news') {
        const n = Math.min(20, posInt(body.rowCount, 0));
        const rows = [];
        for (let i = 0; i < n; i++) {
            const title = clip(body[`news${i}_title`], 80);
            const text = clip(body[`news${i}_body`], 400);
            if (!title) continue;
            rows.push({ title, body: text });
        }
        await mergeSave(domainId, { announcements: rows });
    } else if (section === 'paths') {
        const next = [0, 1, 2, 3].map((i) => ({
            title: clip(body[`path${i}_title`], 40) || paths[i].title,
            href: clip(body[`path${i}_href`], 120) || paths[i].href,
            text: clip(body[`path${i}_text`], 200) || paths[i].text,
        }));
        await mergeSave(domainId, { paths: next });
    } else if (section === 'layout') {
        const n = Math.min(homeCardIds.length, posInt(body.rowCount, 0));
        const allow = new Set<string>(homeCardIds);
        const ids: HomeCardId[] = [];
        for (let i = 0; i < n; i++) {
            const id = clip(body[`layout_id_${i}`], 24);
            if (!allow.has(id) || ids.includes(id as HomeCardId)) continue;
            ids.push(id as HomeCardId);
        }
        await mergeSave(domainId, { layout: normalizeHomeLayout(ids) });
    } else if (section === 'hero') {
        const lineCount = Math.min(12, posInt(body.lineCount, 0));
        const lines: HeroLine[] = [];
        for (let i = 0; i < lineCount; i++) {
            const text = clip(body[`line${i}_text`], 80);
            const variant = heroLineVariantOf(body[`line${i}_variant`], 'tagline');
            const fallback = defaultHeroLine(variant);
            lines.push({
                variant,
                text,
                size: heroSizeOf(body[`line${i}_size`], fallback.size),
                font: heroFontOf(body[`line${i}_font`], fallback.font),
                color: normalizeHexColor(body[`line${i}_color`]),
            });
        }
        const buttonCount = Math.min(8, posInt(body.buttonCount, 0));
        const buttons: HeroButton[] = [];
        for (let i = 0; i < buttonCount; i++) {
            const label = clip(body[`button${i}_label`], 20);
            const href = heroHref(body[`button${i}_href`]);
            if (!label || !href) continue;
            buttons.push({
                label,
                href,
                primary: Boolean(body[`button${i}_primary`]),
                font: heroFontOf(body[`button${i}_font`], 'sans'),
                color: normalizeHexColor(body[`button${i}_color`]),
                gradient: heroGradientOf(body[`button${i}_gradient`], 'brand'),
            });
        }
        const linkCount = Math.min(12, posInt(body.linkCount, 0));
        const links: HeroLink[] = [];
        for (let i = 0; i < linkCount; i++) {
            const label = clip(body[`link${i}_label`], 20);
            const href = heroHref(body[`link${i}_href`]);
            if (!label || !href) continue;
            links.push({ label, href });
        }
        await mergeSave(domainId, {
            hero: normalizeHero({
                background: body.background,
                lines,
                buttons,
                links,
            }),
        });
    } else {
        throw new Error('unknown section');
    }
    await saveCardSizeForSection(domainId, section, body);
    await saveCardLookForSection(domainId, section, body);
}
