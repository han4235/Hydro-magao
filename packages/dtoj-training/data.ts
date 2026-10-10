export const directions = ['CSP-X', 'CSP-J', 'CSP-S', 'NOIP', '省选', 'NOI', 'GESP', '其他'];
export const courseKinds = ['基础入门', '算法专题', '真题训练', '集训', '日常'];
export const missingNote = '讲义待补充';

// 键是训练 id。表外的训练不写方向、不写类型，章节用「讲义待补充」。
export const courseTable: Record<string, { direction: string, kind: string, notes: Record<number, string> }> = {
    a10000000000000000000001: {
        direction: 'CSP-J',
        kind: '基础入门',
        notes: {
            1: '先写清输入有几个数、输出要什么。拿最小的一组数在纸上算一遍，再写代码。',
            2: '循环从哪开始、到哪结束，先标在旁边。起点和终点各拿一个例子试一次。',
        },
    },
    a10000000000000000000002: {
        direction: 'CSP-S',
        kind: '算法专题',
        notes: {
            1: '用一句话写下这一步必须记住的信息。记不住的内容不要放进状态。',
            2: '转移只写从哪来、代价是多少。先保证答案对，再想能不能少算几次。',
        },
    },
    a10000000000000000000003: {
        direction: 'NOIP',
        kind: '真题训练',
        notes: {
            1: '先做自己会的那一题。样例和自己编的一组数据都对上，再换下一题。',
        },
    },
    a10000000000000000000004: {
        direction: 'GESP',
        kind: '集训',
        notes: {
            1: '这一节只练一个新知识点。写完后用自己的话讲一遍，讲不清就回到定义。',
        },
    },
    a10000000000000000000005: {
        direction: '省选',
        kind: '日常',
        notes: {
            1: '今天只改一处：读题、边界或复杂度。改完记下改的是哪一处。',
        },
    },
};

export function courseMark(id: string) {
    const row = courseTable[id];
    if (!row) return { direction: '', kind: '' };
    return {
        direction: directions.includes(row.direction) ? row.direction : '',
        kind: courseKinds.includes(row.kind) ? row.kind : '',
    };
}

type MarkDoc = { docId: { toHexString(): string }, dtoj?: { direction?: string, kind?: string, notes?: Record<string, string> } };

export function markOf(tdoc: MarkDoc) {
    if (tdoc.dtoj) {
        const direction = tdoc.dtoj.direction || '';
        const kind = tdoc.dtoj.kind || '';
        return {
            direction: directions.includes(direction) ? direction : '',
            kind: courseKinds.includes(kind) ? kind : '',
        };
    }
    return courseMark(tdoc.docId.toHexString());
}

export function listed(tdoc: MarkDoc, direction: string, kind: string) {
    const mark = markOf(tdoc);
    let byDirection = true;
    if (direction === '其他') byDirection = !mark.direction || mark.direction === '其他';
    else if (direction) byDirection = mark.direction === direction;
    const byKind = kind ? mark.kind === kind : true;
    return byDirection && byKind;
}

export function chapterNote(id: string, index: number) {
    const text = courseTable[id]?.notes?.[index];
    if (typeof text === 'string' && text.trim()) return text.trim();
    return missingNote;
}

export function noteOf(tdoc: MarkDoc, nodeId: number, index: number) {
    if (tdoc.dtoj) {
        const notes = tdoc.dtoj.notes || {};
        const text = notes[String(nodeId)];
        if (typeof text === 'string' && text.trim()) return text.trim();
        return missingNote;
    }
    return chapterNote(tdoc.docId.toHexString(), index);
}
