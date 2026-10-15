"""生成目标。空值不能进队列，也不能转给模型。"""

KINDS = {
    'single': '单题',
    'theory': '理论试卷',
}


def require_kind(value: str) -> str:
    kind = (value or '').strip()
    if kind not in KINDS:
        raise ValueError('请求不合理：必须标明生成单题还是理论试卷')
    return kind
