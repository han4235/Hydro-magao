#include <iostream>
#include <algorithm>
#include <vector>

using namespace std;

// 定义最大范围 10^18，使用 long long 类型
const long long MAX_VAL = 1e18;

// 用于存储所有满足条件的终止数
// 终止数的性质：分母只包含质因数 2 和 5
// 即 x = 2^a * 5^b
vector<long long> nums;

int main() {
    // 预处理：生成所有形式为 2^a * 5^b 的数
    // 2^60 > 10^18，所以 a 最多到 60 左右
    // 5^26 > 10^18，所以 b 最多到 26 左右
    
    // 外层循环枚举 2 的幂次 (2^a)
    long long curr2 = 1;
    while (true) {
        // 内层循环枚举 5 的幂次 (5^b)
        // val 代表当前生成的数 2^a * 5^b
        long long val = curr2;
        while (true) {
            nums.push_back(val);
            
            // 检查 val * 5 是否溢出或超过 MAX_VAL
            // 使用除法来避免乘法溢出
            if (MAX_VAL / 5 < val) break;
            val *= 5;
        }
        
        // 检查 curr2 * 2 是否溢出或超过 MAX_VAL
        if (MAX_VAL / 2 < curr2) break;
        curr2 *= 2;
    }
    
    // 排序，因为生成的顺序不一定是完全有序的
    // 排序后方便使用二分查找
    sort(nums.begin(), nums.end());
    
    long long L, R;
    // 读取输入 L 和 R
    if (cin >> L >> R) {
        // 计算 [1, R] 范围内的终止数个数
        // upper_bound 返回第一个大于 R 的位置
        // 减去 nums.begin() 得到小于等于 R 的元素个数
        int cntR = upper_bound(nums.begin(), nums.end(), R) - nums.begin();
        
        // 计算 [1, L-1] 范围内的终止数个数
        int cntL = upper_bound(nums.begin(), nums.end(), L - 1) - nums.begin();
        
        // 两个区间相减得到 [L, R] 范围内的个数
        cout << cntR - cntL << endl;
    }
    
    return 0;
}
