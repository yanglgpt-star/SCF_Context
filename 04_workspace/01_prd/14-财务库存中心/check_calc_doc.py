#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""《计算示例》自洽校验器（只读）。
1) 每张表格的行列数与表头一致；
2) 「二级分摊与自有池」结存层：逐行 alloc − own = −(自有−会计)；
3) 情形分组的小计行 = 该组各行之和。
用法：python3 check_calc_doc.py"""
import re, sys, os
from decimal import Decimal

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "财务库存中心（一期）计算示例_v1.0.md")

def cells(l):
    return [c.strip() for c in l.strip().strip("|").split("|")]

def is_sep(l):
    return bool(re.match(r'^\|[\s:|-]+\|$', l.strip())) and "-" in l

def num(s):
    s = s.strip().replace("**", "").replace(",", "").replace("−", "-")
    if not s or s in ("-", "—"):
        return None
    try:
        return Decimal(s)
    except Exception:
        return None

def main():
    L = open(SRC, encoding="utf-8").read().split("\n")
    bad, ntab, blocks = [], 0, 0

    # ── 1. 表格列数一致
    i, fence = 0, False
    while i < len(L):
        l = L[i]
        if l.lstrip().startswith("```"):
            fence = not fence
            i += 1
            continue
        if not fence and l.strip().startswith("|") and i + 1 < len(L) and is_sep(L[i + 1]):
            ntab += 1
            w = len(cells(l))
            j = i + 2
            while j < len(L) and L[j].strip().startswith("|"):
                if len(cells(L[j])) != w:
                    bad.append(f"L{j+1} 列数 {len(cells(L[j]))} ≠ 表头 {w}：{L[j][:70]}")
                j += 1
            i = j
            continue
        i += 1

    # ── 2/3. 结存层算术
    for i, l in enumerate(L):
        if l.strip() != "**结存层**（报表上并排展示的两列 ＋ 一列算出来的自有均价）":
            continue
        blocks += 1
        h = i + 2
        if not L[h].strip().startswith("| 二级产权人 |"):
            bad.append(f"L{h+1} 表头异常：{L[h][:60]}")
            continue
        j, rows = h + 2, []
        while j < len(L) and L[j].strip().startswith("|"):
            c = cells(L[j])
            if len(c) != 6:
                bad.append(f"L{j+1} 结存层列数 {len(c)} ≠ 6")
            else:
                a, o, d = num(c[2]), num(c[3]), num(c[5])
                if a is not None and o is not None and d is not None and a - o != -d:
                    bad.append(f"L{j+1} alloc−own = {a-o}，自有−会计 列 = {d}")
                rows.append((c[0].replace("**", ""), d))
            j += 1
        # 情形分组小计
        groups = {}
        for name, d in rows:
            m = re.match(r'^(情形[一二三]|转出侧|转入侧)?', name)
            if "合计" in name:
                continue
            g = (name.split("·")[0].strip() if "情形" in name else "全体")
            groups.setdefault(g, Decimal(0))
            if d is not None:
                groups[g] += d
        for name, d in rows:
            if "合计" not in name:
                continue
            g = name.split("·")[0].strip()
            if g in groups and d != groups[g]:
                bad.append(f"L{i+1} 块：{g} 小计 = {d}，逐行求和 = {groups[g]}")

    print(f"表格 {ntab} 张 · 「二级分摊与自有池」结存层 {blocks} 块")
    if bad:
        print(f"\n发现问题 {len(bad)} 处：")
        for b in bad:
            print("  -", b)
        return 1
    print("全部通过 ✓")
    return 0

if __name__ == "__main__":
    sys.exit(main())
