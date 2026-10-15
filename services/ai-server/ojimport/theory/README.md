# 理论卷（kind=theory）

整份试卷导入为 **一道客观题**，评测读 `testdata/config.yaml`，题面用 `{{ select(n) }}` 交互。

## 标准模版

B 区来源与同步方式见 **`SOURCE.md`**。仓库内副本：

| 路径 | 说明 |
|------|------|
| `template/` | **当前标准**：`problem.yaml`、`problem_zh.md`、`testdata/config.yaml`（GESP202506 一级客观题样卷结构） |
| `FORMAT.md` | 字段与排版约定（生成与人工校对必读） |
| `example_*` | 与 `template/` 同内容的别名；改模版后请一并覆盖，避免脚本仍读旧 `example_*` |

## ai-server 用法

- Skill：`pdf_to_problem_packs`，`kind=theory`。
- 系统提示词：`theory_llm_system()` = `prompts/theory_preamble.md` + **`FORMAT.md`** + **`template/*` 全文**（经 `ojimport_spec.theory_llm_system()` 拼接）。
- 落盘逻辑见 `app/skills/pdf_to_packs.py` 中 `_theory_pack`；输出 `work_<pid>_theory/` 三件套后打包导入。

## 与单题路径的区别

不走 steps 06–07 标程与 25 组数据；无 `std.cpp` / `mkin.h`。材料经 markdownify 后由模型按 JSON 抽题，再按 `FORMAT.md` 写入题面与 `config.yaml`。
