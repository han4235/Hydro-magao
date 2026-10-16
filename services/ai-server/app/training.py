"""入库后按标签归入青石训练课程（steps/12-training.md 的落地实现）。

路由：`GESP{n}级理论` → `GESP{n}级理论训练`（章节=认证场次）；
`官方真题` + `GESP{n}级` → `GESP{n}级真题训练`（章节=算法大类）；
其余 → 算法专题课程（课程=算法大类标签）。

章节命名分两套体系：`GESP真题训练` / `理论训练` 的章节是扁平知识点与认证场次，缺则新建；
`算法专题` / `基础入门` 的章节是教材小节名（如 `基础(二) 第九章 动态规划背包问题`），
只按子类标签在既有章节里做字面匹配，匹配不到或匹配到多章（有歧义）就不归类，
避免造出与教材编排不一致的裸话题章节。

容器内走 `HYDRO_MONGO_URI` + pymongo；本机无该变量时回落 `docker exec oj-mongo mongosh`。
路由规则（`plan`）不含任何数据库依赖，本机 `scripts/classify_training.py` 直接复用这一份。
"""
from __future__ import annotations

import json
import os
import re
import subprocess

DOMAIN = 'system'
OWNER = 3
PROBLEM_DOC_TYPE = 10
TRAINING_DOC_TYPE = 40

THEORY_TAG_RE = re.compile(r'^GESP([一二三四五六七八])级理论$')
LEVEL_TAG_RE = re.compile(r'^GESP([一二三四五六七八])级$')
THEORY_TITLE_RE = re.compile(r'^GESP(20\d{2})(\d{2})([一二三四五六七八])级客观题(模拟题)?')
SKIP_TAGS = {'官方真题', '其他'}

# 子类标签 → 大类标签；表外的标签本身即大类
SUBCLASS_MAJOR = {
    '背包': '动态规划', '区间DP': '动态规划', '树形DP': '动态规划', '状压DP': '动态规划',
    '最短路': '图论', '最小生成树': '图论', '拓扑排序': '图论', 'LCA': '图论', '连通性': '图论',
    '并查集': '数据结构', '树状数组': '数据结构', '线段树': '数据结构', '平衡树': '数据结构',
    'ST表': '倍增', 'RMQ': '倍增', '二分': '分治', '差分': '前缀和',
    '质数': '数论', '约数': '数论', '筛法': '数论', '快速幂': '数论', '逆元': '数论',
}

# 新建算法课程时的方向启发；站内已有课程一律沿用其 dtoj.direction
CSP_S_MAJORS = {
    '图论', '数据结构', '线段树', '树状数组', '倍增', '网络流', '分块', '莫队',
    '树链剖分', '主席树', '平衡树',
}

ACTION_LABEL = {'created': '新建课程+章节', 'chapter': '新建章节', 'appended': '追加', 'skip': '已在章节内'}

# 章节是教材小节名的课程类型：只往既有章节里放，不新建
EDU_KINDS = {'算法专题', '基础入门'}


def plan(tags: list[str], title: str) -> list[dict]:
    """标签 → [{course, kind, direction, chapter, major, algo}]。

    一道题最多归一门算法课程（站内现状：非 GESP 课程之间不重复）；
    带 `GESP{n}级` 等级标签的归入对应的 `GESP{n}级真题训练`（章节=算法大类，缺则新建）。
    `chapter` 对教材类课程只是候选话题名，落库前还要在既有章节里解析（见 `resolve_chapter`）。
    """
    theory = next((m for t in tags if (m := THEORY_TAG_RE.match(str(t)))), None)
    level = next((m for t in tags if (m := LEVEL_TAG_RE.match(str(t)))), None)

    if theory:
        course = f'GESP{theory.group(1)}级理论训练'
        chapter = '模拟卷'
        mt = THEORY_TITLE_RE.match(title or '')
        if mt and not mt.group(4):
            chapter = f'{mt.group(1)}年{int(mt.group(2))}月认证'
        return [{'course': course, 'kind': 'GESP理论训练', 'direction': 'GESP',
                 'chapter': chapter, 'major': '', 'algo': []}]

    algo = [str(t) for t in tags if str(t) not in SKIP_TAGS
            and not LEVEL_TAG_RE.match(str(t)) and not THEORY_TAG_RE.match(str(t))]
    if not algo:
        return []
    major = SUBCLASS_MAJOR.get(algo[0], algo[0])
    chapter = next((t for t in algo if SUBCLASS_MAJOR.get(t) == major), major)

    # 等级标签即定课：入库的题若已判为 GESP{n} 级，就归 GESP{n}级真题训练；
    # 不因模型漏标 `官方真题` 而改道去算法课（站内 198 道带等级标签的题里 197 道另带该标签）。
    if level:
        return [{'course': f'GESP{level.group(1)}级真题训练', 'kind': 'GESP真题训练',
                 'direction': 'GESP', 'chapter': major, 'major': major, 'algo': algo}]
    direction = 'CSP-S' if major in CSP_S_MAJORS else 'CSP-J'
    return [{'course': major, 'kind': '算法专题', 'direction': direction,
             'chapter': chapter, 'major': major, 'algo': algo}]


def resolve_chapter(chapters: list[str], target: dict) -> tuple[str | None, str]:
    """教材类课程：按子类标签优先、大类兜底，在既有章节标题里做字面匹配。

    返回 (章节名, 原因)；章节名为 None 表示不归类，原因供日志与人工接管。
    匹配到多章视为有歧义——教材编排是人工决定的，不猜。
    """
    candidates = [t for t in target['algo'] if SUBCLASS_MAJOR.get(t) == target['major']]
    candidates.append(target['major'])
    ambiguous: list[str] = []
    for tag in dict.fromkeys(candidates):
        hits = [c for c in chapters if tag in c]
        if len(hits) == 1:
            return hits[0], f'按标签「{tag}」匹配到教材章节'
        if len(hits) > 1:
            ambiguous.append(f'「{tag}」命中 {len(hits)} 章（{"、".join(hits)}）')
    if ambiguous:
        return None, '教材章节有歧义，待人工指定：' + '；'.join(ambiguous)
    return None, f'教材章节无匹配（候选标签 {"、".join(dict.fromkeys(candidates))}），待人工放入'


def _mongo_uri() -> str:
    return (os.environ.get('HYDRO_MONGO_URI') or '').strip()


def _mongosh(js: str) -> str:
    out = subprocess.check_output(
        ['docker', 'exec', 'oj-mongo', 'mongosh', 'hydro', '--quiet', '--eval', js],
        text=True,
        stderr=subprocess.STDOUT,
    )
    return out.strip()


def load_problems(pids: list[str], doc_ids: list[int]) -> dict[str, dict]:
    """按平台题号或 docId 取题目；返回键为命令行给的原样标识。"""
    js = f"""
const or = [];
if ({json.dumps(pids)}.length) or.push({{ pid: {{ $in: {json.dumps(pids)} }} }});
if ({json.dumps(doc_ids)}.length) or.push({{ docId: {{ $in: {json.dumps(doc_ids)} }} }});
const m = {{}};
db.document.find({{ domainId: {json.dumps(DOMAIN)}, docType: {PROBLEM_DOC_TYPE}, $or: or }}).forEach(d => {{
  m['pid:' + d.pid] = {{ key: 'pid:' + d.pid, pid: d.pid || '', docId: d.docId, title: d.title, tag: d.tag || [] }};
  m['doc:' + d.docId] = {{ key: 'doc:' + d.docId, pid: d.pid || '', docId: d.docId, title: d.title, tag: d.tag || [] }};
}});
print(JSON.stringify(m));
"""
    return json.loads(_mongosh(js).splitlines()[-1])


def _load_problems_pymongo(pids: list[str], doc_ids: list[int]) -> dict[str, dict]:
    from pymongo import MongoClient

    query: dict = {'domainId': DOMAIN, 'docType': PROBLEM_DOC_TYPE, '$or': []}
    if pids:
        query['$or'].append({'pid': {'$in': pids}})
    if doc_ids:
        query['$or'].append({'docId': {'$in': doc_ids}})
    out: dict[str, dict] = {}
    client = MongoClient(_mongo_uri(), serverSelectionTimeoutMS=8000)
    try:
        for d in client['hydro']['document'].find(query):
            row = {
                'key': '', 'pid': d.get('pid') or '', 'docId': d.get('docId'),
                'title': d.get('title'), 'tag': list(d.get('tag') or []),
            }
            out[f"pid:{row['pid']}"] = {**row, 'key': f"pid:{row['pid']}"}
            out[f"doc:{row['docId']}"] = {**row, 'key': f"doc:{row['docId']}"}
    finally:
        client.close()
    return out


def read_problems(pids: list[str], doc_ids: list[int]) -> dict[str, dict]:
    return _load_problems_pymongo(pids, doc_ids) if _mongo_uri() else load_problems(pids, doc_ids)


def _course_chapters_mongosh(course: str) -> list[str] | None:
    js = f"""
const t = db.document.findOne({{ domainId: {json.dumps(DOMAIN)}, docType: {TRAINING_DOC_TYPE},
  title: {json.dumps(course, ensure_ascii=False)} }}, {{ dag: 1 }});
print(JSON.stringify(t ? (t.dag || []).map(n => n.title) : null));
"""
    return json.loads(_mongosh(js).splitlines()[-1])


def _course_chapters_pymongo(course: str) -> list[str] | None:
    from pymongo import MongoClient

    client = MongoClient(_mongo_uri(), serverSelectionTimeoutMS=8000)
    try:
        t = client['hydro']['document'].find_one(
            {'domainId': DOMAIN, 'docType': TRAINING_DOC_TYPE, 'title': course},
            {'dag': 1},
        )
        return None if t is None else [n.get('title') for n in (t.get('dag') or [])]
    finally:
        client.close()


def read_course_chapters(course: str) -> list[str] | None:
    """课程既有章节标题；课程不存在返回 None。"""
    if _mongo_uri():
        return _course_chapters_pymongo(course)
    return _course_chapters_mongosh(course)


def _merge_pymongo(doc: dict, course: str, kind: str, direction: str, chapter: str) -> dict:
    from pymongo import MongoClient

    doc_id = doc['docId']
    client = MongoClient(_mongo_uri(), serverSelectionTimeoutMS=8000)
    try:
        coll = client['hydro']['document']
        t = coll.find_one({'domainId': DOMAIN, 'docType': TRAINING_DOC_TYPE, 'title': course})
        # 课程不存在 → 新建
        if t is None:
            from bson import ObjectId

            tdoc_id = ObjectId()
            coll.insert_one({
                '_id': tdoc_id,
                'content': f'题库自动归档 · {course}',
                'owner': OWNER, 'domainId': DOMAIN, 'docType': TRAINING_DOC_TYPE, 'docId': tdoc_id,
                'dag': [{'_id': 1, 'title': chapter, 'requireNids': [], 'pids': [doc_id]}],
                'title': course, 'description': f'{course} 训练（按题目标签自动建立）',
                'attend': 0, 'pin': 0,
                'dtoj': {'direction': direction, 'kind': kind, 'notes': {}},
            })
            domain = client['hydro']['domain'].find_one({'_id': DOMAIN}) or {}
            saved = domain.get('dtojTraining') or {}
            order = list(saved.get('order') or [])
            if str(tdoc_id) not in order:
                order.append(str(tdoc_id))
            client['hydro']['domain'].update_one(
                {'_id': DOMAIN},
                {'$set': {'dtojTraining': {**saved, 'order': order}}},
            )
            return {'action': 'created', 'nid': 1, 'course': course, 'chapter': chapter}

        # 章节已存在 → 原子追加，未变动即已在章节内
        res = coll.update_one(
            {'_id': t['_id'], 'dag.title': chapter},
            {'$addToSet': {'dag.$.pids': doc_id}},
        )
        if res.matched_count:
            action = 'appended' if res.modified_count else 'skip'
            nid = next(n['_id'] for n in t['dag'] if n['title'] == chapter)
            return {'action': action, 'nid': nid, 'course': course, 'chapter': chapter}

        dag = list(t.get('dag') or [])
        nid = max([int(n.get('_id') or 0) for n in dag] + [0]) + 1
        dag.append({'_id': nid, 'title': chapter, 'requireNids': [], 'pids': [doc_id]})
        coll.update_one({'_id': t['_id']}, {'$set': {'dag': dag}})
        return {'action': 'chapter', 'nid': nid, 'course': course, 'chapter': chapter}
    finally:
        client.close()


def merge_course(doc: dict, course: str, kind: str, direction: str, chapter: str) -> dict:
    """查/建课程与章节，追加 docId，返回动作描述。"""
    if _mongo_uri():
        return _merge_pymongo(doc, course, kind, direction, chapter)
    return _merge_mongosh(doc, course, kind, direction, chapter)


def _merge_mongosh(doc: dict, course: str, kind: str, direction: str, chapter: str) -> dict:
    js = f"""
const domainId = {json.dumps(DOMAIN)};
const course = {json.dumps(course, ensure_ascii=False)};
const chapter = {json.dumps(chapter, ensure_ascii=False)};
const docId = {json.dumps(doc['docId'])};
const kind = {json.dumps(kind, ensure_ascii=False)};
const direction = {json.dumps(direction, ensure_ascii=False)};
let t = db.document.findOne({{ domainId, docType: {TRAINING_DOC_TYPE}, title: course }});
let action = 'appended';
let nid = 0;
if (!t) {{
  const tid = new ObjectId();
  db.document.insertOne({{
    content: '题库自动归档 · ' + course,
    owner: {OWNER}, domainId, docType: {TRAINING_DOC_TYPE}, docId: tid,
    dag: [{{ _id: 1, title: chapter, requireNids: [], pids: [docId] }}],
    title: course, description: course + ' 训练（按题目标签自动建立）',
    attend: 0, pin: 0,
    dtoj: {{ direction, kind, notes: {{}} }},
  }});
  const ddoc = db.domain.findOne({{ _id: domainId }}) || {{}};
  const saved = ddoc.dtojTraining || {{}};
  const order = (saved.order || []).slice();
  if (!order.includes(tid.toHexString())) order.push(tid.toHexString());
  db.domain.updateOne({{ _id: domainId }}, {{ $set: {{ dtojTraining: Object.assign({{}}, saved, {{ order }}) }} }});
  print(JSON.stringify({{ action: 'created', nid: 1, course, chapter, docId }}));
}} else {{
  const dag = t.dag || [];
  let node = dag.find(n => n.title === chapter);
  if (!node) {{
    nid = dag.reduce((m, n) => Math.max(m, Number(n._id) || 0), 0) + 1;
    node = {{ _id: nid, title: chapter, requireNids: [], pids: [docId] }};
    dag.push(node);
    action = 'chapter';
  }} else {{
    nid = node._id;
    if (node.pids.map(Number).includes(Number(docId))) action = 'skip';
    else node.pids.push(docId);
  }}
  if (action !== 'skip') db.document.updateOne({{ _id: t._id }}, {{ $set: {{ dag }} }});
  print(JSON.stringify({{ action, nid, course, chapter, docId }}));
}}
"""
    return json.loads(_mongosh(js).splitlines()[-1])


def classify(pids: list[str], doc_ids: list[int] | None = None, dry_run: bool = False) -> list[str]:
    """归类一批题号，返回可读的结果行；未入库的标识跳过。"""
    doc_ids = doc_ids or []
    keys = [f'pid:{p}' for p in pids] + [f'doc:{d}' for d in doc_ids]
    problems = read_problems(pids, doc_ids)
    cache: dict[str, list[str] | None] = {}
    lines: list[str] = []

    def chapters_of(course: str) -> list[str] | None:
        if course not in cache:
            cache[course] = read_course_chapters(course)
        return cache[course]

    for key in keys:
        doc = problems.get(key)
        if not doc:
            lines.append(f'{key} 未入库，已跳过')
            continue
        targets = plan([str(t) for t in doc['tag']], str(doc['title'] or ''))
        if not targets:
            lines.append(f'{key} 无可用算法标签，未归类')
            continue
        for target in targets:
            course = target['course']
            if target['kind'] in EDU_KINDS:
                chapters = chapters_of(course)
                if chapters is None:
                    lines.append(f'{key} ⊘ 未归类：教材类课程「{course}」不存在，不自动新建')
                    continue
                chapter, reason = resolve_chapter(chapters, target)
                if chapter is None:
                    lines.append(f'{key} ⊘ 未归类：{reason}')
                    continue
                if dry_run:
                    lines.append(f"[dry-run] {key} → {course} / {chapter}（{reason}）")
                    continue
                r = merge_course(doc, course, target['kind'], target['direction'], chapter)
                lines.append(f"{key} → {r['course']} / {r['chapter']}｜{ACTION_LABEL[r['action']]}")
                continue
            if dry_run:
                lines.append(f"[dry-run] {key} → {course} / {target['chapter']}"
                             f"（{target['kind']} / {target['direction']}）")
                continue
            r = merge_course(doc, course, target['kind'], target['direction'], target['chapter'])
            lines.append(f"{key} → {r['course']} / {r['chapter']}｜{ACTION_LABEL[r['action']]}")
    return lines


def _main() -> int:
    import argparse
    import sys

    ap = argparse.ArgumentParser(description='题目入库后按标签归入训练课程')
    ap.add_argument('--pid', action='append', default=[], help='平台题号，可重复（如 aip3f2a1b）')
    ap.add_argument('--doc-id', action='append', type=int, default=[], help='题目 docId，可重复')
    ap.add_argument('--dry-run', action='store_true', help='只打印归类结果，不写库')
    args = ap.parse_args()
    if not args.pid and not args.doc_id:
        ap.error('至少给一个 --pid 或 --doc-id')
    for line in classify(args.pid, args.doc_id, args.dry_run):
        print(line, file=sys.stderr if '未归类' in line else sys.stdout)
    return 0


if __name__ == '__main__':
    raise SystemExit(_main())
