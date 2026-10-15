"""阶段 A：不调模型，生成一道固定练习题，用来打通导入。"""
import secrets
from pathlib import Path

from app.skills.base import Skill, SkillContext, SkillResult


class MockPackSkill(Skill):
    name = 'mock_pack'
    accepts = ['application/pdf', 'application/octet-stream', 'text/plain', '']

    async def run(self, ctx: SkillContext, input_path: Path) -> SkillResult:
        pid = 'aim' + secrets.token_hex(3)
        work = ctx.work_root / f'work_{pid}_mock'
        td = work / 'testdata'
        td.mkdir(parents=True)
        (work / 'problem.yaml').write_text(
            f'pid: {pid}\ntitle: AI 连通测试\ntag:\n  - 枚举\n',
            encoding='utf-8',
        )
        (work / 'problem_zh.md').write_text(
            '# AI 连通测试\n\n'
            '读入两个整数，输出它们的和。\n\n'
            '## 输入格式\n\n一行两个整数。\n\n'
            '## 输出格式\n\n一个整数。\n\n'
            '## 样例\n\n```input1\n1 2\n```\n\n```output1\n3\n```\n',
            encoding='utf-8',
        )
        (td / '1.in').write_text('1 2\n', encoding='utf-8')
        (td / '1.out').write_text('3\n', encoding='utf-8')
        (td / 'config.yaml').write_text('time: 1s\nmemory: 128m\n', encoding='utf-8')
        return SkillResult(
            work_dirs=[work],
            logs=[f'已生成 {work.name}，输入文件 {input_path.name}'],
        )
