<!-- source: C++五级04_GESP.pdf sha256:a87fdf1e2e6a9840 -->

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

    return;
    }
        money = money % coins[i];
        coins_used[i] = money / coins[i];
    for (int i = 0; i < N_COINS; i++) {
void find_coins(int money) {

int coins_used[N_COINS];
int coins[N_COINS] = {100, 50, 20, 10, 5, 2, 1}; //货币面值，单位相同
#define N_COINS 7

using namespace std;
#include <iostream>

第 2 题  下⾯C++代码⽤于将输⼊⾦额换成最少币种组合⽅案，其实现算法是(  )。

D. 递归算法

C. 迭代算法

B. 贪⼼算法

A. 枚举算法

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
    return next;
    }
        b = next;
        a = b;
        next = a + b;
    for (int i = 3; i <= n; i++) {
    int a = 1，b = 1, next;

        return 1;
    if (n == 1 || n == 2)

        return 0;
    if (n <= 0)
int fibo(int n) {

第 1 题  下⾯C++代码⽤于求斐波那契数列，该数列第1、2项为1，以后各项均是前两项之和。函数fibo()属于(  )。

1 单选题（每题 2 分，共 30 分）

2024 年 06 ⽉
C++　五级

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

}
int main() {
    int money;
    cin >> money;   //输入要换算的金额

    find_coins(money);

    for (int i = 0; i < N_COINS; i++)
        cout << coins_used[i] << endl;

    return 0;
}

A. 枚举算法

B. 贪⼼算法

C. 迭代算法

D. 递归算法

第 3 题  ⼩杨采⽤如下双链表结构保存他喜欢的歌曲列表：

1
2

3
4
5

struct dl_node {
    string song;

    dl_node* next;
    dl_node* prev;
};

⼩杨想在头指针为 head 的双链表中查找他喜欢的某⾸歌曲，采⽤如下查询函数，该操作的时间复杂度为（  ）。

1
2
3
4
5
6
7
8
9

dl_node* search(dl_node* head, string my_song) {
    dl_node* temp = head;
    while (temp != nullptr) {
        if (temp->song == my_song)
            return temp;
        temp = temp->next;
    }
    return nullptr;
}

A.

B.

C.

D.

第 4 题  ⼩杨想在如上题所述的双向链表中加⼊⼀⾸新歌曲。为了能快速找到该歌曲，他将其作为链表的第⼀⾸歌

曲，则下⾯横线上应填⼊的代码为（  ）。

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

void insert(dl_node *head, string my_song) {
    p = new dl_node;
    p->song = my_song;
    p->prev = nullptr;
    p->next = head;

    if (head != nullptr) {
        ________________________________  // 在此处填入代码
    }
    head = p;
}

A.  head->next->prev = p;

B.  head->next = p;

C.  head->prev = p;

D. 触发异常，不能对空指针进⾏操作。

第 5 题  下⾯是根据欧⼏⾥得算法编写的函数，它计算的是 与 的（  ）。

1
2

3
4
5
6
7
8

int gcd(int a, int b) {
    while (b != 0) {

        int temp = b;
        b = a % b;
        a = temp;
    }
    return a;
}

A. 最⼩公倍数

B. 最⼤公共质因⼦

C. 最⼤公约数

D. 最⼩公共质因⼦

第 6 题  欧⼏⾥得算法还可以写成如下形式:

1
2
3

int gcd(int a, int b) {
    return b == 0 ? a : gcd(b, a % b);
}

下⾯有关说法，错误的是（  ）。

A. 本题的 gcd() 实现为递归⽅式。

B. 本题的 gcd() 代码量少，更容易理解其辗转相除的思想。

C. 当 较⼤时，本题的 gcd() 实现会多次调⽤⾃⾝，需要较多额外的辅助空间。

D. 当 较⼤时，相⽐上题中的 gcd() 的实现，本题的 gcd() 执⾏效率更⾼。

第 7 题  下述代码实现素数表的线性筛法，筛选出所有⼩于等于 的素数，则横线上应填的代码是(  )。

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

vector<int> linear_sieve(int n) {
    vector<bool> is_prime(n + 1, true);
    vector<int> primes;
    is_prime[0] = is_prime[1] = 0; //0和1两个数特殊处理
    for (int i = 2; i <= n; ++i) {
        if (is_prime[i]) {

            primes.push_back(i);
        }
        ________________________________ {    // 在此处填入代码
            is_prime[i * primes[j]] = 0;
            if (i % primes[j] == 0)
                break;
        }
    }
    return primes;
}

A.  for (int j = 0;  j < primes.size() && i * primes[j] <= n;  j++)

B.  for (int j = 0;  j <= sqrt(n) && i * primes[j] <= n;  j++)

C.  for (int j = 0;  j <= n;  j++)

D.  for (int j = 1;  j <= sqrt(n);  j++)

第 8 题  上题代码的时间复杂度是（  ）。

A.

B.

C.

D.

第 9 题  为了正确实现快速排序，下⾯横线上的代码应为（  ）。

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

void qsort(vector<int>& arr, int left, int right) {
    int i, j, mid;
    int pivot;

    i = left;
    j = right;
    mid = (left + right) / 2; // 计算中间元素的索引
    pivot = arr[mid]; // 选择中间元素作为基准值

    do {

        while (arr[i] < pivot) i++;
        while (arr[j] > pivot) j--;
        if (i <= j) {
            swap(arr[i], arr[j]); // 交换两个元素
            i++; j--;
        }
    } ________________________________; // 在此处填入代码
    if (left < j) qsort(arr, left, j);   // 对左子数组进行快速排序
    if (i < right) qsort(arr, i, right); // 对右子数组进行快速排序
}

A.  while (i <= mid)

B.  while (i < mid)

C.  while (i < j)

D.  while (i <= j)

第 10 题  关于分治算法，以下哪个说法正确？

A. 分治算法将问题分成⼦问题，然后分别解决⼦问题，最后合并结果。

B. 归并排序不是分治算法的应⽤。

C. 分治算法通常⽤于解决⼩规模问题。

D. 分治算法的时间复杂度总是优于

。

第 11 题  根据下述⼆分查找法，在排好序的数组 1，3，6，9，17，31，39，52，61，79，81，90，96 中查找数值

82，和82⽐较的数组元素分别是（  ）。

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

int binary_search(vector<int>& nums, int target) {
    int left = 0;
    int right = nums.size() - 1;
    while (left <= right) {
        int mid = (left + right) / 2;
        if (nums[mid] == target) {
            return mid;

        } else if (nums[mid] < target) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    return -1; // 如果找不到目标元素，返回-1
}

A. 52, 61, 81, 90

B. 52, 79, 90, 81

C. 39, 79, 90, 81

D. 39, 79, 90

第 12 题  要实现⼀个⾼精度减法函数，则下⾯代码中加划线应该填写的代码为（  ）。

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

//假设a和b均为正数，且a表示的数比b大
vector<int> minus(vector<int> a, vector<int> b) {
    vector<int> c；
    int len1 = a.size();
    int len2 = b.size();
    int i, t;

    for (i = 0; i < len2; i++) {
        if (a[i] < b[i]) {  //借位
            _____________   // 在此处填入代码

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

            a[i] += 10;
        }
        t = a[i] - b[i];
        c.push_back(t);
    }
    for (; i < len1; i++)

        c.push_back(a[i]);

    len3 = c.size();
    while (c[len3 - 1] == 0) {//去除前导0
        c.pop_back();
        len3--;
    }
    return c;
}

A.  a[i + 1]--;

B.  a[i]--;

C.  b[i + 1]--;

D.  b[i]--;

第 13 题  设 和 是两个长度为 的有序数组，现将 和 合并成⼀个有序数组，归并排序算法在最坏情况下⾄少要做

（  ）次⽐较。

A.

B.

C.

D.

第 14 题  给定如下函数：

1
2
3
4
5

int fun(int n) {
    if (n == 1) return 1;
    if (n == 2) return 2;
    return fun(n - 2) - fun(n - 1);
}

则当

时，函数返回值为（  ）。

A. 0

B. 1

C. 21

D. -11

第 15 题  给定如下函数（函数功能同上题，增加输出打印）：

4

3

2

1

cout << ptr << endl;

delete ptr;

cout << *ptr << endl;

int* ptr = new int(10);

错。

⾼。

第 10 题  在下⾯C++代码中，由于删除了变量 ptr ，因此 ptr 所对应的数据也随之删除，故执⾏下述代码时，将报

第 9 题  在进⾏全国⼈⼝普查时，将其分解为对每个省市县乡来进⾏普查和统计。这是典型的分治策略。

第 8 题  插⼊排序有时⽐快速排序时间复杂度更低。

第 7 题  归并排序和快速排序都采⽤递归实现，也都是不稳定排序。（  ）

第 6 题  贪⼼算法通过每⼀步选择局部最优解来获得全局最优解，但并不⼀定能找到最优解。

第 5 题  唯⼀分解定理表明任何⼀个⼤于1的整数都可以唯⼀地表⽰为⼀系列质数的乘积，即质因数分解是唯⼀的。

第 4 题  找出⾃然数n以内的所有质数，常⽤算法有埃拉托斯特尼（埃⽒）筛法和线性筛法，其中埃⽒筛法效率更

第 3 题  链表的存储空间物理上可以连续，也可以不连续。

第 2 题  数组和链表都是线性表，链表的优点是插⼊删除不需要移动元素，并且能随机查找。

点，则该双向链表构成循环链表。

第 1 题  如果将双向链表的最后⼀个结点的下⼀项指针指向第⼀个结点，第⼀个结点的前⼀项指针指向最后⼀个结

2 判断题（每题 2 分，共 20 分）

D.  4 2 3 2 1

C.  4 2 3 1 2

B.  1 2 3 4

A.  4 3 2 1

则当

时，屏幕上输出序列为（  ）。

    return fun(n - 2) - fun(n - 1);

}

6

5

4

3

2

1

    if (n == 2) return 2;

    if (n == 1) return 1;

    cout << n << " ";

int fun(int n) {

3 编程题（每题 25 分，共 50 分）

3.1 编程题 1

试题名称：⿊⽩格

时间限制：1.0 s

内存限制：512.0 MB

3.1.1 题面描述

⼩杨有⼀个

 ⾏

 列的⽹格图，其中每个格⼦要么是⽩⾊，要么是⿊⾊。

⼩杨想知道⾄少包含

 个⿊⾊格⼦的最⼩⼦矩形包含了多少个格⼦。

3.1.2 输入格式

第⼀⾏包含三个正整数

，含义如题⾯所⽰。

之后

 ⾏，每⾏⼀个长度为

 的

 串，代表⽹格图第   ⾏格⼦的颜⾊，如果为  ，则对应格⼦为⽩⾊，否则为⿊

⾊。

3.1.3 输出格式

输出⼀个整数，代表⾄少包含

 个⿊⾊格⼦的最⼩⼦矩形包含格⼦的数量，如果不存在则输出  。

3.1.4 样例1

1
2
3
4
5

1

4 5 5
00000
01111
00011
00011

6

3.1.5 样例解释

对于样例1，假设 (

) 代表第   ⾏第   列，⾄少包含

 个⿊⾊格⼦的最⼩⼦矩形的四个顶点为 (

)，(

)，(

)，(

)，共包含

 个格⼦。

3.1.6 数据范围

对于全部数据，保证有

子任务编号 数据点占比

1

2

3

20%

40%

40%

。

内存限制：512.0 MB

时间限制：1.0 s

试题名称：⼩杨的幸运数字

3.2 编程题 2

对于全部数据，保证有

，每个正整数

 满⾜

。

2

1

60%

40%

子任务编号 数据点占比

正整数值域

3.2.6 数据范围

 的质因⼦有

， ，

，有三种。

 的质因⼦有  ，恰好有两种。

，

 的质因⼦有  ，只有⼀种。

3.2.5 样例解释

3

2

1

4

3

2

1

0

1

0

30

12

7

3

3.2.4 样例1

输出

 ⾏，对于每个正整数，如果是幸运数字，输出  ，否则输出  。

3.2.3 输出格式

之后

 ⾏，每⾏⼀个正整数。

第⼀⾏包含⼀个正整数  ，代表正整数个数。

3.2.2 输入格式

⼩杨现在有

 个正整数，他想知道每个正整数是否是他的幸运数字。

因⼦，因此

 是幸运数字，⽽

 的质因⼦有

，不符合要求，不为幸运数字。

⼩杨认为他的幸运数字应该恰好有两种不同的质因⼦，例如，

 的质因⼦有  ，恰好为两种不同的质

3.2.1 题面描述
