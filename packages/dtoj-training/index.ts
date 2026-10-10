import { escapeRegExp } from 'lodash';
import {
    Context, ObjectId, PERM, TrainingModel, Types, param,
} from 'hydrooj';
import { DtojDataHandler, dropEarlierRoutes, pick, queryOf, queryString } from 'dtoj-ui';
import { chapterNote, courseKinds, courseMark, directions, listed } from './data';

function courseOf(tdoc: any) {
    const dag = tdoc.dag || [];
    const id = tdoc.docId.toHexString();
    const mark = courseMark(id);
    return {
        id,
        title: tdoc.title,
        brief: tdoc.content || '',
        chapters: dag.length,
        problems: TrainingModel.getPids(dag).length,
        direction: mark.direction,
        kind: mark.kind,
    };
}

class DtojTrainingHandler extends DtojDataHandler {
    @param('page', Types.PositiveInt, true)
    @param('q', Types.String, true)
    async get(domainId: string, page = 1, q = '') {
        const direction = pick(queryOf(this, 'direction'), directions, '');
        const kind = pick(queryOf(this, 'kind'), courseKinds, '');
        const query: any = {};
        if (q) query.title = { $regex: new RegExp(escapeRegExp(q), 'i') };
        await this.ctx.parallel('training/list', query, this);
        const hotDocs = await TrainingModel.getMulti(domainId, { ...query, pin: { $gt: 0 } }).toArray();
        const matched = (await TrainingModel.getMulti(domainId, { ...query, pin: { $not: { $gt: 0 } } }).toArray())
            .filter((tdoc) => listed(tdoc.docId.toHexString(), direction, kind));
        const pageSize = Number(this.ctx.setting.get('pagination.training')) || 20;
        const pages = matched.length ? Math.floor((matched.length + pageSize - 1) / pageSize) : 0;
        const tdocs = matched.slice((page - 1) * pageSize, page * pageSize);
        this.view('dtoj_training', {
            directions,
            kinds: courseKinds,
            direction,
            kind,
            q,
            hot: hotDocs.map(courseOf),
            courses: tdocs.map(courseOf),
            page,
            pages,
            qs: queryString({ q, direction, kind }),
        });
    }
}

class DtojTrainingDetailHandler extends DtojDataHandler {
    @param('tid', Types.ObjectId)
    async get(domainId: string, tid: ObjectId) {
        const tdoc = await TrainingModel.get(domainId, tid);
        const dag = tdoc.dag || [];
        const id = tdoc.docId.toHexString();
        this.view('dtoj_training_detail', {
            course: courseOf(tdoc),
            chapters: dag.map((node, index) => ({
                index: index + 1,
                title: node.title,
                pids: node.pids || [],
                note: chapterNote(id, index + 1),
            })),
        });
    }
}

const titles = {
    dtoj_training: '训练',
    dtoj_training_detail: '课程章节',
};

export async function apply(ctx: Context) {
    ctx.Route('training_main', '/training', DtojTrainingHandler, PERM.PERM_VIEW_TRAINING);
    ctx.Route('dtoj_training_detail', '/training/:tid', DtojTrainingDetailHandler, PERM.PERM_VIEW_TRAINING);
    dropEarlierRoutes(ctx, ['/training', '/training/:tid']);
    for (const lang of ['zh', 'zh_TW', 'en', 'kr']) {
        ctx.i18n.load(lang, titles);
    }
}
