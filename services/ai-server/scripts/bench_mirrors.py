#!/usr/bin/env python3
"""测 pip / Debian 源在本机的首包耗时，供 Dockerfile 选镜像。用法: python3 scripts/bench_mirrors.py"""
import ssl
import time
import urllib.request

ssl._create_default_https_context = ssl._create_unverified_context

PIP = {
    'aliyun': 'https://mirrors.aliyun.com/pypi/simple/pip/',
    'tuna': 'https://pypi.tuna.tsinghua.edu.cn/simple/pip/',
    'tencent': 'https://mirrors.cloud.tencent.com/pypi/simple/pip/',
    'douban': 'https://pypi.doubanio.com/simple/pip/',
}
APT = {
    'aliyun': 'http://mirrors.aliyun.com/debian/dists/bookworm/InRelease',
    'tuna': 'http://mirrors.tuna.tsinghua.edu.cn/debian/dists/bookworm/InRelease',
    'ustc': 'http://mirrors.ustc.edu.cn/debian/dists/bookworm/InRelease',
    'huawei': 'https://mirrors.huaweicloud.com/debian/dists/bookworm/InRelease',
}


def head_ms(url: str) -> float | None:
    t0 = time.perf_counter()
    try:
        req = urllib.request.Request(url, method='HEAD')
        with urllib.request.urlopen(req, timeout=20) as resp:
            resp.read(128)
        return (time.perf_counter() - t0) * 1000
    except Exception:
        return None


def get_ms(url: str) -> float | None:
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            resp.read(8192)
        return (time.perf_counter() - t0) * 1000
    except Exception:
        return None


def main() -> int:
    print('pip (ms, HEAD):')
    pip_rank = []
    for name, url in PIP.items():
        ms = head_ms(url)
        print(f'  {name}: {ms:.0f}' if ms else f'  {name}: FAIL')
        if ms is not None:
            pip_rank.append((ms, name))
    pip_rank.sort()
    print('pip 推荐:', pip_rank[0][1] if pip_rank else 'unknown')

    print('apt InRelease (ms):')
    apt_rank = []
    for name, url in APT.items():
        ms = get_ms(url)
        print(f'  {name}: {ms:.0f}' if ms else f'  {name}: FAIL')
        if ms is not None:
            apt_rank.append((ms, name))
    apt_rank.sort()
    print('apt 推荐:', apt_rank[0][1] if apt_rank else 'unknown')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
