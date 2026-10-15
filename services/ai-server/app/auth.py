import hashlib
import hmac
import os
import time

WINDOW = 300


def secret() -> str:
    return os.environ.get('AI_SERVER_HMAC_SECRET', 'dev-ai-secret')


def sign(ts: str, skill: str, digest: str, kind: str = '') -> str:
    msg = f'{ts}\n{skill}\n{digest}'
    if kind:
        msg = f'{msg}\n{kind}'
    return hmac.new(secret().encode(), msg.encode(), hashlib.sha256).hexdigest()


def check(ts: str, skill: str, digest: str, signature: str, kind: str = '') -> None:
    try:
        when = int(ts)
    except ValueError as e:
        raise PermissionError('时间戳无效') from e
    if abs(time.time() - when) > WINDOW:
        raise PermissionError('请求过期')
    good = sign(ts, skill, digest, kind)
    if not hmac.compare_digest(good, signature or ''):
        raise PermissionError('签名不对')
