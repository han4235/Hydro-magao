<!-- source: C++五级03_GESP.pdf sha256:94740e7353dda9ca -->

1

void deleteNode(DoublyListNode*& head, int value) {

第 4 题  下⾯的代码⽚段⽤于在双向链表中删除⼀个节点。请在横线处填⼊（ ），使其能正确实现相应功能。

D.  return factorial(n / 2) * factorial(n / 2);

C.  return n * factorial(n);

B.  return factorial(n - 1) / n;

A.  return n * factorial(n - 1);

7
6
5
4
3
2
1

}
    }
        _________________________________  // 在此处填入代码
    } else {
        return 1;
    if (n == 0 || n == 1) {
int factorial(int n) {

第 3 题  下⾯的 C++ 代码⽚段⽤于计算阶乘。请在横线处填⼊（ ），实现正确的阶乘计算。

D. 以上都对

C. 在每⼀步选择中都选择全局最优解

B. 在每⼀步选择中都选择局部最优解

A. 在每⼀步选择中都做当前状态下的最优选择

第 2 题  贪⼼算法的核⼼思想是（ ）？

D. 以上都不对

C. 两个不同的整数可以分解为相同的素数乘积

B. 每个合数都可以唯⼀分解为⼀系列素数的乘积

A. 任意整数都可以分解为素数的乘积

第 1 题  唯⼀分解定理描述的内容是（ ）？

1 单选题（每题 2 分，共 30 分）

2024 年 03 ⽉
C++　五级

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

    DoublyListNode* current = head;
    while (current != nullptr && current->val != value) {
        current = current->next;
    }
    if (current != nullptr) {
        if (current->prev != nullptr) {
           ____________________________________ // 在此处填入代码
        } else {
            head = current->next;
        }
        if (current->next != nullptr) {
            current->next->prev = current->prev;
        }
        delete current;
    }
}

A.  if (current->next != nullptr) current->next->prev = current->prev;

B.  current->prev->next = current->next;

C.  delete current->next;

D.  current->prev = current->next;

第 5 题  辗转相除法也被称为（ ）

A. ⾼斯消元法

B. 费马定理

C. 欧⼏⾥德算法

D. ⽜顿迭代法

第 6 题  下⾯的代码⽚段⽤于计算斐波那契数列。该代码的时间复杂度是（ ）？

1
2
3
4
5
6
7

int fibonacci(int n) {
    if (n <= 1) {
        return n;
    } else {
        return fibonacci(n - 1) + fibonacci(n - 2);
    }
}

A.

B.

C.

D.

第 7 题  下⾯的代码⽚段⽤于将两个⾼精度整数进⾏相加。请在横线处填⼊（ ），使其能正确实现相应功能。

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

string add(string num1, string num2) {
    string result;
    int carry = 0;
    int i = num1.size() - 1, j = num2.size() - 1;
    while (i >= 0 || j >= 0 || carry) {
        int x = (i >= 0) ? num1[i--] - '0' : 0;

        int y = (j >= 0) ? num2[j--] - '0' : 0;
        int sum = x + y + carry;
        carry = sum / 10;
        _______________________________________
    }
    return result;
}

A.  result = to_string(sum % 10) + result;

B.  result = to_string(carry % 10) + result;

C.  result = to_string(sum / 10) + result;

D.  result = to_string(sum % 10 + carry) + result;

第 8 题  给定序列：1，3，6，9，17，31，39，52，61，79，81，90，96。使⽤以下代码进⾏⼆分查找查找元素 82

时，需要循环多少次，即最后输出的 times 值为（ ）。

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

int binarySearch(const std::vector<int>& arr, int target) {
    int left = 0;
    int right = arr.size() - 1;
    int times = 0;
    while (left <= right) {

        times ++;
        int mid = left + (right - left) / 2;
        if (arr[mid] == target) {
            cout << times << endl;
            return mid;
        } else if (arr[mid] < target) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }

    cout << times << endl;
    return -1;
}

A. 2

B. 5

C. 3

D. 4

第 9 题  下⾯的代码⽚段⽤于判断⼀个正整数是否为素数。请对以下代码进⾏修改，使其能正确实现相应功能。（ ）

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

bool isPrime(int num) {
    if (num < 2) {
        return false;
    }
    for (int i = 2; i * i < num; ++i) {
        if (num % i == 0) {

            return false;
        }
    }
    return true;
}

A.  num < 2  应该改为  num <= 2

B. 循环条件  i * i < num  应该改为  i * i <= num

C. 循环条件应该是  i <= num

D. 循环体中应该是  if (num % i != 0)

第 10 题  在埃拉托斯特尼筛法中，要筛选出不⼤于  n  的所有素数，最外层循环应该遍历什么范围（ ）？

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

vector<int> sieveOfEratosthenes(int n) {
    std::vector<bool> isPrime(n + 1, true);

    std::vector<int> primes;
    _______________________ {
        if (isPrime[i]) {
            primes.push_back(i);
            for (int j = i * i; j <= n; j += i) {
                isPrime[j] = false;
            }
        }
    }
    for (int i = sqrt(n) + 1; i <= n; ++i) {

        if (isPrime[i]) {
            primes.push_back(i);
        }
    }
    return primes;
}

A.  for (int i = 2; i <= n; ++i)

B.  for (int i = 1; i < n; ++i)

C.  for (int i = 2; i <= sqrt(n); ++i)

D.  for (int i = 1; i <= sqrt(n); ++i)

第 11 题  素数的线性筛法时间复杂度为（ ）。

A.

B.

C.

        head = head->next;

        }

            return 1;

        if (head->val == target) {

    while (head != nullptr) {

int searchValue(ListNode* head, int target) {

第 15 题  假设给定链表为:

，若调⽤  searchValue(head, 5) ，函数返回值为（ ）。

第 1 题  辗转相除法⽤于求两个整数的最⼤公约数。

2 判断题（每题 2 分，共 20 分）

C. 死循环，⽆法返回

D. 返回 -1

B. 返回 0

A. 返回 1

}

    }

    return 0;

9

8

7

6

5

4

3

2

1

D. 以上都对

C. 函数返回值固定

B. 函数参数递减（或递增）

A. 有终⽌条件

D. 时间复杂度和空间复杂度

C. 空间复杂度

B. 时间复杂度

A. 不影响

D. 回溯算法

C. 贪⼼算法

B. 分治

A. 动态规划

D.

第 12 题  归并排序的基本思想是（ ）。

第 14 题  递归函数在调⽤⾃⾝时，必须满⾜（ ），以避免⽆限递归？

第 13 题  在快速排序中，选择的主元素（pivot）会影响算法的（ ）。

第 2 题  插⼊排序的时间复杂度是

。

第 3 题  ⼆分查找要求被搜索的序列是有序的，否则⽆法保证正确性。

第 4 题  使⽤贪⼼算法解决问题时，每⼀步的局部最优解⼀定会导致全局最优解。

第 5 题  分治算法的核⼼思想是将⼀个⼤问题分解成多个相同或相似的⼦问题进⾏解决，最后合并得到原问题的解。

第 6 题  分治算法的典型应⽤之⼀是归并排序，其时间复杂度为

。

第 7 题  素数表的埃⽒筛法和线性筛法的时间复杂度都是

。

第 8 题  贪⼼算法是⼀种可以应⽤于所有问题的通⽤解决⽅案。

第 9 题  单链表和双链表都可以在常数时间内实现在链表头部插⼊或删除节点的操作。

第 10 题  在C语⾔中，递归的实现⽅式通常会占⽤更多的栈空间，可能导致栈溢出。

3 编程题（每题 25 分，共 50 分）

3.1 编程题 1

试题名称：成绩排序

3.1.1 问题描述

有

 名同学，每名同学有语⽂、数学、英语三科成绩。你需要按如下规则对所有同学的成绩从⾼到低排序：

1. ⽐较总分，⾼者靠前；

2. 如果总分相同，则⽐较语⽂和数学两科总分，⾼者靠前；

3. 如果仍相同，则⽐较语⽂和数学两科的最⾼分，⾼者靠前；

4. 如果仍相同，则⼆⼈并列。

你需要输出每位同学的排名，如遇

 ⼈并列，则他们排名相同，并留空后⾯的

 个名次。例如，有

 名同学并

列第  ，则后⼀名同学⾃动成为第

 名。

3.1.2 输入描述

第⼀⾏⼀个整数  ，表⽰同学的⼈数。

接下来

 ⾏，每⾏三个⾮负整数

 分别表⽰该名同学的语⽂、数学、英语成绩。

保证

。

3.1.3 输出描述

输出

 ⾏，按输⼊同学的顺序，输出他们的排名。

注意：请不要按排名输出同学的序号，⽽是按同学的顺序输出他们各⾃的排名

3.1.4 特别提醒

在常规程序中，输⼊、输出时提供提⽰是好习惯。但在本场考试中，由于系统限定，请不要在输⼊、输出中附带任

何提⽰信息。

对于所有测试点，保证

。

对于

 的测试点，保证

，且所有同学的总分各不相同。

3.1.7 数据规模

6

5

4

3

2

1

7

6

5

4

3

2

1

6

2

4

4

3

1

6

3.1.6 样例输出 1

0 0 0

145 145 139

141 148 140

148 141 140

140 149 140

140 140 150

3.1.5 样例输入 1

对于全部数据，保证有

，

。

3

2

1

子任务编号 数据点占比

在不超过

 的正整数中， -smooth 数有

，共

 个。

3.2.6 数据范围

3.2.5 样例解释

1

1

7

10 3

3.2.4 样例1

3.2.3 输出格式

3.2.2 输入格式

输出⼀个⾮负整数，表⽰不超过

 的

-smooth 数的数量。

第⼀⾏包含两个正整数  ，含义如题⾯所⽰。

⼩杨同学想知道，对于给定的

 和  ，有多少个不超过

 的

-smooth 数。

如果⼀个正整数的最⼤质因⼦不超过  ，则该正整数为

-smooth 数。

⼩杨同学想寻找⼀种名为

-smooth 数的正整数。

3.2.1 题面描述

试题名称： -smooth 数

3.2 编程题 2
