<!-- source: C++六级04_GESP.pdf sha256:5e682e63a9972a35 -->

A. 1 1 1

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
    obj3.print_count();
    my_class obj3;
    obj2.print_count();
    my_class obj2;
    my_class::print_count();
    my_class obj1;
int main() {

int my_class::count = 0;
};
    }
       cout  << count << " ";
    static void print_count() {
    }
        count--;
    ~my_class() {
    }
        count++;
    my_class() {

    static int count;
public:
class my_class {

using namespace std;
#include <iostream>

第 2 题  运⾏下列代码，屏幕上输出（  ）。

D. 封装、继承、多态

C. 递归、循环、分治

B. 并发、并⾏、异步

A. 贪⼼、动态规划、回溯

第 1 题  ⾯向对象的编程思想主要包括（  ）原则。

1 单选题（每题 2 分，共 30 分）

2024 年 06 ⽉
C++　六级

B. 1 2 3

C. 1 1 2

D. 1 2 2

第 3 题  运⾏下列代码，屏幕上输出（  ）。

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
35
36
37
38
39
40
41
42

43
44
45
46
47
48

#include <iostream>
using namespace std;

class shape {
protected:
    int width, height;
public:
    shape(int a = 0, int b = 0) {
        width = a;
        height = b;

    }
    virtual int area() {
        cout << "parent class area: " <<endl;
        return 0;
    }
};

class rectangle: public shape {
public:
    rectangle(int a = 0, int b = 0) : shape(a, b) { }

    int area () {
        cout << "rectangle area: ";
        return (width * height);
    }
};

class triangle: public shape {
public:
    triangle(int a = 0, int b = 0) : shape(a, b) { }

    int area () {

        cout << "triangle area: ";
        return (width * height / 2);
    }
};

int main() {
   shape *pshape;
   rectangle rec(10, 7);
   triangle  tri(10, 5);

   pshape = &rec;
   pshape->area();

   pshape = &tri;
   pshape->area();
   return 0;

49

}

A. rectangle area: triangle area:

B. parent class area: parent class area:

C. 运⾏时报错

D. 编译时报错

第 4 题  向⼀个栈顶为hs的链式栈中插⼊⼀个指针为s的结点时，应执⾏（  ）。

A.  hs->next = s;

B.  s->next = hs; hs = s;

C.  s->next = hs->next; hs->next = s;

D.  s->next = hs; hs = hs->next;

第 5 题  在栈数据结构中，元素的添加和删除是按照什么原则进⾏的？

A. 先进先出

B. 先进后出

C. 最⼩值先出

D. 随机顺序

第 6 题  要实现将⼀个输⼊的⼗进制正整数转化为⼆进制表⽰，下⾯横线上应填⼊的代码为（  ）。

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

#include <iostream>
using namespace std;

stack<int> ten2bin(int n) {
    stack<int> st;
    int r, m;

    r = n % 2;
    m = n / 2;
    st.push(r);

    while (m != 1) {
        r = m % 2;
        st.push(r);
        m = m / 2;
    }
    st.push(m);
    return st;

}

int main() {
    int n;
    cin >> n;
    stack<int> bin;
    bin = ten2bin(n);
    while (!bin.empty()) {

27
28
29
30

        _____________________ // 在此处填入代码
    }
    return 0;
}

A.  cout << bin.top();  bin.pop();

B.  bin.pop(); cout << bin.top();

C.  cout << bin.back();  bin.pop();

D.  cout << bin.front();  bin.pop();

第 7 题  下⾯定义了⼀个循环队列的类，请补全判断队列是否满的函数，横向上应填写（  ）。

#include <iostream>

using namespace std;

class circular_queue {
private:
    int *arr; // 数组用于存储队列元素
    int capacity; // 队列容量
    int front; // 队头指针
    int rear; // 队尾指针

public:
    circular_queue(int size) {
        capacity = size + 1; // 为了避免队列满时与队列空时指针相等的情况，多预留一个空间
        arr = new int[capacity];
        front = 0;
        rear = 0;
    }

    ~circular_queue() {
        delete[] arr;
    }

    bool is_empty() {
        return front == rear;
    }

    bool is_full() {
        ________________ // 在此处填入代码
    }

    void en_queue(int data) {
        if (is_full()) {
            cout << "队列已满，无法入队！" << endl;
            return -1;
        }
        arr[rear] = data;
        rear = (rear + 1) % capacity;
        return 1;
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
43
44
45
46
47

48
49
50
51

    int de_queue() {
        if (is_empty()) {
            cout << "队列为空，无法出队！" << endl;
            return -1; // 出队失败，返回一个特殊值
        }
        int data = arr[front];

        front = (front + 1) % capacity;
        return data;
    }
};

A.  return (rear + 1) % capacity == front;

B.  return rear % capacity == front;

C.  return rear == front;

D.  return (rear + 1) == front;

第 8 题  对“classmycls”使⽤哈夫曼（Huffman）编码，最少需要（  ）⽐特。

A. 10

B. 20

C. 25

D. 30

第 9 题  ⼆叉树的（  ）第⼀个访问的节点是根节点。

A. 先序遍历

B. 中序遍历

C. 后序遍历

D. 以上都是

第 10 题  ⼀棵5层的满⼆叉树中节点数为（  ）。

A. 31

B. 32

C. 33

D. 16

第 11 题  在求解最优化问题时，动态规划常常涉及到两个重要性质，即最优⼦结构和(  )。

A.

重叠⼦问题

B. 分治法

C. 贪⼼策略

D. 回溯算法

第 12 题  青蛙每次能跳1或2步，下⾯代码计算青蛙跳到第n步台阶有多少种不同跳法。则下列说法，错误的是(  )。

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

int jump_recur(int n) {
    if (n == 1) return 1;
    if (n == 2) return 2;
    return jump_recur(n - 1) + jump_recur(n - 2);

}

int jump_dp(int n) {
    vector<int> dp(n + 1); // 创建一个动态规划数组，用于保存已计算的值
    // 初始化前两个数
    dp[1] = 1;
    dp[2] = 2;
    // 从第三个数开始计算斐波那契数列
    for (int i = 3; i <= n; ++i) {
        dp[i] = dp[i - 1] + dp[i - 2];
    }

    return dp[n];
}

A. 函数jump_recur()采⽤递归⽅式。

B. 函数jump_dp()采⽤动态规划⽅法。

C. 当n较⼤时，函数jump_recur()存在⼤量重复计算，执⾏效率低。

D. 函数jump_recur()代码量⼩，执⾏效率⾼。

第 13 题  阅读以下⼆叉树的⼴度优先搜索代码:

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

#include <iostream>
#include <queue>

using namespace std;

// 二叉树节点的定义
struct TreeNode {
    int val;
    TreeNode* left;
    TreeNode* right;
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
};

// 宽度优先搜索（BFS）迭代实现
TreeNode* bfs(TreeNode* root, int a) {

    if (root == nullptr) return nullptr;

    queue<TreeNode*> q;
    q.push(root);

    while (!q.empty()) {
        TreeNode* node = q.front();
        q.pop();

        if (node->val == a)
            return node;

27
28
29
30
31
32

33
34

        cout << node->val << " "; // 先访问当前节点

        if (node->left) q.push(node->left); // 将左子节点入队
        if (node->right) q.push(node->right); // 将右子节点入队
    }

    return nullptr;
}

使⽤以上算法，在以下这棵树搜索数值 时，可能的输出是(  )。

A. 5 2 -4 3 17 9

B. -4 2 3 5 9 17

C. 5 2 17 -4 3 9

D. 以上都不对

第 14 题  同上题中的⼆叉树，阅读以下⼆叉树的深度优先搜索代码:

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

#include <iostream>
#include <stack>

using namespace std;

// 非递归深度优先搜索（DFS）
TreeNode* dfs(TreeNode* root, int a) {
    if (root == nullptr) return nullptr;

    stack<TreeNode*> stk;
    stk.push(root);

    while (!stk.empty()) {
        TreeNode* node = stk.top();
        stk.pop();
        if (node->val == a)
            return node;

        cout << node->val << " "; // 访问当前节点

        if (node->right) stk.push(node->right); // 先压入右子节点
        if (node->left) stk.push(node->left); // 再压入左子节点
    }
    return nullptr;
}

内存限制：512.0 MB

时间限制：1.0 s

试题名称：计算得分

3.1 编程题 1

3 编程题（每题 25 分，共 50 分）

第 10 题  对0-1背包问题，贪⼼算法⼀定能获得最优解。

第 9 题  在深度优先搜索中，通常使⽤队列来辅助实现。

第 8 题  在C++中，静态成员函数只能访问静态成员变量。

第 7 题  完全⼆叉树可以⽤数组存储数据。

第 6 题  n个节点的双向循环链表，在其中查找某个节点的平均时间复杂度是

。

第 5 题  000, 001, 011, 010, 110, 111, 101, 100是⼀组格雷码。

第 4 题  C++中类内部可以嵌套定义类。

第 3 题  定义⼀个类时，必须⼿动定义⼀个析构函数，⽤于释放对象所占⽤的资源。

认的构造函数。

第 2 题  创建⼀个对象时，会⾃动调⽤该对象所属类的构造函数。如果没有定义构造函数，编译器会⾃动⽣成⼀个默

第 1 题  哈夫曼编码本质上是⼀种贪⼼策略。

2 判断题（每题 2 分，共 20 分）

D. 5

C. 4

B. 3

A. 2

D. 以上都不对

C. 5 2 17 -4 3 9

B. -4 2 3 5 9 17

A. 5 2 -4 3 17 9

第 15 题  在上题的树中搜索数值 时，采⽤深度优先搜索⼀共⽐较的节点数为（  ）。

使⽤以上算法，在⼆叉树搜索数值 时，可能的输出是(  )。

3.1.1 题面描述

⼩杨想要计算由

 个⼩写字母组成的字符串的得分。

⼩杨设置了⼀个包含

 个正整数的计分序列

，如果字符串的⼀个⼦串由

 (

) 个 abc ⾸

尾相接组成，那么能够得到分数  ，并且字符串包含的字符不能够重复计算得分，整个字符串的得分是计分⼦串的

总和。

例如，假设

，字符串 dabcabcabcabzabc 的所有可能计分⽅式如下：

d+abc+abcabc+abz+abc 或者 d+abcabc+abc+abz+abc，其中 d 和 abz 不计算得分，总得分为

d+abc+abc+abc+abz+abc，总得分为

d+abcabcabc+abz+abc，总得分为

⼩杨想知道对于给定的字符串，最⼤总得分是多少。

3.1.2 输入格式

第⼀⾏包含⼀个正整数  ，代表计分序列

 的长度。

第⼆⾏包含

 个正整数，代表计分序列  。

第三⾏包含⼀个正整数  ，代表字符串的长度。

第四⾏包含⼀个由

 个⼩写字母组成的字符串。

3.1.3 输出格式

输出⼀个整数，代表给定字符串的最⼤总得分。

3.1.4 样例1

1
2
3
4

1

3
3 1 2
13
dabcabcabcabz

9

3.1.5 样例解释

最优的计分⽅式为 d+abc+abc+abc+abz，总得分为

，共

 分。

3.1.6 数据范围

子任务编号 数据点占比

特殊条件

1

2

3

20%

40%

40%

对于所有的   (

),存在

对于全部数据，保证有

。

第三⾏⼀个长度为

 的

 串，从左到右第  （

）位如果为  ，表⽰编号为   的节点颜⾊为⽩⾊，否则为⿊

第⼆⾏

 个正整数，第  （

）个数表⽰编号为

 的节点的⽗亲节点编号，数据保证是⼀棵⼆叉

⼩杨会对这棵⼆叉树进⾏   次操作，每次⼩杨会选择⼀个节点，将以这个节点为根的⼦树内所有节点的颜⾊反转，

⼩杨有⼀棵包含

 个节点的⼆叉树，且根节点的编号为  。这棵⼆叉树任意⼀个节点要么是⽩⾊，要么是⿊⾊。之后

第四⾏⼀个正整数  ，表⽰操作次数。

⾊。

树。

第⼀⾏⼀个正整数  ，表⽰⼆叉树的节点数量。

3.2.2 输入格式

⼩杨想知道   次操作全部完成之后每个节点的颜⾊。

即⿊⾊变成⽩⾊，⽩⾊变成⿊⾊。

3.2.1 题面描述

内存限制：512.0 MB

时间限制：1.0 s

试题名称：⼆叉树

3.2 编程题 2

子任务编号 数据点占比

特殊条件

对于所有

，节点   的⽗亲节点编号为

对于全部数据，保证有

。

3

2

1

40%

40%

20%

3.2.6 数据范围

第三次操作后，节点颜⾊为：010000

第⼆次操作后，节点颜⾊为：000000

第⼀次操作后，节点颜⾊为：011010

3.2.5 样例解释

010000

1

7

6

5

4

3

2

1

2

3

1

3

6

100101

3 1 1 3 4

3.2.4 样例1

3.2.3 输出格式

，表⽰编号为   的节点颜⾊为⽩⾊，否则为⿊⾊。

输出⼀⾏⼀个长度为

 的

 串，表⽰   次操作全部完成之后每个节点的颜⾊。从左到右第  （

） 位如果为

接下来   ⾏每⾏⼀个正整数  （

），表⽰第   次操作选择的节点编号。
