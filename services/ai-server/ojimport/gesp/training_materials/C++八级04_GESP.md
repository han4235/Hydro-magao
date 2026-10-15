<!-- source: C++八级04_GESP.pdf sha256:1e10afae6f8a3f57 -->

D. 17

C. 30

B. 60

A. 100

班。那么⼀天中乘坐这些交通⼯具从甲地到⼄地共有多少种不同的⾛法？（  ）。

第 4 题  从甲地到⼄地，可以乘⾼铁，也可以乘汽车，还可以乘轮船。⼀天中，⾼铁有10班，汽车有5班，轮船有2

D. 60

C. 20

B. 120

A. 5

每个盒⼦放⼀个球，并且恰好有两个球的编号与盒⼦编号相同，问有多少种不同的⽅法？（  ）。

第 3 题  设有编号为A、B、C、D、E的5个球和编号为A、B、C、D、E的5个盒⼦。现将这5个球投⼊5个盒⼦，要求

D.

C.

B.

A.

第 2 题  对于⼀个具有 个顶点的⽆向图，若采⽤邻接矩阵表⽰，则该矩阵的⼤⼩为（  ）。

D. struct中成员的默认访问权限为private。

C. class中成员的默认访问权限为private。

B. 类的构造函数不可以为虚函数。

A. 类的析构函数可以为虚函数。

第 1 题  下⾯关于C++类和对象的说法，错误的是（  ）。

1 单选题（每题 2 分，共 30 分）

2024 年 09 ⽉
C++　八级

第 5 题   个结点的⼆叉树，执⾏释放全部结点操作的时间复杂度是（  ）。

A.

B.

C.

D.

第 6 题  在⼀个单位圆上，随机分布 个点，求这 个点能被⼀个单位半圆周全部覆盖的概率（  ）。

A.

B.

C.

D.

第 7 题  下⾯ pailie 函数是⼀个实现排列的程序，横线处可以填⼊的是（  ）。

1
2
3
4
5
6
7
8
9
10
11

12
13
14
15
16
17
18

#include <iostream>
using namespace std;
int sum = 0;
void swap(int & a, int & b) {
    int temp = a;
    a = b;
    b = temp;
}
void pailie(int begin, int end, int a[]) {
    if (begin == end) {
        for (int i = 0; i < end; i++)

            cout << a[i];
        cout << endl;
    }
    for (int i = begin; i < end; i++) {
        __________ // 在此处填入选项
    }
}

A.

1
2
3

1
2
3

B.

C.

swap(a[begin + 1], a[i]);
pailie(begin + 1, end, a);
swap(a[i], a[begin]);

swap(a[begin], a[i]);
pailie(begin, end, a);
swap(a[i], a[begin]);

D.

1
2
3

1
2
3

swap(a[begin], a[i]);
pailie(begin + 1, end, a);
swap(a[i], a[begin]);

swap(a[begin] + 1, a[i]);
pailie(begin + 1, end, a);
swap(a[i], a[begin + 1]);

第 8 题  上⼀题中，如果主函数为如下的程序，则最后的排列数是多少个？（  ）。

1
2
3
4

5

int main() {
    int a[5] = {1, 2, 3, 4, 5};
    pailie(0, 5, a);
    return 0;

}

A. 120

B. 60

C. 240

D. 180

第 9 题  下列程序实现了输出杨辉三角形，代码中横线部分应该填⼊的是（  ）。

1
2
3
4
5
6

7
8
9
10
11
12
13
14
15
16
17

18
19
20
21

#include <iostream>
using namespace std;
#define N 35
int a[N][N];
int main() {
    int n;

    cin >> n;
    for (int i = 1; i <= n; i++)
        for (int j = 1; j <= i; j++) {
            if (j == 1 || j == i)
                a[i][j] = 1;
            else
                __________ // 在此处填入选项
        }
    for (int i = 1; i <= n; i++) {
        for (int j = 1; j <= i; j++)
            cout << a[i][j];

        cout<<endl;
    }
    return 0;
}

A.  a[i][j] = a[i - 1][j - 1] + a[i - 1][j];

B.  a[i][j] = a[i][j - 1] + a[i - 1][j];

C.  a[i][j] = a[i - 1][j] + a[i - 1][j];

D.  a[i][j] = a[i - 1][j - 1] + a[i][j];

第 10 题  下⾯最⼩⽣成树的Kruskal算法程序中，横线处应该填⼊的是（  ）。

1
2
3

4
5
6
7
8
9
10
11
12
13

14
15
16
17
18
19
20
21
22
23
24

25
26
27
28
29
30
31
32
33
34

#include <iostream>
#include <vector>
#include <algorithm>

using namespace std;
struct Edge {
    int u, v, weight;
    bool operator <(const Edge & other) const {
        return weight < other.weight;
    }
};
int findParent(int vertex, vector<int> & parent) {
    if (parent[vertex] == -1)
        return vertex;

    return parent[vertex] = findParent(parent[vertex], parent);
}
int main() {
    int n, m;
    cin >> n >> m; // n: 顶点数, m: 边数
    vector<Edge> edges(m);
    vector<int> parent(n, -1);
    int totalWeight = 0;
    for (int i = 0; i < m; i++)
        cin >> edges[i].u >> edges[i].v >> edges[i].weight;
    sort(edges.begin(), edges.end());

    for (const auto & edge : edges) {
        int uParent = findParent(edge.u, parent);
        int vParent = findParent(edge.v, parent);
        if (__________) { // 在此处填入选项
            parent[uParent] = vParent;
            totalWeight += edge.weight;
        }
    }
}

A.  uParent == vParent

B.  uParent >= vParent

C.  uParent != vParent

D.  uParent <= vParent

第 11 题  下⾯Prim算法程序中，横线处应该填⼊的是（  ）。

1
2
3
4
5
6
7

#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;
int prim(vector<vector<int>> & graph, int n) {
    vector<int> key(n, INT_MAX);
    vector<int> parent(n, -1);

8
9
10
11
12
13

14
15
16
17
18
19
20
21
22
23

24
25
26
27
28
29
30
31
32
33

34
35
36
37
38
39
40
41
42

    key[0] = 0;
    for (int i = 0; i < n; i++) {
        int u = min_element(key.begin(), key.end()) - key.begin();
        if (key[u] == INT_MAX)
            break;
        for (int v = 0; v < n; v++) {
            if (__________) { // 在此处填入选项
                key[v] = graph[u][v];
                parent[v] = u;
            }
        }
    }
    int sum = 0;
    for (int i = 0; i < n; i++) {
        if (parent[i] != -1) {
            cout << "Edge: " << parent[i] << " - " << i << " Weight: " << key[i] <<

endl;
            sum += key[i];
        }
    }
    return sum;
}
int main() {
    int n, m;
    cin >> n >> m;
    vector<vector<int>> graph(n, vector<int>(n, 0));
    for (int i = 0; i < m; i++) {

        int u, v, w;
        cin >> u >> v >> w;
        graph[u][v] = w;
        graph[v][u] = w;
    }
    int result = prim(graph, n);
    cout << "Total weight of the minimum spanning tree: " << result << endl;
    return 0;
}

A.  graph[u][v] >= 0 && key[v] > graph[u][v]

B.  graph[u][v] <= 0 && key[v] > graph[u][v]

C.  graph[u][v] == 0 && key[v] > graph[u][v]

D.  graph[u][v] != 0 && key[v] > graph[u][v]

第 12 题  下列Dijkstra算法中，横线处应该填⼊的是（  ）。

1
2
3
4
5
6
7
8
9

#include <iostream>
using namespace std;

#define N 100
int n, e, s;
const int inf = 0x7fffff;
int dis[N + 1];
int cheak[N + 1];
int graph[N + 1][N + 1];

10
11
12
13
14
15

16
17
18
19
20
21
22
23
24
25

26
27
28
29
30
31
32
33
34
35
36

37
38

int main() {
    for (int i = 1; i <= N; i++)
        dis[i] = inf;
    cin >> n >> e;
    for (int i = 1; i <= e; i++) {
        int a, b, c;

        cin >> a >> b >> c;
        graph[a][b] = c;
    }
    cin >> s;
    dis[s] = 0;
    for (int i = 1; i <= n; i++) {
        int minn = inf, minx;
        for (int j = 1; j <= n; j++) {
            if (__________) { // 在此处填入选项
                minn = dis[j];

                minx = j;
            }
        }
        cheak[minx] = 1;
        for (int j = 1; j <= n; j++) {
            if (graph[minx][j] > 0) {
                if (minn + graph[minx][j] < dis[j]) {
                    dis[j] = minn + graph[minx][j];
                }
            }
        }

    }
}

A.  dis[j] > minn && cheak[j] == 0

B.  dis[j] < minn && cheak[j] == 0

C.  dis[j] >= minn && cheak[j] == 0

D.  dis[j] < minn && cheak[j] != 0

第 13 题  下⾯Floyd算法中，横线处应该填⼊的是（  ）。

1
2
3
4
5

6
7
8
9
10
11
12
13
14
15
16

#include <iostream>
using namespace std;

#define N 21
#define INF 99999999

int map[N][N];
int main() {
    int n, m, t1, t2, t3;
    cin >> n >> m;
    for (int i = 1; i <= n; i++) {
        for (int j = 1; j <= n; j++) {
            if (i == j)
                map[i][j] = 0;
            else
                map[i][j] = INF;
        }

17
18
19
20
21
22

23
24
25
26
27
28
29
30
31
32

33
34

    }
    for (int i = 1; i <= m; i++) {
        cin >> t1 >> t2 >> t3;
        map[t1][t2] = t3;
    }
    for (int k = 1; k <= n; k++)

        for (int i = 1; i <= n; i++)
            for (int j = 1; j <= n; j++)
                if (__________) // 在此处填入选项
                    map[i][j] = map[i][k] + map[k][j];
    for (int i = 1; i <= n; i++) {
        for (int j = 1; j <= n; j++) {
            cout.width(4);
            cout << map[i][j];
        }
        cout << endl;

    }
}

A.  map[i][j] < map[i][k] + map[k][j]

B.  map[i][j] > map[i][k] + map[k][j]

C.  map[i][j] > map[i][k] - map[k][j]

D.  map[i][j] < map[i][k] - map[k][j]

第 14 题  下⾯程序的 Merge_Sort 函数时间复杂度为（  ）。

1
2
3
4
5

6
7
8
9
10
11
12
13
14
15
16

17
18
19
20
21
22
23
24
25
26

void Merge(int a[], int left, int mid, int right) {
    int temp[right - left + 1];
    int i = left;
    int j = mid + 1;
    int k = 0;

    while (i <= mid && j <= right) {
        if (a[i] < a[j])
            temp[k++] = a[i++];
        else
            temp[k++] = a[j++];
    }
    while (i <= mid)
        temp[k++] = a[i++];
    while (j <= right)
        temp[k++] = a[j++];
    for (int m = left, n = 0; m <= right; m++, n++)

        a[m] = temp[n];
}
void Merge_Sort(int a[], int left, int right) {
    if (left == right)
        return;
    int mid = (left + right) / 2;
    Merge_Sort(a, left, mid);
    Merge_Sort(a, mid + 1, right);
    Merge(a, left, mid, right);
}

去说谎国，可以这样问其中⼀位路⼈：“我要去说谎国，如果我去问另⼀个路⼈，他会指向哪⼀条路？”。

不知是哪⼀条通往哪⾥。正在为难之际，⾛来两位路⼈，他们都⾃称是诚实国公民，都说对⽅是说谎国公民。你想

第 10 题  诚实国公民只说实话，说谎国公民只说谎话。你来到⼀处分岔⼝，⼀条通往诚实国，⼀条通往说谎国，但

式计算 的时间复杂度是

。

第 9 题  已知等差数列的通项公式

过表达式 a / 2.0 * b 求得。

，则前 项和的求和公式为

。使⽤这⼀公

第 8 题  已知 int 类型的变量 a 和 b 中分别存储着⼀个直角三角形的两条直角边的长度，则该三角形的⾯积可以通

第 7 题  现有 个完全相同的元素，要将其分为 组，允许每组可以有 个元素，则⼀共有

种分组⽅案。

组合起来正好付清，且不需要对⽅找钱。

第 6 题  你有三种硬币，分别⾯值2元、5元和7元，每种硬币都有⾜够多。买⼀本书需要27元，则最少可以⽤5个硬币

第 5 题  使⽤ math.h 或 cmath 头⽂件中的余弦函数，表达式 cos(60) 的结果类型为 double 、值约为 0.5 。

第 4 题  ⼆叉排序树的查找操作的平均时间复杂度，正⽐于树的⾼度。

第 3 题  冒泡排序⼀般是不稳定的。

第 2 题  在C++语⾔中，变量定义必须在某⼀个函数定义之内。

第 1 题  表达式 '3' & 1 的结果为 '1' 。

2 判断题（每题 2 分，共 20 分）

,

6

5

4

3

2

1

D.

C.

B.

A.

}

D.

C.

B.

A.

        return fibonacci(n - 1) + fibonacci(n - 2);

    else

        return n;

    if (n <= 1)

int fibonacci(int n) {

第 15 题  下⾯ fibonacci 函数的时间复杂度为（  ）。

对于全部数据，保证有

，

。

，

40%

30%

30%

3

2

1

子任务编号 数据点占比

对于每组测试数据，输出⼀个整数，代表可能的情况数量对

 取模的结果。

第⼀⾏包含三个正整数

，代表⼿套数量，取出的⼿套数和⽬标对数。

接下来是   组测试⽤例。对于每组测试⽤例，⼀共⼀⾏。

第⼀⾏包含⼀个正整数  ，代表测试⽤例组数。

⼩杨认为两种取出的情况不同，当且仅当两种情况取出的⼿套中存在不同的⼿套（同⼀对⼿套的左右⼿也视为不同

⼩杨想知道从中取出

 只⼿套，  只⼿套恰好包含

 对⼿套的情况有多少种。

⼩杨有

 对不同的⼿套，每对⼿套由左右各⼀只组成。

2

1

3

2

1

0

120

5 1 5

5 6 2

2

3.1.4 样例1

3.1.3 输出格式

3.1.2 输入格式

的⼿套）。

3.1.1 题面描述

内存限制：512.0 MB

时间限制：1.0 s

试题名称：⼿套配对

3.1 编程题 1

3 编程题（每题 25 分，共 50 分）

 不是美丽路径（相邻节点

 和

 颜⾊相同）。

同。例如下图，其中节点

 和节点

 是⿊⾊，其余节点是⽩⾊，路径

 是美丽路径，⽽ 路径

对于树上的⼀条简单路径（不经过重复节点的路径），⼩杨认为它是美丽的当且仅当路径上相邻节点的颜⾊均不相

⼩杨有⼀棵包含

 个节点的树，节点从

 到

 编号，并且每个节点要么是⽩⾊，要么是⿊⾊。

3.2.1 题面描述

内存限制：512.0 MB

时间限制：1.0 s

试题名称：美丽路径

3.2 编程题 2

对于树上的⼀条简单路径，⼩杨认为它的长度是路径包含节点的数量。⼩杨想知道最长的美丽路径的长度是多少。

3.2.2 输入格式

第⼀⾏包含⼀个正整数  ，代表节点数量。

第⼆⾏包含

 个整数

，代表每个节点的颜⾊，如果

，代表节点   为⽩⾊，如果

，代表节点

 为⿊⾊。

之后

 ⾏，每⾏包含两个正整数

，代表存在⼀条连接节点

 和节点

 的边。

3.2.3 输出格式

输出⼀个整数，代表最长美丽路径的长度。

3.2.4 样例1

1
2
3
4
5
6

1

5
1 0 0 1 0
1 2
3 5
4 3
1 3

4

3.2.5 样例2

1
2
3
4
5
6

5
0 0 0 0 0
1 2
2 3
3 4
4 5

对于全部数据，保证有

，

，同时保证给出的数据构成⼀棵树。

3

2

1

40%

30%

30%

子任务编号 数据点占比

特殊条件

树的形态是⼀条链

1

1
