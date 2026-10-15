<!-- source: C++五级06_GESP.pdf sha256:e50218d516f44f6e -->

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

            LinkedNode* tmp = cur->next;
        if(cur->next->val == val) {
    while(cur ->next ！= nullptr) {

    ________________________________     // 在此处填入代码
    LinkedNode* dummyHead = new LinkedNode(0); //虚拟头节点
    LinkedNode* cur;

    }
        return;
    if (head == nullptr) {
void removeElements(LinkedNode* head, int val) {

};
    LinkedNode(int val):val(val), next(nullptr){}
    LinkedNode* next;
    int val;
struct LinkedNode {

了删除链表中值为 val 的节点，横线上应填的最佳代码是( )。

第 3 题  为了⽅便链表的增删操作，⼀些算法⽣成⼀个虚拟头节点，⽅便统⼀删除头节点和其他节点。下⾯代码实现

D. 上⼀个节点

C. 第⼀个节点

B. nullptr

A. 当前节点

第 2 题  在循环单链表中，节点的  next  指针指向下⼀个节点，最后⼀个节点的  next  指针指向（  ）。

D. 链表的节点在内存中是分散存储的，通过指针连在⼀起。

C. 链表插⼊和删除元素效率较低，时间复杂度为

。

B. 在链表中访问节点的效率较低，时间复杂度为

 。

较合适，⼤⼩可动态调整。

A. 当数据数量不确定时，为了应对各种可能的情况，需要申请⼀个较⼤的数组，可能浪费空间；此时⽤链表⽐

第 1 题  下⾯关于链表和数组的描述，错误的是（ ）。

1 单选题（每题 2 分，共 30 分）

2024 年 12 ⽉
C++　五级

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

            cur->next = cur->next->next;
            delete tmp;
            tmp = nullptr;
        }
        else {
            cur = cur ->next;

        }
    }
    head = dummyHead->next;
    delete dummyHead;
    dummyHead = nullptr;
}

A.  dummyHead->next = head; cur = dummyHead;

B.  dummyHead->next = head->next; cur = dummyHead;

C.  dummyHead->next = head; cur = dummyHead->next;

D.  dummyHead->next = head->next; cur = dummyHead->next;

第 4 题  对下⾯两个函数，说法错误的是（  ）。

int fibA(int n) {

    if (n <= 1) return n;

    int f1 = 0, f2 = 1;
    for (int i = 2; i <= n; ++i) {
        int temp = f2;
        f2 = f1 + f2;
        f1 = temp;
    }
    return f2;
}

int fibB(int n) {
    if (n <= 1) return n;
    return fibB(n - 1) + fibB(n - 2);
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

A. 两个函数的实现的功能相同。

B. fibA采⽤递推⽅式。

C. fibB采⽤的是递归⽅式。

D. fibA时间复杂度为

，fibB的时间复杂度为

。

第 5 题  两块长⽅形⼟地的长宽分别为

 和

 ⽶，要将它们分成正⽅形的⼩块，使得正⽅形的尺⼨尽可能⼤。⼩杨

采⽤如下的辗转相除函数 gcd(24, 36) 来求正⽅形分块的边长，则函数 gcd 调⽤顺序为（  ）。

1
2
3
4
5
6

7
8

int gcd(int a, int b) {
    int big = a > b ? a : b;
    int small = a < b ? a : b;
    if (big % small == 0) {
        return small;
    }

    return gcd(small, big % small);
}

A.  gcd(24, 36)、gcd(24, 12)、gcd(12, 0)

B.  gcd(24, 36)、gcd(12, 24)、gcd(0, 12)

C.  gcd(24, 36)、gcd(24, 12)

D.  gcd(24, 36)、gcd(12, 24)

第 6 题  唯⼀分解定理表明，每个⼤于1的⾃然数可以唯⼀地写成若⼲个质数的乘积。下⾯函数将⾃然数 的所有质因

素找出来，横线上能填写的最佳代码是（    ）。

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

#include <vector>
vector<int> get_prime_factors(int n) {
    vector<int> factors;
    if (n <= 1) {
        cout << "输入的数必须是大于1的正整数" << endl;
        return;
    }
    while (n % 2 == 0) {
        factors.push_back(2);
        n /= 2;

    }

    ________________________________    {    // 在此处填入代码
        while (n % i == 0) {
            factors.push_back(i);
            n /= i;
        }
    }

    if (n > 2) {
        factors.push_back(n);

    }

    return factors;
}

A.  for (int i = 3; i  <= n; i ++)

B.  for (int i = 3; i * i <= n; i ++)

C.  for (int i = 3; i  <= n; i += 2)

D.  for (int i = 3; i * i <= n; i += 2)

第 7 题  下述代码实现素数表的埃拉托⾊尼(埃⽒)筛法，筛选出所有⼩于等于 的素数。

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

vector<int> sieve_Eratosthenes(int n) {
    vector<bool> is_prime(n +1, true);
    vector<int> primes;

    for (int i = 2; i * i <= n; i++) {
        if (is_prime[i]) {

            primes.push_back(i);

            for (int j = i * i; j <= n; j += i) {
                is_prime[j] = false;
            }
        }
    }

    for (int i = sqrt(n) + 1; i <= n; i++) {
        if (is_prime[i]) {

            primes.push_back(i);
        }
    }

    return primes;
}

下⾯说法，正确的是（  ）。

A. 代码的时间复杂度是

。

B. 在标记⾮素数时，代码从

 开始，可以减少重复标记。

C. 代码会输出所有⼩于等于

 的奇数。

D. 调⽤函数 sieve_Eratosthenes(10) ，函数返回值的数组中包含的元素有： 2, 3, 5, 7, 9 。

第 8 题  下述代码实现素数表的线性筛法，筛选出所有⼩于等于 的素数。下⾯说法正确的是( )。

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

vector<int> sieve_linear(int n) {
    vector<bool> is_prime(n +1, true);
    vector<int> primes;

    for (int i = 2; i <= n/2; i++) {
        if (is_prime[i])
            primes.push_back(i);

        for (int j = 0; j < primes.size() && i * primes[j] <= n; j++) {
            is_prime[ i * primes[j] ] = 0;

            if (i % primes[j] == 0)
                break;
        }
    }

    for (int i = n/2 +1; i <= n; i++) {
        if (is_prime[i])
            primes.push_back(i);
    }

    return primes;

22

}

A. 线性筛的时间复杂度是

。

B. 每个合数会被其所有的质因⼦标记⼀次。

C. 线性筛和埃拉托⾊尼筛的实现思路完全相同。

D. 以上都不对

第 9 题  考虑以下C++代码实现的快速排序算法：

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

int partition(vector<int>& arr, int left, int right) {
    int pivot = arr[right]; // 基准值
    int i = left - 1;

    for (int j = left; j < right; j++) {
        if (arr[j] < pivot) {
            i++;
            swap(arr[i], arr[j]);
        }
    }
    swap(arr[i + 1], arr[right]);
    return i + 1;

}

// 快速排序
void quickSort(vector<int>& arr, int left, int right) {
    if (left < right) {
        int pi = partition(arr, left, right);
        quickSort(arr, left, pi - 1);
        quickSort(arr, pi + 1, right);
    }
}

以下关于快速排序的说法，正确的是（  ）。

A. 快速排序通过递归对⼦问题进⾏求解。

B. 快速排序的最坏时间复杂度是

。

C. 快速排序是⼀个稳定的排序算法。

D. 在最优情况下，快速排序的时间复杂度是

。

第 10 题  下⾯关于归并排序，描述正确的是（  ）。

A. 归并排序是⼀个不稳定的排序算法。

B. 归并排序的时间复杂度在最优、最差和平均情况下都是

。

C. 归并排序需要额外的

 空间。

D. 对于输⼊数组 {12, 11, 13, 5, 6, 7}，代码输出结果为：7 6 5 13 12 11。

第 11 题  给定⼀个长度为 的有序数组 nums ，其中所有元素都是唯⼀的。下⾯的函数返回数组中元素 target 的索

引。

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

int binarySearch(vector<int> &nums, int target, int left, int right) {
    if (left > right) {
        return -1;
    }

    int middle = left + ((right - left) / 2);

    if (nums[middle] == target) {
        return middle;
    }
    else if (nums[middle] < target) {
        return binarySearch(nums, target, middle + 1, right);
    }
    else
        return binarySearch(nums, target, left, middle - 1);
    }
}

int Find(vector<int> &nums, int target) {
    int n = nums.size();
    return binarySearch(nums, target, 0, n - 1);
}

关于上述函数，描述不正确的是（  ）。

A. 函数采⽤⼆分查找，每次计算搜索当前搜索区间的中点，然后根据中点的元素值排除⼀半搜索区间。

B. 函数采⽤递归求解，每次问题的规模减⼩⼀半。

C. 递归的终⽌条件是中间元素的值等于 target ，若数组中不包含该元素，递归不会终⽌。

D. 算法的复杂度为

.

第 12 题  给定⼀个长度为 的有序数组 nums ，其中可能包含重复元素。下⾯的函数返回数组中某个元素 target 的

左边界，若数组中不包含该元素，则返回 −1 。例如在数组 nums = [5,7,7,8,8,10] 中查找 target=8 ，函数返

回 在数组中的左边界的索引为 。则横线上应填写的代码为（  ）。

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

int getLeftBoundary(vector<int>& nums, int target) {

    int left = 0;
    int right = nums.size() - 1;

    while (left < right) {
        int middle = left + ((right - left) / 2);
        if (target <= nums[middle])
            ________________________________     // 在此处填入代码
        else
            left = middle+1;
    }

    return nums[left]==target?left:-1;
}

A.  right = middle - 1;

B.  right = middle;

C.  right = middle + 1;

D. 以上都不对

第 13 题  假设有多个孩⼦，数组 g 保存所有孩⼦的胃⼝值。有多块饼⼲，数组 s 保存所有饼⼲的尺⼨。⼩杨给孩⼦

们发饼⼲，每个孩⼦最多只能给⼀块饼⼲。饼⼲的尺⼨⼤于等于孩⼦的胃⼝时，孩⼦才能得到满⾜。⼩杨的⽬标是

尽可能满⾜越多数量的孩⼦，因此打算采⽤贪⼼算法来找出能满⾜的孩⼦的数⽬，则横线上应填写的代码为（  ）。

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

int cooki4children(vector<int>& g, vector<int>& s) {
    sort(g.begin(), g.end());
    sort(s.begin(), s.end());

    int index = s.size() - 1; // 饼干数组下标
    int result = 0;
    for (int i = g.size() - 1; i >= 0; i--) {
        if (index >= 0 && s[index] >= g[i]) {
            ________________________________     // 在此处填入代码
        }
    }
    return result;
}

A.  result++;  index--;

B.  result--;  index--;

C.  result--;  index++;

D.  result++;  index++;

第 14 题  关于分治算法，以下说法中不正确的是（  ）。

A. 分治算法将问题分成⼦问题，然后分别解决⼦问题，最后合并结果。

B. 归并排序采⽤了分治思想。

C. 快速排序采⽤了分治思想。

D. 冒泡排序采⽤了分治思想。

第 15 题  ⼩杨编写了⼀个如下的⾼精度减法函数：

vector<int> highPrecisionSubtract(vector<int> a, vector<int> b) {
    vector<int> result;
    int borrow = 0;

    for (int i = 0; i < a.size(); ++i) {
        int digitA = a[i];
        int digitB = i < b.size() ? b[i] : 0;

        int diff = digitA - digitB - borrow;
        if (diff < 0) {
            diff += 10;

            borrow = 1;
        }
        else {
            borrow = 0;
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

内存限制：512.0 MB

时间限制：1.0 s

试题名称：奇妙数字

3.1 编程题 1

3 编程题（每题 25 分，共 50 分）

等，导致递归通常⽐迭代更加耗费内存空间。

第 10 题  递归函数每次调⽤⾃⾝时，系统都会为新开启的函数分配内存，以存储局部变量、调⽤地址和其他信息

第 9 题  对有序数组 {5,13,19,21,37,56,64,75,88,92,100}  进⾏⼆分查找，成功查找元素 19  的⽐较次数是2。

低。

第 8 题  ⼆分查找仅适⽤于数组⽽不适合链表，因为⼆分查找需要跳跃式访问元素，链表中执⾏跳跃式访问的效率

第 7 题  快速排序的时间复杂度总⽐插⼊排序的时间复杂度低。

第 6 题  快速排序和归并排序的平均时间复杂度均为

，且都是稳定排序。

第 5 题  递归算法必须有⼀个明确的结束条件，否则会导致⽆限递归并可能引发栈溢出。

第 4 题  贪⼼算法通过每⼀步选择当前最优解，从⽽⼀定能获得全局最优解。

第 3 题  任何⼀个⼤于1的⾃然数都可以分解成若⼲个不同的质数的乘积，且分解⽅式是唯⼀的。

第 2 题  线性筛相对于埃拉托斯特尼筛法，每个合数只会被它的最⼩质因数筛去⼀次，因此效率更⾼。

第 1 题  单链表只⽀持在表头进⾏插⼊和删除操作。

2 判断题（每题 2 分，共 20 分）

D. 当减法结果为

 时，结果数组仍然会存储很多个元素 。

C. 代码的时间复杂度为

B. 代码假设输⼊数字是以倒序存储的，例如

 存储为  {0, 0, 5} 。

A. 如果数组 表⽰的整数⼩于 表⽰的整数，代码会正确返回⼆者的差为负数。

下⾯说法，正确的是（  ）。

    return result;

}

    }

    }

26

25

24

23

22

21

20

19

18

        result.push_back(diff);

        result.pop_back();

    while (result.size() > 1 && result.back() == 0) {

由于⽆法找到符合题意且同时包含

 个奇妙数字的集合，因此本样例的答案为  。

均为奇妙数字。同时，

 是

 的因⼦。

关于本样例，符合题意的⼀个包含

 个奇妙数字的集合是

。⾸先，因为

，

，

，所以

,

,

对于全部数据，保证有

。

3

2

1

60%

20%

20%

子任务编号 数据点占比

3.1.5 样例解释

1

1

3

128

3.1.4 样例

3.1.3 输出格式

3.1.2 输入格式

输出⼀个正整数，代表满⾜条件的集合最多包含的奇妙数字个数。

第⼀⾏包含⼀个正整数  ，含义如题⾯所⽰。

⼩杨希望集合包含的奇妙数字尽可能多，请你帮他计算出满⾜条件的集合最多包含多少个奇妙数字。

 是

 的因⼦（即

,

,

,

 这

 个数字的乘积是

 的因⼦）。

集合中不包含相同的数字。

数字，⽽

 不是。

3.1.1 题面描述

对于⼀个正整数  ，⼩杨想要构建⼀个包含

 个奇妙数字的集合

，使其满⾜以下条件：

⼩杨认为⼀个数字

 是奇妙数字当且仅当

，其中

 为任意质数且

 为正整数。例如，

，所以

 是奇妙

1

5

4

3

2

1

1

3 2

3 1

2 1

1 1

4 4

3.2.4 样例

3.2.3 输出格式

武器修改为任意武器。

3.2.1 题面描述

内存限制：512.0 MB

时间限制：1.0 s

试题名称：武器强化

3.2 编程题 2

输出⼀个整数，代表能够使适配第

 种武器的强化材料种类数严格⼤于其他的武器最少需要花费的⾦币。

之后

 ⾏，每⾏包含两个正整数

，代表第   种强化材料的适配武器和修改花费。

第⼀⾏包含两个正整数  ，含义如题⾯所⽰。

3.2.2 输入格式

该条件最少需要花费多少⾦币。

⼩杨最喜欢第

 种武器，因此他希望适配该武器的强化材料种类数严格⼤于其他的武器，请你帮⼩杨计算为了满⾜

⼩杨有

 种武器和

 种强化材料。第   种强化材料会适配第

 种武器，⼩杨可以花费

 ⾦币将该材料对应的适配

对于全部数据，保证有

。

3

2

1

60%

20%

20%

子任务编号 数据点占比

强化材料适配。满⾜适配第

 种武器的强化材料种类数严格⼤于其他的武器。

花费  ，将第三种强化材料的适配武器由

 改为  。此时，武器

 有

 种强化材料适配，武器

 和武器

 都各有

 种

3.2.5 样例解释
