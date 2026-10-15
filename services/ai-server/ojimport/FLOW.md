# ai-server 与搬题姬流程对照（单题 kind=single）

| 步骤 | 搬题姬 | ai-server 执行 |
|------|--------|----------------|
| 00 | `00-detect-url.md` | 前端 `source` + 日志 `step00` |
| 01 | `01-init.md` | `init_question_skeleton` 复制 `mkdata.cpp` |
| 02 | `02-get-info.md` | markdownify → `extracted.md`，日志 `step02` |
| 03 | `03-gesp.md` + `gesp/training_materials/` | LLM JSON：`gesp_level`、`tags`、`difficulty_stars` |
| 04 | `04-problem.md` | LLM + 写 `problem_zh.md` |
| 05 | `05-config.md` | 写 `problem.yaml` |
| 06 | `06-std.md` | LLM `std_cpp` → `std.cpp` |
| 07 | `07-testdata.md` + `references/testdata-design.md` | LLM `mkin_h` → `g++ mkdata` 生成 25 组 |
| 08 | `08-package.md` | `hydro_import` zip（`jobs.make_zip`） |

`11-testdata-only.md`：仅「只出数据」模式时走；AI 导题默认走完整 00–08。

理论卷 `kind=theory`：不走上述步骤，模版见 `theory/template/`（来源 `work_GESP5000_五级模拟题客观题`）。

材料：`app/ojimport_spec.REQUIRED_FILES` + `gesp/training_materials/*.md`。PDF 课件部署机可用 `OJIMPORT_COPY_GESP_BINARIES=1` 同步，默认不进 git。

校验：`python -m app.ojimport_spec`；`/health.ok`；缺材料时创建 `pdf_to_problem_packs` 任务返回 503。镜像须装 `g++`（见 Dockerfile）。
