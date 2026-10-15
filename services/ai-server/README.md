# ai-server

评测机上的任务服务。青石后端把文件转发过来，这里按 skill 生成题包，再调用 Hydro 的 `/problem/import/hydro`。

## 本地

```bash
cd services/ai-server
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
AI_SERVER_HMAC_SECRET=dev-ai-secret uvicorn app.main:app --port 8090
```

`GET /health` 应返回技能列表。未设置 `HYDRO_BASE_URL` 和 `HYDRO_IMPORT_TOKEN` 时，任务只生成题包，不上传。

## 评测机（阶段 D，尚未执行）

用评测机那套 `DOCKER_HOST`，单独起容器 `ai-server`，不要动 `oj-judge`。环境变量：

- `AI_SERVER_HMAC_SECRET`：与云主机 `oj-backend` 相同
- `HYDRO_BASE_URL`：青石对外地址
- `HYDRO_IMPORT_TOKEN`：有创建题目权限的短期或专用 sid
- `JOB_DATA_DIR=/data/jobs`
