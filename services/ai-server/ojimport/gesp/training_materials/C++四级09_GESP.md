<!-- source: C++四级09_GESP.pdf sha256:cc3b75e6de364ca6 -->

第 2 题  下⾯代码的描述中，正确的是（ ）。

5
4
3
2
1

area = square(2);
}
    return;
    x * x;
void square(float x) {

D.

4
3
2
1

area = square(2.0);
}
    return x * x;
void square(float x) {

C.

4
3
2
1

float area = square(2);
}
    return x * x;
square(float x) {

B.

4
3

2
1

float area = square(2);
}

    return x * x;
float square(float x) {

A.

第 1 题  下⾯的语句中，（  ）正确定义了⼀个计算浮点数 的平⽅(

)的函数,并成功调⽤该函数。

1 单选题（每题 2 分，共 30 分）

2024 年 12 ⽉
C++　四级

1
2
3
4
5
6

7
8

void n_chars(char c, int n) {
   while (n-- > 0)
        cout << c;
}

char my_char = 'w';

int times = 5;
n_chars(my_char, times);

A. 代码执⾏结束后， times 的值为0

B.  n 是形参， times 是实参

C.  n 是实参， times 是形参

D. 代码最后⼀⾏换成 n_chars(times, my_char); 也可以

第 3 题  给定以下代码，

1
2
3
4
5

6

void func(int& x) {
    x = x * 2;
}

int a = 5;

func(a);

执⾏上述代码后，变量 a 的值为（  ）。

A. 5

B. 10

C. 15

D. 20

第 4 题  运⾏下⾯代码，屏幕上输出是（  ）。

1
2
3
4

5
6
7
8

double* p_arr = new double [3];
p_arr[0] = 0.2;
p_arr[1] = 0.5;
p_arr[2] = 0.8;

p_arr += 1;
cout << p_arr[0] << endl;
p_arr -= 1;
delete p_arr;

A. 0.2

B. 0.5

C. 1.2

D. 1.5

第 5 题  运⾏下⾯代码⽚段后， x 和 *p 的结果分别是（  ）。

1
2
3

int x = 20;
int* p = &x;
*p = *p + 2；

A. 20 20

B. 20 22

C. 22 20

D. 22 22

第 6 题  下⾯的描述中，（  ）不能正确定义⼀个名为 Student 的结构体以及⼀个包含20个元素的结构数组。

A.

1
2
3
4
5
6

B.

1
2
3
4

5
6

C.

1
2
3
4
5
6

D.

1
2
3
4
5
6

struct Student {
    string name;
    int age;
    float score;
};
struct Student  students[20];

struct Student {
    string name;
    int age;
    float score;

};
Student  students[20];

struct Student {
    string name;
    int age;
    float score;
};
Student*  students = new Student[20];

struct Student {
    string name;
    int age;
    float score;
};
Student  students = new Student[20];

第 7 题  假定整型是32位，对⼀个 ⾏ 列的⼆维整数数组 array ,假设数组第⼀个元素在内存中的地址为

0x7ffee4065820 ，则第2⾏第2个元素的地址 &array[1][1] 为（  ）。

1
2
3
4

int array[2][3] = {
    {0, 1, 2},
    {3, 4, 5}
};

A.  0x7ffee4065824

B.  0x7ffee4065828

C.  0x7ffee406582c

D.  0x7ffee4065830

第 8 题  下⾯（  ）正确定义⼆维数组。

A.  int a[3][];

B.  int a[][];

C.  int a[][4];

D.  int a[][2] = {{1,2},{1,2},{3,4}};

第 9 题  下⾯代码采⽤递推算法来计算斐波那契数列

，则横线上应填写（  ）。

int fib(int n) {

    if (n == 0 || n == 1)
        return n;

    int f1 = 0;
    int f2 = 1;
    int result = 0;
    for (int i = 2; i <= n; i++) {
        ________________________________     // 在此处填入代码
    }
    return result;
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

result = f1 + f2;
f1 = f2;

f2 = result;

B.

1

2
3

C.

result += f1 + f2;

f1 = f2;
f2 = result;

1
2
3

result += f1 + f2;
f2 = result;
f1 = f2;

D.

1
2
3

result = f1 + f2;
f2 = result;
f1 = f2;

第 10 题  下⾯关于排序算法（冒泡排序、插⼊排序和选择排序）的描述中，不正确的是（  ）。

A. 冒泡排序基于元素交换实现，需借助临时变量，共涉及 个单元操作；⽽插⼊排序基于元素赋值实现，仅需

个单元操作。因此冒泡排序的计算开销通常⽐插⼊排序更⾼。

B. 选择排序在任何情况下的时间复杂度都为

C. 冒泡排序在任何情况下的时间复杂度都为

。

。

D. 如果给定数据部分有序，插⼊排序通常⽐选择排序效率更⾼。

第 11 题  冒泡排序的第⼀轮操作是从左到右遍历数组，通过两两⽐较相邻元素，将当前最⼤的元素移动到末尾。给

定数组 arr[]={4, 1, 3, 1, 5, 2} ，执⾏第⼀轮冒泡排序后数组 arr 中的内容为（  ）。

A.  1, 4, 3, 1, 5, 2

B.  1, 3, 1, 4, 2, 5

C.  1, 4, 3, 1, 2, 5

D.  4, 1, 3, 1, 5, 2

第 12 题  给定如下代码，其时间复杂度为（  ）。

1
2
3
4
5

int cellRecur(int n) {
    if (n == 1)
        return 1;
    return cellRecur(n - 1) + cellRecur(n - 1) + 1;
}

A.

B.

C.

D.

第 13 题  下⾯代码实现了插⼊排序函数，则横线上应填写（  ）。

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

void insertion_sort(vector<int> &nums) {
    for (int i = 1; i < nums.size(); i++) {

        ________________________________ {    // 在此处填入代码

        while (j >= 0 && nums[j] > base)

            nums[j + 1] = nums[j];
            j--;
        }
        nums[j + 1] = base;
    }
}

A.  int base = nums[i], j = i - 1;

B.  int base = nums[i], j = i;

C.  int base = nums[0], j = i - 1;

D.  int base = nums[0], j = i;

第 14 题  下⾯哪种⽅式不能实现将字符串"Welcome to GESP!"输出重定向到⽂件 log.txt （  ）。

A.

1
2
3

freopen("log.txt", "w", stdout);
cout << "Welcome to GESP!" << endl;
fclose(stdout);

B.

1
2
3

std::ofstream outFile("log.txt");
outFile << "Welcome to GESP!" << endl;
outFile.close();

C.

1
2
3

std::ofstream outFile("log.txt");
cout << "Welcome to GESP!" << endl;
outFile.close();

D.

1
2
3
4
5

ofstream log_file("log.txt");
streambuf* org_cout = cout.rdbuf();
cout.rdbuf(log_file.rdbuf());
cout << "This output will go to the log file." << endl;
cout.rdbuf(oorg_cout);

第 15 题  运⾏下⾯的代码，将出现什么情况？（  ）

1
2
3

double hmean(double a, double b) {
    if (a == -b )
        throw runtime_error("Runtime error occurred");

第 10 题  在 C++语⾔中，如果⼀个函数可能抛出异常，那么⼀定要在try ⼦句⾥调⽤这个函数。

第 9 题  选择排序是稳定的排序算法。

第 8 题  冒泡排序和插⼊排序都是稳定的排序算法。

第 7 题  冒泡排序的平均时间复杂度为

，但最优情况下为

。

第 6 题  某算法的递推关系式为

（ 为正整数）及

，则该算法的时间复杂度为

。

第 5 题  递推是⼀种通过已知的初始值和递推公式，逐步求解⽬标值的算法。

第 4 题   int arr[3][] 是⼀个正确的⼆维数组的声明。

第 3 题  函数参数可以通过值传递、引⽤传递和指针传递，这样函数内对参数的修改可以直接修改传⼊变量的值。

第 2 题  ⼀个函数必须在调⽤之前既声明⼜定义。

2

1

*ptr = 10;

int* ptr;

第 1 题  在 C++ 中，下⾯代码可以正确定义指针和初始化指针。

2 判断题（每题 2 分，共 20 分）

D. 编译错误

C. 程序调⽤ std::terminate()

B. 屏幕上输出 Caught an unknown exception

A. 屏幕上输出 Caught: Runtime error occurred

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

    return 0;

}

    }

        cout << "Caught an unknown exception." << endl;

    } catch (...) {

        cout << "Caught: " << e.what() << endl;

    catch (const runtime_error& e) {

    }

    try {

        cout << "hmean: " << result << endl;

        int result = hmean(x, y);

    double y = -10;

    double x = 10;

int main() {

}

    return 2.0*a*b/(a + b);

3 编程题（每题 25 分，共 50 分）

3.1 编程题 1

试题名称：Recamán

时间限制：1.0 s

内存限制：512.0 MB

3.1.1 题目描述

⼩杨最近发现了有趣的 Recamán 数列，这个数列是这样⽣成的：

数列的第⼀项

 是  ；

如果

 是正整数并且没有在数列中出现过，那么数列的第

 项

 为

，否则为

。

⼩杨想知道 Recamán 数列的前

 项从⼩到⼤排序后的结果。⼿动计算⾮常困难，⼩杨希望你能帮他解决这个问题。

3.1.2 输入格式

第⼀⾏，⼀个正整数  。

3.1.3 输出格式

⼀⾏，  个空格分隔的整数，表⽰ Recamán 数列的前

 项从⼩到⼤排序后的结果。

3.1.4 样例

3.1.5 输入样例 1

1

5

3.1.6 输出样例 1

1

1 2 3 6 7

3.1.7 输入样例 2

1

8

3.1.8 输出样例 2

1

1 2 3 6 7 12 13 20

3.1.9 样例解释

对于样例 1，

：

；

，不是正整数，因此

，不是正整数，因此

；

；

，是正整数，且没有在数列中出现过，因此

；

对于所有数据点，保证

。

3.1.10 数据范围

 从⼩到⼤排序后的结果为  1 2 3 6 7 。

，不是正整数，因此

；

3.2 编程题 2

试题名称：字符排序

时间限制：1.0 s

内存限制：512.0 MB

3.2.1 题面描述

⼩杨有

 个仅包含⼩写字母的字符串

，⼩杨想将这些字符串按⼀定顺序排列后拼接到⼀起构成字符串

。⼩杨希望最后构成的字符串   满⾜：

假设

 为字符串   的第   个字符，对于所有的

 均有

。两个字符的⼤⼩关系与其在字母表中的顺序⼀

致，例如

。

⼩杨想知道是否存在满⾜条件的字符串排列顺序。

3.2.2 输入格式

第⼀⾏包含⼀个正整数  ，代表测试数据组数。

对于每组测试数据，第⼀⾏包含⼀个正整数  ，含义如题⾯所⽰。

之后

 ⾏，每⾏包含⼀个字符串  。

3.2.3 输出格式

对于每组测试数据，如果存在满⾜条件的排列顺序，输出 1，否则输出 0。

3.2.4 样例

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

3
3
aa
ac
de
2
aac
bc
1
gesp

1
2
3

1
0
0

3.2.5 样例解释

对于第⼀组测试数据，⼀种可⾏的排列顺序为 aa+ac+de，构成的字符串   为 aaacde，满⾜条件。

对于全部数据，保证有

，每个字符串的长度不超过  。
