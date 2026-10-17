from app.skills.mock_pack import MockPackSkill
from app.skills.pdf_to_packs import PdfToPacks
from app.skills.problem_sample_regen import ProblemSampleRegenSkill
from app.skills.problem_solution import ProblemSolutionSkill

SKILLS = {
    s.name: s()
    for s in (MockPackSkill, PdfToPacks, ProblemSampleRegenSkill, ProblemSolutionSkill)
}



def get_skill(name: str):
    skill = SKILLS.get(name)
    if not skill:
        raise KeyError(name)
    return skill
