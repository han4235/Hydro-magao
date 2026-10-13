import path from 'path';
import { NotFoundError, StorageModel, ValidationError } from 'hydrooj';

export const HERO_BG_PUBLIC_PATH = '/home/hero/background';

const HERO_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'] as const;
const MAX_BYTES = 5 * 1024 * 1024;

const mimeByExt: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
};

export function heroStoragePath(domainId: string, ext: string) {
    return `dtoj-home/${domainId}/hero${ext}`;
}

export async function clearHeroBackgroundFiles(domainId: string) {
    const paths = HERO_EXTS.map((ext) => heroStoragePath(domainId, ext));
    try {
        await StorageModel.del(paths);
    } catch (e) { /* ignore missing */ }
}

export async function saveHeroBackgroundUpload(domainId: string, file: {
    filepath: string;
    size: number;
    originalFilename?: string;
}, owner: number) {
    if (!file || file.size > MAX_BYTES) throw new ValidationError('file');
    const ext = path.extname(file.originalFilename || '').toLowerCase();
    if (!HERO_EXTS.includes(ext as typeof HERO_EXTS[number])) throw new ValidationError('file');
    await clearHeroBackgroundFiles(domainId);
    await StorageModel.put(heroStoragePath(domainId, ext), file.filepath, owner);
    return HERO_BG_PUBLIC_PATH;
}

export async function readHeroBackground(domainId: string) {
    for (const ext of HERO_EXTS) {
        const storagePath = heroStoragePath(domainId, ext);
        try {
            const body = await StorageModel.get(storagePath);
            if (body) return { body, type: mimeByExt[ext] || 'application/octet-stream' };
        } catch (e) { /* try next ext */ }
    }
    throw new NotFoundError(HERO_BG_PUBLIC_PATH);
}
