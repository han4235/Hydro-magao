# Step 0: 辨输入类

## 目标

辨用户所给为 URL、题号、文件路径还是直文本，单题还是多题。

## 输入类型

| 类型 | 判断条件 |
|------|---------|
| URL | 以 `http://` 或 `https://` 起 |
| 题号 | 匹配 PID 格式（`P1510`、`CF1891B`、`abc453a`、`CSES1130` 等） |
| 文件路径 | 以 `/` 或 `./` 或 `~/` 起 |
| 直文本 | 非以上三者 |

## URL 来源辨析

| URL 特征 | 来源 | 题号规则 |
|----------|------|---------|
| `luogu.com.cn/problem/P1510` | 洛谷 | `P1510`（大写保留） |
| `codeforces.com/.../problem/B` | Codeforces | `CF{场次}{题号}`，如 `CF1891B` |
| `atcoder.jp/contests/abc453/tasks/abc453_a` | AtCoder | `abc453a` |
| `leetcode.cn/problems/two-sum` | LeetCode | 依题号或标题 |
| `hydro.ac/d/xxx/p/PID` | Hydro | 取内层 PID |

## 单题 / 多题

| 内容特征 | 去向 |
|---------|------|
| 一个题号 / 一条 URL / 一段题面 | 单题 → `01-init.md` |
| 多条 URL、题单列表、比赛链接、多题号 | 多题 → `10-batch.md` |

多题判法：

```python
def is_multi(content):
    if content.count("http") >= 2:
        return True
    markers = ["## A -", "## B -", "## C -", "## D -", "## E -"]
    return sum(1 for m in markers if m in content) >= 2
```

## 下一步

单题 → `01-init.md`
多题 → `10-batch.md`
