# 搬题姬规范（ai-server 内置）

版本：`VERSION`（与 `.cursor/skills/ojimport-2.0.0` 对齐）。

## 目录

| 路径 | 用途 |
|------|------|
| `FLOW.md` | ai-server 与搬题姬步骤对照、哪些步骤不执行 |
| `SKILL_AVOID.md` | 铁律摘要 |
| `steps/` | 00–11（单题完整流程；11 为仅数据模式说明） |
| `gesp/` | Step03 定级：README + `training_materials/`（自 llm-wiki 同步 `.md`/`.cpp`；PDF 可选） |
| `question/` | 题包模板（yaml、题面样例、std/mkdata/mkin、testdata 配置） |
| `references/testdata-design.md` | 与 skill 同步；供人工补 25 组数据时参考，ai-server 自动路径不读 |
| `theory/` | 理论卷：`FORMAT.md`、`template/` 骨架、`example_*` 完整样例 |
| `prompts/` | LLM 前言；正文步骤由 `app/ojimport_spec.py` 拼接进系统提示 |

## 同步

```bash
./scripts/sync_ojimport_from_skill.sh
# 改完后递增 VERSION
python -m app.ojimport_spec   # 校验材料齐全
```

## 部署

Dockerfile 已 `COPY ojimport`。线上 `/health` → `ojimport.bundle_ok` 须为 true，`missing` 为空。
