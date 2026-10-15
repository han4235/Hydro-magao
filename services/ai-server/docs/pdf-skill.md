# PDF 转题包 Skill（待单独实现）

`pdf_to_problem_packs` 已在 registry 里占位，`run` 目前直接返回「尚未实现」。

## 输入

- 教师上传的 PDF，单文件不超过 32MB。
- 可选参数：`preferred_prefix`、是否隐藏题目。阶段 A 的接口还没传这些字段。

## 输出

每个题目一个目录 `work_<pid>_<简称>/`：

- `problem.yaml`：`pid`、`title`、`tag`
- `problem_zh.md`：题面，样例用 Hydro 的 input/output 代码块
- `testdata/`：至少样例成对的 `.in` / `.out`，以及 `config.yaml`

题号必须匹配 `^(?:[a-z0-9]{1,10}-)?[a-z][0-9a-z]*$`。已有题号不要覆盖。

## 建议流水线

1. 抽出 PDF 文本和页码，保留公式图片路径。
2. 用 JSON Schema 让模型输出题目数组：标题、题面 markdown、样例、标签、建议题号。
3. 校验失败则 job 标 `failed`，保留 `/data/jobs/<id>` 供人工看。
4. 通过后再调用 `hydro_import.make_zip` 和 `post_zip`。

网页链接、Word 文档走同一个 `Skill.run`，只换抽取步骤。
