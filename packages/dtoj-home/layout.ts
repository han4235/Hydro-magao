import {
    defaultHomeLayout,
    homeBoardCardIds,
    homeCardIds,
    homeCardTitles,
    HomeCardId,
} from './data';

const boardSet = new Set<string>(homeBoardCardIds);

export function normalizeHomeLayout(raw: unknown): HomeCardId[] {
    const allow = new Set<string>(homeCardIds);
    const out: HomeCardId[] = [];
    if (Array.isArray(raw)) {
        for (const item of raw) {
            const id = String(item || '').trim();
            if (!allow.has(id) || out.includes(id as HomeCardId)) continue;
            out.push(id as HomeCardId);
        }
    }
    return out;
}

export function splitHomeLayout(layout: HomeCardId[]) {
    const boardLayout: HomeCardId[] = [];
    const bandLayout: HomeCardId[] = [];
    for (const id of layout) {
        if (boardSet.has(id)) boardLayout.push(id);
        else bandLayout.push(id);
    }
    return { boardLayout, bandLayout };
}

export function layoutCardsForEdit(layout: HomeCardId[]) {
    return layout.map((id) => ({ id, title: homeCardTitles[id] }));
}

export function layoutCatalog(layout: HomeCardId[]) {
    const used = new Set(layout);
    return homeCardIds.map((id) => ({
        id,
        title: homeCardTitles[id],
        used: used.has(id),
    }));
}
