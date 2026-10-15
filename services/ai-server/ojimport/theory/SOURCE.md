# 理论卷模版来源（B 区）

## 当前 `template/` 对应题包

内容与 B 区下列题包一致（GESP202506 **一级**客观题，15 单选 + 10 判断）：

`NOI/base/hydroj/生成题目文件/gesp理论题/work_GESP2025610_一级客观题21/`

```
work_GESP2025610_一级客观题21/
├── problem.yaml
├── problem_zh.md
└── testdata/config.yaml
```

说明：模版里 **pid** 仍为 `GESP5000` 仅作占位；从 B 区同步或发新卷时请使用真实题号（如 `GESP2025610` 或 `ait…` 新号）。

## 仓库内副本

| 位置 | 用途 |
|------|------|
| `ojimport/theory/template/` | ai-server / LLM 引用的标准三件套 |
| `ojimport/theory/example_problem.yaml` 等 | 与 `template/` 保持同内容（兼容旧路径） |

## 刷新到 ojimport

在 `services/ai-server` 下：

```bash
export THEORY_SAMPLE="$HOME/.../生成题目文件/gesp理论题/work_GESP2025610_一级客观题21"
./scripts/sync_ojimport_from_skill.sh
```

未设置 `THEORY_SAMPLE` 时，脚本默认仍指向 `work_GESP5000_五级模拟题客观题`；**一级卷模版请显式设置上表路径**，或改脚本默认后再同步。

同步后建议核对：`FORMAT.md`、`README.md` 与 `template/` 题量、分节是否仍一致。
