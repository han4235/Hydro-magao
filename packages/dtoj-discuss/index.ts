import {
    Context, DiscussionModel, DiscussionNodeNotFoundError, DocumentModel, PERM,
    Types, UserModel, param,
} from 'hydrooj';
import { DtojDataHandler, dropEarlierRoutes, queryString } from 'dtoj-ui';

class DtojDiscussHandler extends DtojDataHandler {
    @param('page', Types.PositiveInt, true)
    @param('node', Types.String, true)
    async get(domainId: string, page = 1, node = '') {
        const nodes = await DiscussionModel.getNodes(domainId);
        const groups: { category: string, nodes: { id: string }[] }[] = [];
        const grouped = new Map<string, { category: string, nodes: { id: string }[] }>();
        for (const item of nodes) {
            const category = String(item.content || '');
            let group = grouped.get(category);
            if (!group) {
                group = { category, nodes: [] };
                grouped.set(category, group);
                groups.push(group);
            }
            group.nodes.push({ id: String(item.docId) });
        }
        const known = {
            $in: [
                DocumentModel.TYPE_PROBLEM,
                DocumentModel.TYPE_CONTEST,
                DocumentModel.TYPE_DISCUSSION_NODE,
                DocumentModel.TYPE_TRAINING,
            ],
        };
        let query: any = { parentType: known, hidden: false };
        if (node) {
            const vnode = await DiscussionModel.getNode(domainId, node);
            if (!vnode) throw new DiscussionNodeNotFoundError(domainId, node);
            const hidden = this.user.own(vnode) || this.user.hasPerm(PERM.PERM_EDIT_DISCUSSION)
                ? {}
                : { hidden: false };
            query = {
                parentType: DocumentModel.TYPE_DISCUSSION_NODE,
                parentId: vnode.docId,
                ...hidden,
            };
        }
        const [ddocs, dpcount] = await this.paginate(
            DiscussionModel.getMulti(domainId, query).hint('discussionSort'),
            page,
            'discussion',
        );
        const [udict, vndict] = await Promise.all([
            UserModel.getList(domainId, ddocs.map((ddoc) => ddoc.owner)),
            DiscussionModel.getListVnodes(
                domainId, ddocs,
                this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN),
                this.user.group,
            ),
        ]);
        const threads = ddocs.map((ddoc) => {
            const bucket = vndict[ddoc.parentType] || {};
            const key = ddoc.parentId?.toString?.() || ddoc.parentId;
            const vnode = bucket[key] || bucket[ddoc.parentId];
            return {
                id: ddoc._id,
                title: ddoc.title,
                author: udict[ddoc.owner]?.uname || '—',
                time: ddoc.updateAt,
                node: vnode?.title || '—',
                replies: ddoc.nReply || 0,
                views: ddoc.views || 0,
                highlight: !!ddoc.highlight,
            };
        });
        this.view('dtoj_discuss', {
            groups,
            node,
            threads,
            page,
            pages: dpcount,
            qs: queryString({ node }),
        });
    }
}

export async function apply(ctx: Context) {
    ctx.Route('discussion_main', '/discuss', DtojDiscussHandler, PERM.PERM_VIEW_DISCUSSION);
    dropEarlierRoutes(ctx, ['/discuss']);
    for (const lang of ['zh', 'zh_TW', 'en', 'kr']) {
        ctx.i18n.load(lang, { dtoj_discuss: '讨论' });
    }
}
