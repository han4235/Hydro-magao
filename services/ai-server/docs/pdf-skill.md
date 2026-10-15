# 材料转题包

创建任务时 `kind` 必填：`single`（单题）或 `theory`（理论试卷）。

## 输入（三选一）

| source | 表单字段 | 说明 |
|--------|----------|------|
| file | `file` | PDF、Word（doc/docx）、txt/md，最大 32MB |
| url | `url`、可选 `fetch_cookie` | http(s) 网页；Cookie 仅当次任务，不落任务 JSON |
| text | `text` | 纯文本粘贴，最大 512KB |

HMAC 摘要：文件为文件内容的 SHA256；链接与文本为对应 UTF-8 字符串的 SHA256。

## markdownify

与 Cursor **markdownify** MCP 相同引擎（markitdown）。实现见 `app/markdownify.py`：

- `file_to_markdown`：本地文件
- `url_to_markdown`：先 `urllib` 抓 HTML 再 markitdown（避免洛谷等对 markitdown 直连返回 418）
- `text_to_markdown`：写入临时 txt 再转换

可选环境变量（`oj-ai` / `phase_b_local.env` → `oj-ai.runtime.env`，**勿把 Cookie 提交 git**）：

| 变量 | 作用 |
|------|------|
| `FETCH_TIMEOUT` | 抓取超时秒数，默认 60 |
| `FETCH_USER_AGENT` | 自定义 UA（乱设可能导致洛谷 302 环） |
| `FETCH_COOKIE` | 任意站点请求附带 `Cookie` 头 |
| `FETCH_COOKIE_LUOGU` | 仅 `*luogu*` 域名，优先于 `FETCH_COOKIE` |

中间文件：`extracted.md`、`llm_response.txt`。

## 题包与搬题姬

Skill 名仍为 `pdf_to_problem_packs`（兼容旧配置）。

- **kind=single**：`ojimport/` 含 steps/00–11、gesp 课件、`question` 模板；LLM 一次输出题面+标程+`mkin.h`，再本地跑 step07（`g++ mkdata`）与 step08 导入。见 `FLOW.md`。
- **kind=theory**：`ojimport/theory/`（`FORMAT.md`、`template/`、`example_*`）+ `theory_llm_system()`。
- 部署校验：`python -m app.ojimport_spec` 或 `/health` 的 `ojimport.bundle_ok`。
