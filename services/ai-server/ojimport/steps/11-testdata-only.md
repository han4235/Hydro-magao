# Step 11: 仅生测试点

## 目标

用户已供题，**仅需测试数据（.in / .out）**，不要题面文件、不要 problem.yaml、不要打包。

## ⚠️ 核心原则

```
标程 + mkin.h = 测试数据（.in + .out）
缺标程 → .out 不出
缺 mkin.h → .in 不出
两样皆写 → 编译 → 运行 → testdata/ 到手
```

## 流程

### 1. 析题

自用户材取以下信息（**必遍查，缺一不可**），记至 `{WORK_DIR}/problem_zh.md`（仅自参，不作交付）：

| 信息 | 说明 |
|------|------|
| 入格式 | 每行表何、量名及型、空格/换行分隔 |
| 出格式 | 出何、每行几数、精度求 |
| 数据范围 | N/值之上下限、极值 |
| 时/内存限 | 决数据规上限 |
| 算法类 | 决 Hack 数据向 |
| 测试点划分 | **必查**：题面有无写明测试点总数、各点规模/特殊性质/分值/百分比；有则依此定组数与 subtasks，无则走默认 |

若用户所供不足以定上任一，**必问用户补**。

### 2. 写标程 `{WORK_DIR}/std.cpp`

标程乃生 .out 之独法，必保：

- 算法**正**（能过诸 N 组测试数据，组数见第 3 步）
- 用 `std.cpp` 为文件名，置 `{WORK_DIR}/` 目录
- OI 风格：简变量名、全局变量、`ios::sync_with_stdio(false)`
- 时复杂度对标题限（勿写出比正解更慢版）
- 注：Hack 数据乃为**选手码**掘坑，标程必能正跑过诸 Hack

### 3. 设计测试数据

编 `{WORK_DIR}/mkin.h` 之 `test()` 函，覆诸测试点。

**题面指定优先，三样一起照做：**

| 项 | 题面给了测试点说明 | 题面没给（默认回退） |
|---|---|---|
| **总量** | 「共 N 个测试点」→ N 组 | 25 组 |
| **分组** | 各点规模/特殊性质/分值/百分比 → `subtasks` 逐点对应 | 默认 5 组（见 `references/testdata-design.md` → 一） |
| **数据** | `test()` 分支按题面逐点划分 | 按下述 3a–3f 骨架 |

定好组数后，`mkin.h` 顶常量与分支一起改：

```cpp
const int TEST_CASES = N;   // 题面给了测试点数就改成其数，否则留 25
```

**分布方案、边界清单、Hack 设计、config.yaml 格式详见 `references/testdata-design.md`。**

> 下述 3a–3f 的 case 编号为**默认 25 组**骨架；题面自定分点（点数或性质不同）时按题面重排编号，骨架仅作参考。

#### 3a. 样例数据（case 1-2）

径复用户供样例入/出。用户未供样例时，自构**最简可验数据**。

```cpp
if (case_num == 1) {
    // 样例1：自用户供题面复，逐字一致
    fout << "5 3" << endl;
    fout << "1 2 3 4 5" << endl;
}
else if (case_num == 2) {
    // 样例2
}
```

#### 3b. 小规模随机（case 3-5）

N 取题范围**最小规模**（如 1~10），验基本功正。

```cpp
else if (case_num >= 3 && case_num <= 5) {
    int N = rand() % 5 + 1;
    int M = rand() % 5 + 1;
    fout << N << " " << M << endl;
    // 据题异生随机数据
}
```

#### 3c. 特殊性质数据（case 6-8）

自 **`references/testdata-design.md` → 二、题型感知边界清单**，按题目类型选 3 个边界性质，每性质一用例。

#### 3d. Hack 数据（case 9-11）

自 **`references/testdata-design.md` → 三、Hack 数据设计** 选 3 种不同错误类型，针对性构造。

#### 3e. 中大规数据（case 12-20）

见 **`references/testdata-design.md` → 四、各规模数据生成建议**。

#### 3f. 随机复测（case 21-25）

诸类数混搭，覆不复景。

### 4. 配 {WORK_DIR}/testdata/config.yaml

格式见 **`references/testdata-design.md` → 五、config.yaml 格式**。

- 题面给了测试点划分 → `subtasks` 的分值、测试点区间、分组个数与题面**一一对应**，勿套默认 5 组
- 题面没给 → 才用默认分组（样例 10 / 小规模+特殊 20 / Hack 15 / 中大规模 30 / 随机回归 25）
- 分值合计恒为 100；1~N 不重不漏，`cases` 与实生 `.in`/`.out` 一一对应
- **时/内存限**自用户供题信息取。若用户未供，主动问

### 5. 编译运行

```bash
cd {WORK_DIR}
g++ std.cpp -o std -std=c++17    # 编译标程（为 mkdata 所调）
g++ mkdata.cpp -o mkdata -std=c++17
./mkdata
```

预期出：
```
编译标准程序成功
开始生成输入数据...
生成【01.in】数据成功
...
输入数据生成完成
开始生成输出数据...
处理测试用例 【01】... 完成
...
输出数据生成完成
```

### 6. 验证

必验下诸项：

- [ ] `mkin.h` 顶 `TEST_CASES` = 本次组数 N；`{WORK_DIR}/testdata/` 下 N 组 .in 与 N 组 .out 成对存
- [ ] 前 2 组数与样例题完全一致（用 `diff` 或 `read_file` 较）
- [ ] 每组 .in 格合同题入格式述，且规模/特殊性质吻合题面该测试点（无题面说明则合默认分布）
- [ ] `{WORK_DIR}/testdata/config.yaml` 分值合计 100、测试点区间不重不漏，cases 与实生文件一一对应
- [ ] `lsp_diagnostics` 查 mkin.h 无误

### 7. 打包

将测数与标程打为 zip，置 testdata 目录：

```bash
cd {WORK_DIR}
zip testdata/testdata.zip testdata/*.in testdata/*.out testdata/config.yaml std.cpp
```

生文件：`{WORK_DIR}/testdata/testdata.zip`（含 .in/.out/config.yaml/std.cpp）

### 8. 交付

告用户测数已生：
- `{WORK_DIR}/testdata/` 目录：N 组 `.in` + N 组 `.out` + `config.yaml`
- `{WORK_DIR}/testdata/testdata.zip`：前诸文件打

## 与常流之别

| 项 | 常搬题 | 仅生测试点 |
|------|---------|-------------|
| 题面 problem_zh.md | 生 | **跳**（或仅内参） |
| problem.yaml | 写 | **跳** |
| std.cpp | 写 | **写**（生 .out 必需） |
| mkin.h | 编 | **编** |
| mkdata + 运 | 行 | **行** |
| 打包 zip | 打全 {WORK_DIR}/ | **只打 testdata/ 为 testdata.zip** |
| {WORK_DIR}/testdata/config.yaml | 写 | **写** |
