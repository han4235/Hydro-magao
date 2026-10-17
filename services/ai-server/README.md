# ai-server

评测机上的任务服务。青石后端把文件转发过来，这里按 skill 生成题包，再调用 Hydro 的 `/problem/import/hydro`。

## 本地

```bash
cd services/ai-server
pip install -r requirements.txt   # 或 python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
python3 scripts/phase_b_autofill_env.py   # 自动填 LLM_API_KEY；HYDRO sid 导入时自动签发
./scripts/phase_b_restart.sh
```

`GET /health` 须 `ok: true` 且 `ojimport.bundle_ok: true`。`HYDRO_BASE_URL` 默认本机即可；`HYDRO_IMPORT_TOKEN` 可留空（`HYDRO_AUTO_SID=1` 时走 oj-mongo 短时票据，同 upload-hydro-problems）。

### 阶段 B 冒烟（理论卷，curl）

```bash
cd services/ai-server
./scripts/phase_b_restart.sh
python3 scripts/phase_b_submit_theory.py
```

浏览器：`http://127.0.0.1/ai/jobs`（需 dtoj-ai 已部署、账号有建题权限）。容器内 `AI_SERVER_URL=http://host.docker.internal:8090`。

## 评测机

用评测机那套 `DOCKER_HOST`，单独起容器 `ai-server`，不要动 `oj-judge`。环境变量：

- `AI_SERVER_HMAC_SECRET`：与云主机 `oj-backend` 相同
- `HYDRO_BASE_URL`：青石对外地址
- `HYDRO_IMPORT_TOKEN`：有创建题目权限的短期或专用 sid
- `JOB_DATA_DIR=/data/jobs`
- `LLM_BASE_URL`：one-api 的 OpenAI 兼容地址，容器网络里是 `http://one-api:3000/v1`
- `LLM_API_KEY`：one-api 颁发的令牌，不是厂商密钥
- `LLM_MODEL`：one-api 渠道里登记的模型名

## 材料与 markdownify

教师可上传 **PDF/Word/文本文件**、提交 **网页链接** 或 **纯文本**。一律经 **markdownify（markitdown）** 转成 Markdown（`app/markdownify.py`），再交给模型整理题包。接口字段 `source` 为 `file` / `url` / `text`，详见 `docs/pdf-skill.md`。

搬题姬步骤与模板在 `ojimport/`（随 Docker 镜像部署）。发版前执行 `python -m app.ojimport_spec`；线上 `/health` 须 `ojimport.bundle_ok` 为 true。

## 题解生成（skill=problem_solution）

题目详情页的「AI 生成题解」走这条线，流程取自 `md-playwright-solution`（NOI 金牌教练题解规范），
材料在 `solution/`（随镜像部署）：`SKILL.md`、`steps/*.md`、`references/solution-spec.md`，
另外 `solution/prompts/solution_preamble.md` 说明本服务与 skill 原文的差异（不抓网页、不落盘、直接输出 Markdown）。

- 入口：`POST /internal/jobs`，`skill=problem_solution`、`kind=solution`、`domain_id` + `doc_id`
- 产出：`payload.content` 是整篇题解 Markdown，后端写为置顶题解
- 自检：`app/skills/problem_solution.py` 的 `issues_of()` 按 step 07 核对标题层级、版本/档位对齐、代码完整性、正文行数；
  不过关就把问题回抛给模型补齐，最多 3 轮，**不降级输出**
- skill 更新：`scripts/sync_solution_from_skill.sh` 覆盖 `solution/SKILL.md`、`steps/`、`references/`
- 发版前执行 `python -m app.solution_spec`；`/health.solution.bundle_ok` 须为 true，缺材料时创建任务返回 503

## 模型

ai-server 不直连厂商。Skill 需要模型时调用 `ctx.llm.chat()`，请求发到旁边的 `one-api` 容器。厂商密钥只配在 one-api 的渠道里。

`one-api` 只监听评测机本机 `127.0.0.1:3000`。管理页用 SSH 隧道打开，在渠道页填入真正的模型密钥。还没加渠道时，`/health` 里 `llm.model` 为空，聊天会报未配置模型。
