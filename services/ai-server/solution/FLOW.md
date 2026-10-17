# ai-server 与 md-playwright-solution 流程对照（skill=problem_solution）

搬题姬把「生成题包」拆成 00–12 步落盘校验，这里同样把「生成题解」的 skill 拆成 step 文件随镜像部署，
由 `app/solution_spec.py` 拼成系统提示词，`app/skills/problem_solution.py` 负责取题、调模型、自检。

| 步骤 | skill 原文 | ai-server 执行 |
|------|-----------|----------------|
| 00 | `00-detect-input.md` | 不做：后端固定按 domainId + docId 单题提交 |
| 01 | `01-init.md` | `problems/<pid>_problem.md`：题面直接从 Mongo 读出落盘（`app/hydro_problem.py`） |
| 02 | `02-fetch-problem.md` | 由 `load_problem` + `content_zh` 代替网页抓取，日志 `step02` |
| 03 | `03-statement.md` | 模型写题面段（题目描述 → 数据范围），样例逐字复制 |
| 04 | `04-analysis.md` | 模型写 `## 算法分析`（问题建模 / 算法演进分档 / 状态定义 / 算法步骤） |
| 05 | `05-code.md` | 模型逐档给完整 C++11 程序（暴力参照版 + 版本 k｜档位 k + 满分解） |
| 06 | `06-complexity.md` | 模型写复杂度汇总表、空间复杂度、边界与易错点、总结 |
| 07 | `07-format-check.md` | `problem_solution._issues()` 逐项核对标题层级、版本/档位计数、代码完整性、正文行数 |
| 08 | `08-humanize.md` | 由 preamble 的去 AI 味清单约束（镜像内没有 humanizer-zh skill 文件） |
| 09 | `09-save.md` | 不落盘到技能目录：写 `{题目编号}_{题目名称}.md`，payload 交后端入库为置顶题解 |
| 10 | `10-batch.md` | 不做：一个任务一篇题解 |

材料：`solution/SKILL.md`、`solution/steps/*.md`、`solution/references/solution-spec.md`、`solution/prompts/solution_preamble.md`。
skill 更新后用 `scripts/sync_solution_from_skill.sh` 覆盖，`prompts/` 与 `FLOW.md` 由本仓维护。

校验：`python -m app.solution_spec`；`/health.solution.bundle_ok`；缺材料时创建 `problem_solution` 任务返回 503。

输出契约（后端据此入库）：

```
payload = {
  "domainId", "docId", "pid", "title",
  "content": "<整篇题解 Markdown>",
  "lines", "stages", "chars"
}
```
