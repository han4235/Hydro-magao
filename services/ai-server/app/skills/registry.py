from app.skills.mock_pack import MockPackSkill
from app.skills.stubs import DocToPacks, PdfToPacks, UrlToPacks

SKILLS = {
    s.name: s()
    for s in (MockPackSkill, PdfToPacks, UrlToPacks, DocToPacks)
}


def get_skill(name: str):
    skill = SKILLS.get(name)
    if not skill:
        raise KeyError(name)
    return skill
