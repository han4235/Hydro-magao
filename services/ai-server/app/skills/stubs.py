"""后续 Skill 占位，接口与 mock 相同，尚未实现解析。"""
from pathlib import Path

from app.skills.base import Skill, SkillContext, SkillResult


class _Soon(Skill):
    hint = ''

    async def run(self, ctx: SkillContext, input_path: Path) -> SkillResult:
        return SkillResult(errors=[f'{self.name} 尚未实现。见 docs/pdf-skill.md'])


class UrlToPacks(_Soon):
    name = 'url_to_problem_packs'
    accepts = ['text/plain']


class DocToPacks(_Soon):
    name = 'doc_to_problem_packs'
    accepts = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
    ]
