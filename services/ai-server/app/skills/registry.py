from app.skills.mock_pack import MockPackSkill
from app.skills.pdf_to_packs import PdfToPacks

SKILLS = {
    s.name: s()
    for s in (MockPackSkill, PdfToPacks)
}


def get_skill(name: str):
    skill = SKILLS.get(name)
    if not skill:
        raise KeyError(name)
    return skill
