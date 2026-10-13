---
name: doc-reader-build
description: 把仓库内的 md 交付物渲染成单文件只读 HTML 阅读版。当用户说"出 HTML 阅读版"、"只读版"、"生成阅读页"、"md 转 html"、"做个网页版"、"给这份文档配个阅读页"时，使用此 skill。纯标准库、幂等、CSS 内嵌、单文件输出。
---

# 交付文档 → 只读 HTML 阅读版

## 用途

把仓库里的 md 交付文档（说明书 / 算例 / 方案 / 需求…）渲染成**单文件、只读、带侧栏导航**的 HTML 阅读版。

**md 是唯一内容源，HTML 不手工改**——HTML 一律由生成器产出，改内容只改 md。

---

## 两份现成母本（**照抄，不要从零写**）

| 母本 | 特点 |
|---|---|
| `04_workspace/01_prd/14-财务库存中心/build_calc_doc.py` | ★ **首选母本**——更通用：通用分节器 + 围栏代码块 + 块级公式 |
| `04_workspace/01_prd/14-财务库存中心/build_proto_doc.py` | 早期版：把 P01–P16 **硬绑**进切段逻辑，只适合骨架固定的逐页文档 |
| `04_workspace/01_prd/14-财务库存中心/check_calc_doc.py` | 配套**数值校验器**范本（表格列数、数值自洽） |

**新项目直接从 `build_calc_doc.py` 复制改名**，比照着改常量即可。

---

## 可直接复用的渲染层

```
tex()            行内/块级公式微子集（$…$ 与 $$…$$）
inline()        行内标记（粗体/代码/链接）
cell()          表格单元格
is_tbl() / split_cells()
render_table()  表格 → <table>
render_notes()  blockquote
render_ul()     有序/无序列表
render_code()   围栏代码块 → <pre>
render_fml()    块级公式
render_blocks() 段落调度
split_sections() 通用分节（按 ## / ### 派生侧栏与 id）
```

`build_proto_doc.py` 的 `split_head()` / `render_page(pid, …)` 是**硬绑版**，新项目别用——用 `split_sections()`。

---

## 要改的常量

```python
SRC   = "<源 md 文件名>"
OUT   = "<目标 html 文件名>"
# <title>、侧栏名（rail-name）、顶栏 h1
RAIL_FOOT = "<侧栏页脚：文档名 + 口径一句话>"
DOC_FOOT  = "<页脚：以 …… 为准>"      # 权威源指回需求文档原文
```

---

## 硬约定

1. **纯标准库**——不引第三方依赖，任何机器 `python3 xxx.py` 直接跑。
2. **幂等**——连跑两次产物 **md5 必须一致**。
3. **CSS 内嵌**——单文件产出，不引外链样式。
4. **样式复用本仓库「账簿绿格」令牌**（见 `build_calc_doc.py` 的 `CSS`）。
5. **界面定死一态**——不写 `prefers-color-scheme`。
6. **生成器放仓库内，不要放 `/tmp`**——本项目曾丢失过一次 `/tmp` 管线。

---

## 校验（必做）

```bash
cd <目标目录>

# 1) 幂等
python3 build_xxx_doc.py && md5 -q "<out>.html"
python3 build_xxx_doc.py && md5 -q "<out>.html"    # 两次必须相同

# 2) 侧栏 id ↔ href 一一对应，0 悬空
# 3) 宽表可横向滚动（overflow-x: auto），页面主体不横向滚动
```

视觉抽查：确认围栏代码块、块级公式、侧栏分组渲染正常，结存流水表这类宽表能横向滚动不撑破版面。

---

## 禁止操作

1. **手工改生成的 HTML**（改内容改 md，重跑生成器）。
2. **引第三方库或外链 CSS**。
3. **产生非幂等输出**。
4. **把生成器放 `/tmp`**。

---

## 相关 skill

财务库存中心这条线上的具体用法见：
- `fin-prototype-edit`（原型说明阅读版）
- `fin-calc-example`（计算示例阅读版，配 `check_calc_doc.py`）
