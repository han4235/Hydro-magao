"""通过 one-api 的 OpenAI 兼容接口调用模型。密钥只留在 one-api 渠道里。"""
import json
import os
import urllib.error
import urllib.request


class LlmClient:
    def __init__(self):
        self.base = os.environ.get('LLM_BASE_URL', 'http://one-api:3000/v1').rstrip('/')
        self.key = os.environ.get('LLM_API_KEY', '')
        self.model = os.environ.get('LLM_MODEL', '')

    def configured(self) -> bool:
        return bool(self.key)

    def status(self) -> dict:
        return {
            'configured': self.configured(),
            'reachable': self.reachable(),
            'model': self.model,
        }

    def reachable(self) -> bool:
        if 'api.deepseek.com' in self.base:
            return self.configured()
        origin = self.base
        if origin.endswith('/v1'):
            origin = origin[:-3]
        req = urllib.request.Request(origin + '/api/status', method='GET')
        try:
            with urllib.request.urlopen(req, timeout=3) as resp:
                return 200 <= resp.status < 300
        except Exception:
            return False

    def chat(self, messages: list[dict], model: str | None = None) -> str:
        use = model or self.model
        if not self.key:
            raise RuntimeError('未配置 LLM_API_KEY')
        if not use:
            raise RuntimeError('未配置 LLM_MODEL，先在 one-api 里添加渠道')
        body = json.dumps({
            'model': use,
            'messages': messages,
            'temperature': 0,
        }).encode()
        req = urllib.request.Request(
            self.base + '/chat/completions',
            data=body,
            method='POST',
            headers={
                'Authorization': 'Bearer ' + self.key,
                'Content-Type': 'application/json',
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                payload = json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            detail = e.read().decode('utf-8', 'replace')[:300]
            raise RuntimeError(f'one-api HTTP {e.code}: {detail}') from e
        except urllib.error.URLError as e:
            raise RuntimeError(f'连不上 one-api: {e.reason}') from e
        try:
            return payload['choices'][0]['message']['content']
        except (KeyError, IndexError, TypeError) as e:
            raise RuntimeError('one-api 返回里没有文本') from e
