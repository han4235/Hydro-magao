import { ObjectId } from 'mongodb';
import {
    Handler, PERM, PRIV, STATUS, STATUS_CODES, STATUS_SHORT_TEXTS, STATUS_TEXTS, SettingModel,
} from 'hydrooj';
import type { ProblemDoc, RecordDoc, Udoc } from 'hydrooj/src/interface';

const LIMIT_GE = new Set([
    STATUS.STATUS_TIME_LIMIT_EXCEEDED,
    STATUS.STATUS_MEMORY_LIMIT_EXCEEDED,
    STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED,
]);

export function memoryText(kb: number) {
    let s = kb * 1024;
    const unit = 1024;
    const names = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    for (const name of names) {
        if (s < unit) return `${Math.round(s * 10) / 10} ${name}`;
        s /= unit;
    }
    return `${Math.round(s * unit)} ${names[names.length - 1]}`;
}

export function recordStatusLabel(status: number) {
    const short = STATUS_SHORT_TEXTS[status as STATUS];
    if (short) return short;
    return STATUS_TEXTS[status as STATUS] || '';
}

function codeLengthText(code: string) {
    const n = code ? Buffer.byteLength(code, 'utf8') : 0;
    if (n < 1024) return `${n}B`;
    return `${(Math.round((n / 1024) * 100) / 100).toFixed(2)}KB`.replace('.00', '');
}

function caseTimeText(ms: number, status: number) {
    const ge = LIMIT_GE.has(status);
    return `${ge ? '≥' : ''}${Math.round(ms || 0)}ms`;
}

function recordPublicId(rid: ObjectId | string) {
    const hex = typeof rid === 'string' ? rid : rid.toString();
    return `R${hex.slice(-9).toUpperCase()}`;
}

function findTestdataFile(pdoc: ProblemDoc, caseId: number) {
    const data = pdoc.data || [];
    const candidates = [`${caseId}.in`, `${caseId}.inp`, `input${caseId}.txt`, `${caseId}.data`];
    for (const name of candidates) {
        const hit = data.find((f) => f.name === name);
        if (hit) return hit.name;
    }
    const prefix = `${caseId}.`;
    return data.find((f) => f.name.startsWith(prefix))?.name;
}

function findTestdataInFile(pdoc: ProblemDoc, caseId: number) {
    const data = pdoc.data || [];
    const candidates = [`${caseId}.in`, `${caseId}.inp`, `input${caseId}.txt`];
    for (const name of candidates) {
        if (data.find((f) => f.name === name)) return name;
    }
    const hit = data.find((f) => f.name === `${caseId}.data`);
    return hit?.name;
}

function findTestdataOutFile(pdoc: ProblemDoc, caseId: number) {
    const data = pdoc.data || [];
    const candidates = [`${caseId}.out`, `${caseId}.ans`, `output${caseId}.txt`, `${caseId}.output`];
    for (const name of candidates) {
        if (data.find((f) => f.name === name)) return name;
    }
    return undefined;
}

export function canViewProblemTestdataFiles(handler: Handler, pdoc?: ProblemDoc | null) {
    return !!pdoc && (
        pdoc.owner === handler.user._id
        || handler.user.hasPriv(PRIV.PRIV_READ_PROBLEM_DATA)
        || handler.user.hasPerm(PERM.PERM_READ_PROBLEM_DATA)
    );
}

function testdataDownloadUrl(handler: Handler, pdoc: ProblemDoc, filename: string) {
    return handler.url('problem_file_download', {
        pid: pdoc.docId,
        filename,
        query: { type: 'testdata', noDisposition: '1' },
    });
}

export type CaseFileUrls = { in?: string; out?: string };

export function buildCaseFileUrlMap(
    handler: Handler,
    pdoc: ProblemDoc | null | undefined,
    rdoc: RecordDoc,
): Record<string, CaseFileUrls> {
    if (!canViewProblemTestdataFiles(handler, pdoc) || !pdoc) return {};
    const map: Record<string, CaseFileUrls> = {};
    for (const tc of rdoc.testCases || []) {
        const caseId = tc.id ?? 0;
        const key = `${tc.subtaskId ?? 0}:${caseId}`;
        const inName = findTestdataInFile(pdoc, caseId);
        const outName = findTestdataOutFile(pdoc, caseId);
        if (!inName && !outName) continue;
        map[key] = {
            in: inName ? testdataDownloadUrl(handler, pdoc, inName) : undefined,
            out: outName ? testdataDownloadUrl(handler, pdoc, outName) : undefined,
        };
    }
    return map;
}

export function buildDtojRecordDetailView(
    handler: Handler,
    payload: {
        rdoc: RecordDoc;
        pdoc?: ProblemDoc | null;
        udoc?: Udoc | null;
    },
) {
    const { rdoc, pdoc, udoc } = payload;
    const langDisplay = SettingModel.langs[rdoc.lang]?.display || rdoc.lang || '—';
    const statusKey = recordStatusLabel(rdoc.status);
    const statusTone = STATUS_CODES[rdoc.status as STATUS] || '';
    const ge = LIMIT_GE.has(rdoc.status);
    const cases = (rdoc.testCases || [])
        .slice()
        .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
        .map((tc, i) => ({
            num: tc.id ?? i + 1,
            label: recordStatusLabel(tc.status),
            tone: STATUS_CODES[tc.status as STATUS] || 'unknown',
            meta: `${caseTimeText(tc.time, tc.status)}/${memoryText(tc.memory || 0)}`,
            message: tc.message || '',
        }));
    const canReadData = canViewProblemTestdataFiles(handler, pdoc);
    const caseFiles = buildCaseFileUrlMap(handler, pdoc, rdoc);
    const downloads: { num: number; url: string }[] = [];
    if (canReadData && pdoc) {
        for (const tc of rdoc.testCases || []) {
            if (tc.status === STATUS.STATUS_ACCEPTED) continue;
            const filename = findTestdataFile(pdoc, tc.id ?? 0);
            if (!filename) continue;
            downloads.push({
                num: tc.id ?? 0,
                url: handler.url('problem_file_download', {
                    pid: pdoc.docId,
                    filename,
                    query: { type: 'testdata' },
                }),
            });
        }
    }
    const showCode = !!(rdoc.code || rdoc.files?.code);
    const codeLang = SettingModel.langs[rdoc.lang]?.highlight || 'cpp';
    return {
        recordPublicId: recordPublicId(rdoc._id),
        statusKey,
        statusTone,
        langDisplay,
        codeLength: rdoc.code ? codeLengthText(rdoc.code) : '—',
        totalTime: rdoc.time ? `${ge ? '≥' : ''}${Math.round(rdoc.time)}ms` : '—',
        totalMemory: rdoc.memory ? memoryText(rdoc.memory) : '—',
        scoreText: typeof rdoc.score === 'number' ? String(rdoc.score) : '—',
        cases,
        caseFiles,
        canViewCaseFiles: canReadData,
        downloads,
        showCode,
        codeLang,
        judging: typeof rdoc.status === 'number' && [STATUS.STATUS_JUDGING, STATUS.STATUS_COMPILING, STATUS.STATUS_FETCHED, STATUS.STATUS_WAITING].includes(rdoc.status),
        progress: typeof rdoc.progress === 'number' ? rdoc.progress : null,
        compilerText: (rdoc.compilerTexts || []).join('\n'),
        judgeText: rdoc.judgeTexts || [],
        udoc,
        pdoc,
        rdoc,
    };
}
