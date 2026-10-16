# ai-server 与搬题姬流程对照（单题 kind=single）

| 步骤 | 搬题姬 | ai-server 执行 |
|------|--------|----------------|
| 00 | `00-detect-url.md` | 前端 `source` + 日志 `step00` |
| 01 | `01-init.md` | `init_question_skeleton` 复制 `mkdata.cpp` |
| 02 | `02-get-info.md` | markdownify → `extracted.md`，日志 `step02` |
| 03 | `03-gesp.md` + `gesp/training_materials/` | LLM JSON：`gesp_level`、`tags`、`difficulty`（0~7 OJ 难度） |
| 04 | `04-problem.md` | LLM + 写 `problem_zh.md` |
| 05 | `05-config.md` | 写 `problem.yaml`；`testdata/config.yaml` 按 `subtasks`（题面测试点优先，否则默认分组） |
| 06 | `06-std.md` | LLM `std_cpp` → `std.cpp` |
| 07 | `07-testdata.md` + `references/testdata-design.md` | LLM `mkin_h` → `g++ mkdata` 生成 `total_cases` 组（题面给了测试点数就按其数，否则 25） |
| 08 | `08-package.md` | `hydro_import` zip（`jobs.make_zip`） |
| 12 | `12-training.md` | 导入成功后自动归类（`app/training.py`，容器内需 `HYDRO_MONGO_URI`）；本机补跑用 `scripts/classify_training.py` |

`11-testdata-only.md`：仅「只出数据」模式时走；AI 导题默认走完整 00–08。

`12-training.md`：题包入库**之后**的收尾步骤——按标签把题目归入课程（`docType 40`），缺课程/章节则新建。ai-server 自动导入成功后会顺带执行（`app.training.classify`，日志 `step12`）；归类失败只写 `job['errors']`，不改任务状态——题已经入库，不该因为收尾步骤报失败。路由规则与写库都落在 `app/training.py`，本机脚本 `scripts/classify_training.py` 只是它的入口（容器外没有 `HYDRO_MONGO_URI`，自动回落 `docker exec oj-mongo mongosh`）。

理论卷 `kind=theory`：不走上述步骤，模版见 `theory/template/`（来源 `work_GESP5000_五级模拟题客观题`）。

材料：`app/ojimport_spec.REQUIRED_FILES` + `gesp/training_materials/*.md`。PDF 课件部署机可用 `OJIMPORT_COPY_GESP_BINARIES=1` 同步，默认不进 git。

校验：`python -m app.ojimport_spec`；`/health.ok`；缺材料时创建 `pdf_to_problem_packs` 任务返回 503。镜像须装 `g++`（见 Dockerfile）。
