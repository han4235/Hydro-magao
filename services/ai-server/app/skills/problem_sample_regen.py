"""按搬题姬 Step 11→06→07：读题面 → 模型出 std/mkin → mkdata 生成 25 组 testdata。"""
import asyncio
import json
from pathlib import Path

from app.hydro_problem import content_zh, load_problem, replace_sample_blocks
from app.ojimport_spec import regen_data_llm_system, spec_version
from app.skills.base import Skill, SkillContext, SkillResult
from app.skills.pdf_to_packs import _load_json
from app.testdata_run import finalize_mkin_h, init_question_skeleton, run_testdata_pipeline


def _nl(s: str) -> str:
    return (s or '').replace('\r\n', '\n')


def _item_from_data(data: dict) -> dict:
    if 'std_cpp' in data and 'mkin_h' in data:
        return data
    problems = data.get('problems')
    if isinstance(problems, list) and problems and isinstance(problems[0], dict):
        return problems[0]
    raise ValueError('JSON 缺少 std_cpp / mkin_h')


def _samples_from_item(item: dict) -> list[tuple[str, str]]:
    samples = item.get('samples')
    if not isinstance(samples, list):
        return []
    out: list[tuple[str, str]] = []
    for sample in samples[:3]:
        if not isinstance(sample, dict):
            continue
        inp = _nl(str(sample.get('input') or ''))
        ans = _nl(str(sample.get('output') or ''))
        if inp.strip() and ans.strip():
            out.append((inp, ans))
    return out


def _read_testdata_payload(work: Path) -> dict[str, str]:
    td = work / 'testdata'
    files: dict[str, str] = {}
    if not td.is_dir():
        return files
    for f in sorted(td.iterdir()):
        if not f.is_file():
            continue
        try:
            files[f.name] = f.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            files[f.name] = f.read_bytes().decode('utf-8', errors='replace')
    return files


class ProblemSampleRegenSkill(Skill):
    name = 'problem_sample_regen'
    accepts = ['text/plain', 'application/octet-stream', '']

    async def run(self, ctx: SkillContext, input_path: Path) -> SkillResult:
        logs: list[str] = []
        domain_id = str(ctx.options.get('domain_id') or '').strip()
        doc_id = int(ctx.options.get('doc_id') or 0)
        if not domain_id or not doc_id:
            return SkillResult(errors=['缺少 domain_id 或 doc_id'])

        pdoc = load_problem(domain_id, doc_id)
        title = str(pdoc.get('title') or f'#{doc_id}')
        zh = content_zh(pdoc)
        if not zh.strip():
            return SkillResult(errors=['题面为空，无法再生数据'])

        work = ctx.work_root / f'work_regen_{doc_id}'
        work.mkdir(parents=True, exist_ok=True)
        (work / 'problem_zh.md').write_text(zh, encoding='utf-8')
        logs.append(f'step11: 已载入题目 {domain_id}/{doc_id}《{title}》')
        logs.append(f'规范 ojimport {spec_version()}')

        llm = ctx.llm
        if not llm or not llm.configured():
            return SkillResult(errors=['未配置 LLM，无法按搬题姬流程生成数据'])

        logs.append('step11→06→07: 调用模型生成 std.cpp 与 mkin.h（见 prompts/regen_data_preamble.md）')
        system = regen_data_llm_system()
        try:
            raw = await asyncio.to_thread(llm.chat, [
                {'role': 'system', 'content': system},
                {'role': 'user', 'content': zh[:60000]},
            ])
        except Exception as e:
            return SkillResult(errors=[f'模型调用失败: {e}'], logs=logs)

        (work / 'llm_response.txt').write_text(raw, encoding='utf-8')
        logs.append('step06/07: 已保存 llm_response.txt')

        try:
            data = _load_json(raw)
            item = _item_from_data(data)
        except ValueError as e:
            return SkillResult(errors=[str(e)], logs=logs)

        std_cpp = str(item.get('std_cpp') or '').strip()
        mkin_h = str(item.get('mkin_h') or '').strip()
        if not std_cpp:
            return SkillResult(errors=['缺少 std_cpp（step06）'], logs=logs)
        if not mkin_h or 'void test(' not in mkin_h:
            return SkillResult(errors=['缺少完整 mkin.h test()（step07）'], logs=logs)

        init_question_skeleton(work, logs)
        (work / 'std.cpp').write_text(std_cpp if std_cpp.endswith('\n') else std_cpp + '\n', encoding='utf-8')
        logs.append('step06: 已写 std.cpp')
        (work / 'mkin.h').write_text(finalize_mkin_h(mkin_h), encoding='utf-8')
        logs.append('step07: 已写 mkin.h（已并入 question 模板头）')

        try:
            run_testdata_pipeline(work, logs)
        except (RuntimeError, ValueError) as e:
            return SkillResult(errors=[str(e)], logs=logs)

        pairs = _samples_from_item(item)
        if not pairs and (work / 'testdata' / '1.in').is_file():
            inp = (work / 'testdata' / '1.in').read_text(encoding='utf-8')
            out = (work / 'testdata' / '1.out').read_text(encoding='utf-8')
            pairs = [(inp, out)]
            if (work / 'testdata' / '2.in').is_file():
                pairs.append((
                    (work / 'testdata' / '2.in').read_text(encoding='utf-8'),
                    (work / 'testdata' / '2.out').read_text(encoding='utf-8'),
                ))
        new_zh = replace_sample_blocks(zh, pairs) if pairs else zh

        testdata_files = _read_testdata_payload(work)
        if len([k for k in testdata_files if k.endswith('.in')]) < 25:
            return SkillResult(errors=['testdata 未生成满 25 组'], logs=logs)

        logs.append('step08: 25 组 testdata 就绪，待青石写入本题')
        payload = {
            'domainId': domain_id,
            'docId': doc_id,
            'title': title,
            'contentZh': new_zh,
            'samples': [{'input': a, 'output': b} for a, b in pairs],
            'testdataFiles': testdata_files,
        }
        return SkillResult(logs=logs, payload=payload, work_dirs=[work])
