"""Skill 契约。具体提示词与解析在单独文档里设计。"""
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class SkillContext:
    job_id: str
    work_root: Path
    options: dict


@dataclass
class SkillResult:
    work_dirs: list[Path] = field(default_factory=list)
    logs: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


class Skill:
    name = ''
    accepts: list[str] = []

    def validate(self, filename: str, content_type: str) -> None:
        return None

    async def run(self, ctx: SkillContext, input_path: Path) -> SkillResult:
        raise NotImplementedError
