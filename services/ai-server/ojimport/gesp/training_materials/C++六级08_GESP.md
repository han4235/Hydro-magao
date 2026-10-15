<!-- source: C++六级08_GESP.pdf sha256:3a00bd4960d9e25d -->

A.  Animal(name)

29
28
27
26
25
24
23
22
21
20
19
18
17
16
15
14
13
12
11
10
9
8
7
6
5
4
3
2
1

}
    return 0;
    delete p;
    p->speak();
    Animal* p = new Dog("Rex", "Labrador");
int main() {

};
    }
        cout << "Dog barks" << endl;
    void speak() override {
        }
            std::cout << "Dog created\n";
    Dog(std::string name, std::string b) : _________________, breed(b) {
public:
    std::string breed;
class Dog : public Animal {

};
    }
        cout << "Animal speaks" << endl;
    virtual void speak() {
        }
            std::cout << "Animal created\n";
    Animal(std::string str) : name(str) {

    std::string name;
public:
class Animal {

第 2 题  2. 为了让  Dog  类的构造函数能正确地调⽤其⽗类  Animal  的构造⽅法，横线线处应填⼊（   ）。

D. 链接

C. 多态

B. 封装

A. 继承

第 1 题  下列哪⼀项不是⾯向对象编程的基本特征？

1 单选题（每题 2 分，共 30 分）

2025 年 06 ⽉
C++ 六级

B.  super(name)

C.  Animal::Animal(name)

D.  Animal()

第 3 题  代码同上⼀题，代码执⾏结果是（  ）。

A. 输出 Animal speaks

B. 输出 Dog barks

C. 编译错误

D. 程序崩溃

第 4 题  以下关于栈和队列的代码，执⾏后输出是（   ）。

1
2
3
4
5
6
7
8

stack<int> s;
queue<int> q;

for (int i = 1; i <= 3; ++i) {
    s.push(i);
    q.push(i);
}
cout << s.top() << " " << q.front() << endl;

A. 1 3

B. 3 1

C. 3 3

D. 1 1

第 5 题  在⼀个循环队列中， front 是指向队头的指针，  rear 指向队尾的指针，队列最⼤容量为  maxSize 。判断

队列已满的条件是（  ）。

A.  rear == front

B.  (rear + 1) % maxSize == front

C.  (rear - 1 + maxSize) % maxSize == front

D.  (rear - 1) == front

第 6 题  （   ）只有最底层的节点未被填满，且最底层节点尽量靠左填充。

A. 完美⼆叉树

B. 完全⼆叉树

C. 完满⼆叉树

D. 平衡⼆叉树

第 7 题  在使⽤数组表⽰完全⼆叉树时，如果⼀个节点的索引为 （从 开始计数），那么其左⼦节点的索引通常是（

）。

A.

B.

C.

D.

第 8 题  已知⼀棵⼆叉树的前序遍历序列为  GDAFEMHZ ，中序遍历序列为  ADFGEHMZ ，则其后序遍历序列为（   ）。

A.  ADFGEHMZ

B.  ADFGHMEZ

C.  AFDGEMZH

D.  AFDHZMEG

第 9 题  设有字符集 {a, b, c, d, e}，其出现频率分别为 {5, 8, 12, 15, 20}，得到的哈夫曼编码为（   ）。

A.

1
2
3
4
5

a: 010
b: 011
c: 00
d: 10
e: 11

B.

1
2
3
4
5

a: 00
b: 10
c: 011
d: 100
e: 111

C.

1
2
3
4
5

a: 10
b: 01
c: 011
d: 100
e: 111

D.

1
2
3
4
5

a: 100
b: 01
c: 011
d: 100
e: 00

第 10 题  3位格雷编码中，编码 101 之后的下⼀个编码不可能是（   ）。

A. 100

B. 111

C. 110

D. 001

第 11 题  请将下列 C++ 实现的深度优先搜索（DFS）代码补充完整，横线处应填⼊（   ）。

struct TreeNode {
    int val;
    TreeNode* left;
    TreeNode* right;
    TreeNode(int x): val(x), left(nullptr), right(nullptr) {}
};

void dfs(TreeNode* root, vector<int>& result) {
    if (root == nullptr) return;

    __________________________
}

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

A.

1
2
3

result.push_back(root->val);
dfs(root->left);
dfs(root->right);

B.

1
2
3

result.push_back(root->left->val);
dfs(root->right);
dfs(root->left);

C.

1
2
3

result.push_back(root->left->val);
dfs(root->left);
dfs(root->right);

D.

1
2
3

result.push_back(root->right->val);
dfs(root->right);
dfs(root->left);

第 12 题  给定⼀个⼆叉树，返回每⼀层中最⼤的节点值，结果以数组形式返回，横线处应填⼊（   ）。

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

#include <vector>
#include <queue>
#include <algorithm>

struct TreeNode {
    int val;
    TreeNode* left;
    TreeNode* right;
    TreeNode(int x): val(x), left(nullptr), right(nullptr) {}
};

vector<int> largestValues(TreeNode* root) {
    vector<int> result;
    if (!root) return result;

    queue<TreeNode*> q;
    q.push(root);

    while (!q.empty()) {
        int sz = q.size();

        int maxVal = INT_MIN;
        for (int i = 0; i < sz; ++i) {
            TreeNode* node;
            _______________________________
            maxVal = max(maxVal, node->val);
            if (node->left) q.push(node->left);
            if (node->right) q.push(node->right);
        }
        result.push_back(maxVal);
    }

    return result;
}

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

A.

1

node = q.end();

B.

1

node = q.front();

C.

1
2

q.pop();
node = q.front();

D.

1
2

node = q.front();
q.pop();

第 13 题  下⾯代码实现⼀个⼆叉排序树的插⼊函数（没有相同的数值），横线处应填⼊（   ）。

struct TreeNode {
    int val;
    TreeNode* left;
    TreeNode* right;
    TreeNode(int x): val(x), left(nullptr), right(nullptr) {}
};

void insert(TreeNode*& root, int key) {
    if (!root) {
        root = new TreeNode(key);
        return;
    }
    _______________________________
}

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

A.

1
2
3
4

if (key < root->val)
    insert(root->left, key);
else if (key > root->val)
    insert(root->right, key);

B.

种常见且有效的⽅法是使⽤环形数组，通过调整队⾸和队尾指针来实现。

第 3 题  为了实现⼀个队列，使其出队操作（ pop ）的时间复杂度为

并且避免数组删除⾸元素的

问题，⼀

第 2 题  给定⼀组字符及其出现的频率，构造出的哈夫曼树是唯⼀的。

第 1 题  构造函数可以被声明为 virtual。

2 判断题（每题 2 分，共 20 分）

D. 这段代码计算的是最⼩重量⽽⾮最⼤价值

C. 从⼤到⼩遍历  w  是为了避免重复使⽤同⼀物品

B. 外层循环  i  遍历背包容量，内层遍历物品

A. 该算法不能处理背包容量为  0  的情况

9
8
7
6
5
4
3
2
1

}
    return dp[W];
    }
        }
            dp[w] = max(dp[w], dp[w - wt[i]] + val[i]);
        for (int w = W; w >= wt[i]; --w) {
    for (int i = 0; i < n; ++i) {
    vector<int> dp(W+1, 0);
int knapsack1D(int W, vector<int>& wt, vector<int>& val, int n) {

）。

不放。⽬标是选择若⼲个物品放⼊背包，使得总价值最⼤，且总重量不超过 。关于下⾯代码，说法正确的是（

第 15 题  给定 个物品和⼀个最⼤承重为 的背包，每个物品有⼀个重量

和价值

，每个物品只能选择放或

D. 必须使⽤递归实现，不能使⽤迭代

C. 只能从底⾄顶迭代求解

B. 问题包含重叠⼦问题和最优⼦结构

A. ⼦问题相互独⽴，不重叠

第 14 题  以下关于动态规划算法特性的描述，正确的是（   ）。

2
1

insert(root->left, key);
insert(root->right, key);

D.

2
1

insert(root->right, key);
insert(root->left, key);

C.

4
3
2
1

    insert(root->left, key);
else if (key > root->val)
    insert(root->right, key);
if (key < root->val)

第 4 题  对⼀棵⼆叉排序树进⾏中序遍历，可以得到⼀个递增的有序序列。

第 5 题  如果⼆叉搜索树在连续的插⼊和删除操作后，所有节点都偏向⼀侧，导致其退化为类似于链表的结构，这时

其查找、插⼊、删除操作的时间复杂度会从理想情况下的

退化到

。

第 6 题  执⾏下列代码， my_dog.name  的最终值是  Charlie 。

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

class Dog {
public:
    std::string name;
    Dog(std::string str) : name(str) {}
};

int main() {
    Dog my_dog("Buddy");
    my_dog.name = "Charlie";
    return 0;
}

第 7 题  下列 C++ 代码可以成功编译，并且⼦类  Child  的实例能通过其成员函数访问⽗类  Parent  的属性

value 。

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

class Parent {
private:
    int value = 100;
};
class Child : public Parent {
public:
    int get_private_val() {
        return value; // 尝试访问父类的私有成员
    }
};

第 8 题  下列代码中的  tree  向量，表⽰的是⼀棵完全⼆叉树 ( -1 代表空节点)按照层序遍历的结果。

1
2

#include <vector>
std::vector<int> tree = {1, 2, 3, 4, -1, 6, 7};

第 9 题  在树的深度优先搜索（DFS）中，使⽤栈作为辅助数据结构以实现“先进后出”的访问顺序。

第 10 题  下⾯代码采⽤动态规划求解零钱兑换问题：给定 种硬币，第 𝑖 种硬币的⾯值为 𝑐𝑜𝑖𝑛𝑠[𝑖 − 1] ，⽬标⾦额为

𝑎𝑚𝑡 ，每种硬币可以重复选取，求能够凑出⽬标⾦额的最少硬币数量；如果不能凑出⽬标⾦额，返回 -1 。

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

int coinChangeDPComp(vector<int> &coins, int amt) {
    int n = coins.size();
    int MAX = amt + 1;

    vector<int> dp(amt + 1, MAX);
    dp[0] = 0;

    for (int i = 1; i <= n; i++) {
        for (int a = 1; a <= amt; a++) {
            if (coins[i - 1] > a)
                dp[a] = dp[a];
            else
                dp[a] = min(dp[a], dp[a - coins[i - 1]] + 1);
        }
    }
    return dp[amt] != MAX ? dp[amt] : -1;
}

3 编程题（每题 25 分，共 50 分）

3.1 编程题 1

试题名称：学习⼩组

时间限制：1.0 s

内存限制：512.0 MB

3.1.1 题目描述

班主任计划将班级⾥的

 名同学划分为若⼲个学习⼩组，每名同学都需要分⼊某⼀个学习⼩组中。观察发现，如果

⼀个学习⼩组中恰好包含

 名同学，则该学习⼩组的讨论积极度为  。

给定讨论积极度

，请你计算将这

 名同学划分为学习⼩组的所有可能⽅案中，讨论积极度之和的最⼤

值。

3.1.2 输入格式

第⼀⾏，⼀个正整数  ，表⽰班级⼈数。

第⼆⾏，  个⾮负整数

，表⽰不同⼈数学习⼩组的讨论积极度。

3.1.3 输出格式

输出共⼀⾏，⼀个整数，表⽰所有划分⽅案中，学习⼩组讨论积极度之和的最⼤值。

3.1.4 样例

3.1.4.1 输入样例 1

1
2

4
1 5 6 3

3.1.4.2 输出样例 1

1

10

3.1.4.3 输入样例 2

1
2

8
0 2 5 6 4 3 3 4

3.1.4.4 输出样例 2

1

12

3.1.5 数据范围

对于  % 的测试点，保证

对于所有测试点，保证

。

，

。

4
3
2
1

4 8
2 5
1 3
3

3.2.4.1 输入样例 1

3.2.4 样例

输出共   ⾏，每⾏⼀个整数，表⽰结点

 之间的距离。

3.2.3 输出格式

接下来   ⾏，每⾏两个正整数

，表⽰询问结点的编号。

第⼀⾏，⼀个正整数  ，表⽰询问组数。

3.2.2 输入格式

两个结点之间的距离是连接这两个结点的简单路径所包含的边数。

现在有   组询问，第   （

）组询问给定

，请你求出编号分别为

 的两个结点在这棵树上的距离。

）的结点，其⽗结点的编号为

 的因数中除

 以外最⼤的因数。

给定⼀棵有

 个结点的有根树，这些结点依次以

 编号，根结点的编号为  。对于编号为  （

3.2.1 题目描述

内存限制：512.0 MB

时间限制：1.0 s

试题名称：最⼤因数

3.2 编程题 2

对于所有测试点，保证

，

。

对于  % 的测试点，保证

。

3.2.5 数据范围

1

9

3.2.4.4 输出样例 2

2
1

120 650
1

3.2.4.3 输入样例 2

3
2
1

1
2
1

3.2.4.2 输出样例 1
