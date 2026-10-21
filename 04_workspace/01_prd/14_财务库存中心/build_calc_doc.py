# -*- coding: utf-8 -*-
"""财务库存中心（一期）计算示例_v1.0.md  ->  同名 .html 只读阅读版

单文件、无依赖（Python 3 标准库）。在本目录下执行：
    python3 build_calc_doc.py

与 build_proto_doc.py 同族：同样的「账簿绿格」令牌、同样定死一态、同样 CSS 内嵌、幂等。
差别只有三处：
  1) 目录不再硬绑 P01–P16，改成按标题层级通用生成（## 分章 · ### 条目 · #### 小节）；
  2) 支持围栏代码块（``` ），示例里的「计算逻辑」全靠它；
  3) 支持 $$…$$ 行间公式。
md 是唯一内容源，本脚本不产出内容，只做渲染。
"""
import re, html as H

SRC = "财务库存中心（一期）计算示例_v1.0.md"
OUT = "财务库存中心（一期）计算示例_v1.0.html"
AUTH = "财务库存中心（一期）需求文档 1.0（原型页面与核算引擎）.md"

lines = open(SRC, encoding="utf-8").read().split("\n")

# ---------------------------------------------------------------- 内联渲染
MATH_CMD = {
    "sum": "∑", "ge": "≥", "le": "≤", "lvert": "|", "rvert": "|",
    "times": "×", "cdot": "·", "Delta": "Δ", "neq": "≠", "approx": "≈",
    "pm": "±", "rightarrow": "→", "propto": "∝", "le": "≤", "mid": "|",
}

def tex(s):
    """行内公式：极小的 LaTeX 子集 -> HTML。输入已做过 HTML 转义。"""
    s = s.replace("\\_", "\x01")   # 字面下划线先保护，免得被当成下标标记
    out = []
    def frac(m):
        out.append('<span class="frac"><span class="fn">%s</span>'
                   '<span class="fd">%s</span></span>' % (tex(m.group(1)), tex(m.group(2))))
        return "\x00F%d\x00" % (len(out) - 1)
    while "\\frac" in s:
        s2 = re.sub(r'\\frac\{([^{}]*)\}\{([^{}]*)\}', frac, s)
        if s2 == s:
            break
        s = s2
    s = re.sub(r'_\{([^{}]*)\}', r'<sub>\1</sub>', s)
    s = re.sub(r'\^\{([^{}]*)\}', r'<sup>\1</sup>', s)
    s = re.sub(r'_([A-Za-z0-9])', r'<sub>\1</sub>', s)
    s = re.sub(r'\^([A-Za-z0-9])', r'<sup>\1</sup>', s)
    s = re.sub(r'\\([A-Za-z]+)',
               lambda m: MATH_CMD.get(m.group(1), m.group(1)), s)
    s = s.replace("\\%", "%").replace("\\|", "|") \
         .replace("\\,", "\u2009").replace("\\ ", " ")
    def un(m):
        return out[int(m.group(1))]
    return re.sub(r'\x00F(\d+)\x00', un, s).replace("\x01", "_")

def inline(t):
    t = H.escape(t, quote=False)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    t = re.sub(r'\$([^$\n]+)\$', lambda m: '<span class="mth">%s</span>' % tex(m.group(1)), t)
    t = t.replace("\\|", "|").replace("\\_", "_")   # 公式先自行处理自己的转义
    t = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)
    return t

def cell(t):
    return inline(t.strip())

def is_tbl(l):
    return l.strip().startswith("|") and l.strip().endswith("|")

def is_fence(l):
    return l.strip().startswith("```")

def split_cells(l):
    s = l.strip()[1:-1]
    return [c.strip() for c in re.split(r'(?<!\\)\|', s)]

def render_table(block):
    rows = [split_cells(l) for l in block]
    body = [r for r in rows if not all(re.fullmatch(r':?-{2,}:?', c) for c in r)]
    if not body:
        return ""
    head, rest = body[0], body[1:]
    cls = "grid wide" if len(head) >= 10 else "grid"
    o = ['<div class="tbl-wrap"><table class="%s">' % cls, "<thead><tr>"]
    for c in head:
        o.append("<th>%s</th>" % cell(c))
    o.append("</tr></thead><tbody>")
    for r in rest:
        r = r + [""] * (len(head) - len(r))
        o.append("<tr>" + "".join("<td>%s</td>" % cell(c) for c in r) + "</tr>")
    o.append("</tbody></table></div>")
    return "\n".join(o)

def render_notes(block):
    paras = []
    cur = []
    for l in block:
        s = l.strip()
        if s == ">":
            paras.append(cur); cur = []
        else:
            cur.append(s[1:].strip())
    paras.append(cur)
    o = []
    for p in paras:
        p = [x for x in p if x]
        if p:
            o.append('<p class="note-l">%s</p>' % inline(" ".join(p)))
    return '<aside class="note">%s</aside>' % "".join(o)

def render_ul(block, ordered=False):
    items = []
    for l in block:
        s = l.strip()
        s = re.sub(r'^(\d+\.|[-*])\s+', '', s)
        items.append("<li>%s</li>" % inline(s))
    return '<%s class="meta%s">%s</%s>' % (
        "ol" if ordered else "ul", " meta-ol" if ordered else "", "".join(items),
        "ol" if ordered else "ul")

def render_code(block):
    body = "\n".join(l for l in block)
    return '<pre class="calc">%s</pre>' % H.escape(body, quote=False)

def render_fml(body):
    return '<div class="fml">%s</div>' % tex(H.escape(body.strip(), quote=False))

def render_blocks(block):
    out, i = [], 0
    while i < len(block):
        l = block[i]
        if not l.strip():
            i += 1; continue
        if re.fullmatch(r'-{3,}', l.strip()):
            i += 1; continue
        # 围栏代码块
        if is_fence(l):
            j = i + 1
            while j < len(block) and not is_fence(block[j]):
                j += 1
            out.append(render_code(block[i + 1:j])); i = min(j + 1, len(block)); continue
        # 行间公式 $$…$$
        if l.strip().startswith("$$"):
            if l.strip().endswith("$$") and len(l.strip()) > 4:
                out.append(render_fml(l.strip()[2:-2])); i += 1; continue
            j = i + 1
            while j < len(block) and not block[j].strip().endswith("$$"):
                j += 1
            seg = [block[i].strip()[2:]] + block[i + 1:j] + (
                [block[j].strip()[:-2]] if j < len(block) else [])
            out.append(render_fml(" ".join(x for x in seg if x.strip())))
            i = min(j + 1, len(block)); continue
        # 标题（#### 及更深）
        m = re.match(r'^(#{4,})\s+(.*)$', l)
        if m:
            lvl = min(len(m.group(1)), 6)
            out.append('<h%d class="%s">%s</h%d>'
                       % (lvl, "mini-h" if lvl == 4 else "tiny-h",
                          inline(m.group(2).strip()), lvl))
            i += 1; continue
        if is_tbl(l):
            j = i
            while j < len(block) and is_tbl(block[j]):
                j += 1
            out.append(render_table(block[i:j])); i = j; continue
        if l.strip().startswith(">"):
            j = i
            while j < len(block) and block[j].strip().startswith(">"):
                j += 1
            out.append(render_notes(block[i:j])); i = j; continue
        if re.match(r'^\s*\d+\.\s', l):
            j = i
            while j < len(block) and re.match(r'^\s*\d+\.\s', block[j]):
                j += 1
            out.append(render_ul(block[i:j], ordered=True)); i = j; continue
        if re.match(r'^\s*[-*] ', l):
            j = i
            while j < len(block) and re.match(r'^\s*[-*] ', block[j]):
                j += 1
            out.append(render_ul(block[i:j])); i = j; continue
        j = i
        while j < len(block) and block[j].strip() and not is_tbl(block[j]) \
                and not is_fence(block[j]) \
                and not block[j].strip().startswith(">") \
                and not block[j].strip().startswith("$$") \
                and not re.match(r'^#{4,}\s', block[j]) \
                and not re.match(r'^\s*([-*]|\d+\.)\s', block[j]) \
                and not re.fullmatch(r'-{3,}', block[j].strip()):
            j += 1
        out.append('<p>%s</p>' % inline(" ".join(x.strip() for x in block[i:j])))
        i = j
    return "\n".join(out)

# ---------------------------------------------------------------- 切章 / 切节（通用）
title = ""
k = 0
while k < len(lines) and not lines[k].startswith("# "):
    k += 1
if k < len(lines):
    title = lines[k][2:].strip()
lead_lines = lines[k + 1:] if k < len(lines) else []

# 先切出 lead（第一个 ## 之前）与各章
chapters = []          # [(章标题, 章正文行)]
cur = None
for l in lead_lines:
    if l.startswith("## "):
        cur = (l[3:].strip(), [])
        chapters.append(cur)
    elif cur is None:
        pass
    else:
        cur[1].append(l)
lead_body = []
cur = None
for l in lead_lines:
    if l.startswith("## "):
        break
    lead_body.append(l)

def split_sections(ch_lines):
    """切成 [(节标题, 节正文行)]，外加章引言（第一个 ### 之前的内容）。"""
    secs, cur, pre = [], None, []
    for l in ch_lines:
        if l.startswith("### "):
            cur = (l[4:].strip(), [])
            secs.append(cur)
        elif cur is not None:
            cur[1].append(l)
        else:
            pre.append(l)
    return secs, pre

def slug(s, used):
    m = re.match(r'^([0-9]+(?:\.[0-9]+)*)\s', s)
    base = "s" + m.group(1).replace(".", "-") if m else None
    if not base:
        base = "s" + re.sub(r'[^0-9A-Za-z\u4e00-\u9fff]+', "", s)[:14]
    sid, n = base, 2
    while sid in used:
        sid = "%s-%d" % (base, n); n += 1
    used.add(sid)
    return sid

def sec_no_name(heading):
    m = re.match(r'^([0-9]+(?:\.[0-9]+)*|[一二三四五六七八九十]+、?|[A-Z][0-9]*)\s+(.*)$', heading)
    if m:
        return m.group(1), m.group(2).strip()
    return "", heading

used_ids = set()
nav, body_parts = [], []
n_tbl = 0
n_code = 0
n_sec = 0
chapter_list = []

for ch_title, ch_lines in chapters:
    secs, pre = split_sections(ch_lines)
    if not secs:
        # 章里没有 ### 小节（如附录 A）——整章当一节，标题去掉「附录 」前缀
        secs, pre = [(re.sub(r'^附录\s+', '', ch_title), ch_lines)], []
    chapter_list.append(ch_title)
    pre_html = render_blocks(pre) if pre else ""
    if pre_html:
        body_parts.append('<div class="chap-lead"><h2 class="chap-h">%s</h2>%s</div>'
                          % (H.escape(ch_title), pre_html))
    nav.append('<div class="rail-group-label"><span>%s</span><b>%d</b></div>'
               % (H.escape(ch_title), len(secs)))
    for heading, sbody in secs:
        no, nm = sec_no_name(heading)
        sid = slug(heading, used_ids)
        n_sec += 1
        nav.append('<a href="#%s" data-sec="%s"><span class="no">%s</span>'
                   '<span>%s</span></a>' % (sid, sid, inline(no or "·"), inline(nm)))
        html_body = render_blocks(sbody)
        n_tbl += html_body.count('<table class="grid')
        n_code += html_body.count('<pre class="calc">')
        body_parts.append(
            '<section class="pg" id="%s" data-nav="%s %s">'
            '<div class="sec-head"><span class="sec-no">%s</span>'
            '<div><h2>%s</h2><p class="sec-path">%s → %s</p></div></div>%s</section>'
            % (sid, inline(no), inline(nm), inline(no or "·"),
               inline(nm), H.escape(ch_title), inline(nm), html_body))

body_html = "\n".join(body_parts)
lead_html = render_blocks(lead_body) if lead_body else ""

RAIL_FOOT = "计算示例 v1.0 · 口径：一个数量、三个金额"

DOC_FOOT = ('<footer class="doc-foot">'
            '本页由 <code>@@SRC@@</code> 生成，仅供阅读。'
            '要改内容请改 md，再在本目录重跑 <code>python3 @@GEN@@</code>；勿直接改本文件。'
            '示例的口径、公式与错误码以 <code>@@AUTH@@</code> 为准；'
            '本文件是它的摘编，数字按最新口径（<code>alloc_amount</code> / '
            '<code>internal_amount</code> / <code>own_amount</code>）重算。'
            '</footer>')

CSS = r"""
/* 账簿绿格（与 PC 端界面同一套令牌）—— 定死一态，不跟随系统 */
:root{
  --rule-step:22px;
  --paper:#F3F3E9; --surface:#FFFEF9; --surface-2:#EDECE0; --surface-3:#E0DFCE;
  --ink:#1A2119; --ink-2:#53604E; --ink-3:#7C8874;
  --rule:#DAD8C5; --rule-2:#C4C1A9;
  --brand:#1F5C46; --brand-ink:#14402F; --brand-wash:#E2EFE7; --brand-line:#A9CDB8;
  --ledger:#9B6520; --ledger-ink:#714913; --ledger-wash:#F8EEDA; --ledger-line:#DFC08A;
  --l2:#4F5088; --l2-wash:#EAEAF4; --l2-line:#B8B9D7;
  --ok:#146B41; --ok-wash:#E1F0E7; --warn:#8A5A08; --warn-wash:#FBF0DA;
  --danger:#A93120; --danger-wash:#FAE6E2;
  --seal:#B2422A; --seal-line:rgba(178,66,42,.30);
  --rail:#14231C; --rail-2:#1C3128; --rail-line:#274334;
  --rail-ink:#8CA79A; --rail-ink-2:#5E7A6C; --rail-hi:#E9F1EA; --rail-active:#1F5C46;
  --bg-fx:repeating-linear-gradient(180deg,
    transparent 0 calc(var(--rule-step) - 1px),
    rgba(31,92,70,.055) calc(var(--rule-step) - 1px) var(--rule-step));
  --shadow-sm:0 1px 2px rgba(31,46,36,.05);
  --shadow:0 2px 4px rgba(31,46,36,.05),0 10px 28px rgba(31,46,36,.07);
  --r:8px;
  --font-ui:"Inter",-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  --font-display:"Noto Serif SC","Songti SC","Source Han Serif SC",Georgia,serif;
  --font-mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
}

*{box-sizing:border-box}
html{scroll-padding-top:76px}
body{
  margin:0; background:var(--paper); background-image:var(--bg-fx);
  color:var(--ink); font-family:var(--font-ui); font-size:14px; line-height:1.72;
  -webkit-font-smoothing:antialiased;
}
a{color:var(--brand); text-decoration:none}
a:hover{text-decoration:underline}
code{
  font-family:var(--font-mono); font-size:.88em;
  background:var(--surface-2); border:1px solid var(--rule);
  border-radius:4px; padding:1px 5px; color:var(--brand-ink); white-space:nowrap;
}
strong{font-weight:600; color:var(--ink)}

/* ---------------------------------------------------------------- 侧栏 */
.shell{display:grid; grid-template-columns:250px minmax(0,1fr); min-height:100vh}

.rail{
  position:sticky; top:0; align-self:start; height:100vh; overflow-y:auto;
  background:var(--rail); color:var(--rail-ink);
  display:flex; flex-direction:column;
  border-right:1px solid var(--rail-line);
}
.rail-brand{
  display:flex; align-items:center; gap:10px;
  padding:20px 18px 16px; border-bottom:1px solid var(--rail-line);
}
.rail-mark{
  flex:none; width:26px; height:26px; border-radius:5px;
  background:
    linear-gradient(var(--brand-line),var(--brand-line)) 5px 8px/16px 1.5px no-repeat,
    linear-gradient(var(--brand-line),var(--brand-line)) 5px 13px/16px 1.5px no-repeat,
    linear-gradient(var(--brand-line),var(--brand-line)) 5px 18px/10px 1.5px no-repeat,
    var(--rail-active);
  box-shadow:inset 0 0 0 1px rgba(169,205,184,.35);
}
.rail-name{font-family:var(--font-display); font-size:15px; font-weight:700; color:var(--rail-hi); letter-spacing:.02em}
.rail-env{font-size:11px; color:var(--rail-ink-2); letter-spacing:.06em; margin-top:1px}

.rail-nav{flex:1; padding:8px 0 20px}
.rail-group-label{
  display:flex; align-items:center; justify-content:space-between;
  padding:16px 18px 6px; font-size:10.5px; letter-spacing:.14em;
  color:var(--rail-ink-2);
}
.rail-group-label b{
  font-family:var(--font-mono); font-size:10px; font-weight:500;
  color:var(--rail-ink-2); background:var(--rail-2);
  border:1px solid var(--rail-line); border-radius:3px; padding:0 5px;
}
.rail-nav a{
  position:relative; display:grid; grid-template-columns:42px 1fr;
  gap:0 8px; align-items:baseline;
  padding:6px 18px 6px 16px; color:var(--rail-ink); font-size:13px;
  border-left:2px solid transparent; transition:background .12s, color .12s;
}
.rail-nav a:hover{background:var(--rail-2); color:var(--rail-hi); text-decoration:none}
.rail-nav a .no{
  font-family:var(--font-mono); font-size:11px; color:var(--rail-ink-2); text-align:right;
}
.rail-nav a.is-active{background:var(--rail-active); color:#fff; border-left-color:var(--seal)}
.rail-nav a.is-active .no{color:rgba(255,255,255,.72)}
.rail-nav a.is-dim{opacity:.28}
.rail-foot{
  position:sticky; bottom:0; z-index:2;
  padding:12px 18px 16px; border-top:1px solid var(--rail-line);
  background:var(--rail);
  font-size:11px; color:var(--rail-ink-2); line-height:1.55;
}

/* ---------------------------------------------------------------- 主区 */
.main{position:relative; min-width:0}
.main::before{
  content:""; position:absolute; left:15px; top:0; bottom:0; width:1px;
  background:var(--seal-line); pointer-events:none;
}

.topbar{
  position:sticky; top:0; z-index:20;
  display:flex; align-items:flex-end; justify-content:space-between; gap:24px;
  padding:20px 26px 16px 30px;
  background:rgba(243,243,233,.92); backdrop-filter:blur(8px);
  border-bottom:1px solid var(--rule);
}
.topbar h1{
  font-family:var(--font-display); font-size:23px; font-weight:700;
  margin:0; letter-spacing:.01em; color:var(--ink); text-wrap:balance;
}
.topbar-sub{margin:6px 0 0; font-size:12px; color:var(--ink-2)}
.topbar-sub b{font-family:var(--font-mono); font-weight:600; color:var(--brand-ink)}
.topbar-sub code{font-size:11px; white-space:normal}
.topbar-r{display:flex; align-items:center; gap:10px; flex:none}
.search{display:flex; align-items:center; gap:8px; background:var(--surface);
  border:1px solid var(--rule-2); border-radius:var(--r); padding:6px 10px; box-shadow:var(--shadow-sm)}
.search span{font-size:11px; letter-spacing:.1em; color:var(--ink-3); text-transform:uppercase}
.search input{
  border:0; outline:0; background:transparent; font-family:inherit; font-size:13px;
  color:var(--ink); width:232px;
}
.search input::placeholder{color:var(--ink-3)}
.search:focus-within{border-color:var(--brand-line); box-shadow:0 0 0 3px var(--brand-wash)}
.search kbd{
  font-family:var(--font-mono); font-size:10.5px; color:var(--ink-3);
  border:1px solid var(--rule-2); border-bottom-width:2px; border-radius:4px;
  padding:1px 5px; background:var(--surface-2);
}
.hit{
  font-family:var(--font-mono); font-size:11px; color:var(--ink-2);
  background:var(--surface-2); border:1px solid var(--rule);
  border-radius:999px; padding:3px 10px; white-space:nowrap;
}

.wrap{max-width:1180px; padding:8px 26px 96px 30px}

/* ---------------------------------------------------------------- 章节 */
.pg{padding:32px 0 8px; border-top:1px solid var(--rule)}
.pg:first-child{border-top:0}
.chap-lead + .pg{border-top:0; padding-top:20px}
.pg[hidden]{display:none}

.sec-head{display:flex; align-items:flex-start; gap:14px; margin:0 0 14px}
.sec-no{
  flex:none; min-width:42px; text-align:center;
  font-family:var(--font-mono); font-size:12px; font-weight:600;
  color:var(--brand-ink); background:var(--brand-wash);
  border:1px solid var(--brand-line); border-radius:5px; padding:3px 8px;
  margin-top:5px;
}
.sec-head h2{
  font-family:var(--font-display); font-size:21px; font-weight:700;
  margin:0; letter-spacing:.01em; color:var(--ink); text-wrap:balance;
}
.sec-path{
  margin:4px 0 0; font-size:11.5px; color:var(--ink-3);
  font-family:var(--font-mono); letter-spacing:.01em;
}

.sub-h{
  display:flex; align-items:center; gap:9px;
  font-size:14.5px; font-weight:600; color:var(--ink);
  margin:26px 0 10px; padding-bottom:6px; border-bottom:1px solid var(--rule);
}
.mini-h{
  font-size:13.5px; font-weight:600; color:var(--brand-ink);
  margin:22px 0 8px; padding-left:9px; border-left:3px solid var(--brand-line);
}
.tiny-h{
  font-size:12.5px; font-weight:600; color:var(--ink-2);
  margin:18px 0 6px; letter-spacing:.02em;
}

/* 引言块（title 下的那一段） */
.lead{
  margin:0 0 8px; padding:16px 18px; background:var(--surface);
  border:1px solid var(--rule); border-left:3px solid var(--brand);
  border-radius:0 var(--r) var(--r) 0; box-shadow:var(--shadow-sm);
}
.lead p{margin:8px 0; font-size:13px; color:var(--ink-2)}
.lead p:first-child{margin-top:0}
.lead p:last-child{margin-bottom:0}

/* 章引言 */
.chap-lead{
  margin:34px 0 6px; padding:18px 20px 14px;
  background:var(--surface-2);
  border:1px solid var(--rule-2); border-top:3px solid var(--brand);
  border-radius:0 0 var(--r) var(--r); box-shadow:var(--shadow-sm);
}
.chap-lead .chap-h{
  font-family:var(--font-display); font-size:19px; font-weight:700;
  margin:0 0 10px; color:var(--brand-ink); letter-spacing:.01em; text-wrap:balance;
}
.chap-lead p{margin:9px 0; font-size:13px; color:var(--ink-2)}
.chap-lead p:first-of-type{margin-top:0}
.chap-lead p:last-child{margin-bottom:0}
.chap-lead .note{margin:12px 0 4px; background:rgba(255,255,255,.55)}

p{margin:10px 0}
ul.meta, ol.meta{list-style:none; margin:12px 0 4px; padding:0; display:flex; flex-direction:column; gap:5px}
ul.meta li, ol.meta li{
  position:relative; padding-left:14px; font-size:13px; color:var(--ink-2);
}
ul.meta li::before{
  content:""; position:absolute; left:0; top:.72em;
  width:5px; height:5px; border-radius:1px; background:var(--brand-line);
}
ol.meta{counter-reset:mo}
ol.meta li::before{
  counter-increment:mo; content:counter(mo);
  position:absolute; left:0; top:.28em;
  font-family:var(--font-mono); font-size:10.5px; color:var(--brand-ink);
}
ul.meta li strong, ol.meta li strong{color:var(--ink); font-weight:600}

/* 注记 */
.note{
  margin:14px 0; padding:11px 14px 11px 15px;
  background:var(--ledger-wash);
  border:1px solid var(--ledger-line); border-left:3px solid var(--ledger);
  border-radius:0 var(--r) var(--r) 0;
}
.note-l{margin:0; font-size:12.5px; line-height:1.7; color:var(--ledger-ink)}
.note-l + .note-l{margin-top:8px; padding-top:8px; border-top:1px dashed var(--ledger-line)}
.note code{background:rgba(255,255,255,.62); border-color:var(--ledger-line); color:var(--ledger-ink)}

/* ---------------------------------------------------------------- 表格 */
.tbl-wrap{
  overflow-x:auto; margin:12px 0 18px;
  background:var(--surface); border:1px solid var(--rule);
  border-radius:var(--r); box-shadow:var(--shadow-sm);
}
table.grid{border-collapse:separate; border-spacing:0; width:100%; min-width:560px}
table.grid th{
  position:sticky; top:0; z-index:2;
  background:var(--surface-2); color:var(--ink-2);
  font-size:11.5px; font-weight:600; letter-spacing:.06em; text-align:left;
  padding:9px 11px; border-bottom:1px solid var(--rule-2); white-space:nowrap;
}
table.grid td{
  padding:9px 11px; border-bottom:1px solid var(--rule);
  vertical-align:top; line-height:1.66; font-size:13px; color:var(--ink);
  font-variant-numeric:tabular-nums;
}
table.grid tbody tr:last-child td{border-bottom:0}
table.grid tbody tr:hover{background:var(--surface-2)}
table.grid td:first-child{color:var(--brand-ink); font-weight:500}
table.grid td code{white-space:normal}
table.grid.wide td,
table.grid.wide td code{white-space:nowrap}
table.grid td strong{font-weight:600}

/* 计算逻辑代码块（``` ） */
pre.calc{
  font-family:var(--font-mono); font-size:12.5px; line-height:1.8;
  background:var(--surface-2); color:var(--ink);
  border:1px solid var(--rule); border-left:3px solid var(--brand-line);
  border-radius:0 var(--r) var(--r) 0;
  padding:12px 15px; margin:12px 0 18px;
  overflow-x:auto; white-space:pre; tab-size:2;
}

/* 行间公式（$$…$$） */
.fml{
  margin:12px 0 18px; padding:11px 15px;
  background:var(--ledger-wash); border:1px solid var(--ledger-line);
  border-radius:var(--r); overflow-x:auto; text-align:center;
  font-family:var(--font-mono); font-size:13px; color:var(--ledger-ink);
  white-space:nowrap;
}
.fml sub,.fml sup{font-size:.72em}

/* 行内公式（$…$） */
.mth{
  font-family:var(--font-mono); font-size:.94em; white-space:nowrap;
  color:var(--ledger-ink); background:var(--ledger-wash);
  border-radius:3px; padding:.5px 3px;
}
.mth sub,.mth sup{font-size:.72em}
.note .mth{background:rgba(255,255,255,.62)}

/* 分数（$…$ 公式） */
.frac{
  display:inline-grid; grid-template-rows:auto auto; vertical-align:-0.52em;
  text-align:center; margin:0 .18em; font-size:.92em; line-height:1.16;
}
.frac .fn{padding:0 .28em; border-bottom:1px solid currentColor}
.frac .fd{padding:0 .28em}

.doc-foot{
  max-width:74ch; margin:36px 0 0; padding-top:16px;
  border-top:1px solid var(--rule);
  font-size:11.5px; line-height:1.75; color:var(--ink-3);
}
.doc-foot code{font-size:11px; white-space:normal}

::selection{background:var(--brand-wash)}

/* ---------------------------------------------------------------- 打印 */
@media print{
  :root{--paper:#fff; --surface:#fff; --surface-2:#fff}
  body{background:#fff; background-image:none; font-size:10.5pt}
  .rail,.topbar-r,.main::before{display:none}
  .shell{grid-template-columns:1fr}
  .topbar{position:static; background:#fff; backdrop-filter:none; padding:0 0 10px}
  .wrap{max-width:none; padding:0}
  .pg{page-break-inside:auto; padding-top:14px}
  .sec-head{page-break-after:avoid}
  .sub-h,.mini-h{page-break-after:avoid}
  table.grid{min-width:0}
  table.grid th{position:static; background:#f2f2f2}
  .tbl-wrap{overflow:visible; box-shadow:none; page-break-inside:avoid}
  .note,pre.calc,.fml{page-break-inside:avoid}
  a{color:inherit; text-decoration:none}
}

@media (max-width:960px){
  .shell{grid-template-columns:1fr}
  .rail{position:static; height:auto; max-height:52vh}
  .main::before{display:none}
  .topbar{position:static; flex-direction:column; align-items:stretch; gap:12px}
  .search input{width:100%}
  .wrap{padding-left:20px}
}
"""

TEMPLATE = r"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>@@TITLE@@</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Noto+Serif+SC:wght@600;700&display=swap">
<style>
@@CSS@@
</style>
</head>
<body>
<div class="shell">
<aside class="rail">
  <div class="rail-brand">
    <span class="rail-mark" aria-hidden="true"></span>
    <div>
      <div class="rail-name">财务库存中心</div>
      <div class="rail-env">一期计算示例 v1.0</div>
    </div>
  </div>
  <nav class="rail-nav" id="nav">
    @@NAV@@
  </nav>
  <div class="rail-foot">@@RAILFOOT@@</div>
</aside>
<main class="main">
  <header class="topbar">
    <div class="topbar-l">
      <h1>@@H1@@</h1>
      <p class="topbar-sub">出入库计算示例 · 仓库／一级货主／二级产权人三个维度 ·
        <b>@@NSEC@@</b> 节 · <b>@@NTBL@@</b> 张表 · <b>@@NCODE@@</b> 段计算逻辑
      </p>
    </div>
    <div class="topbar-r">
      <label class="search">
        <span>筛选</span>
        <input id="q" type="search" placeholder="单据 / 字段 / 金额 / 公式…" autocomplete="off">
        <kbd>/</kbd>
      </label>
      <span class="hit" id="hit">全部</span>
    </div>
  </header>
  <div class="wrap" id="doc">
    <div class="lead">@@LEAD@@</div>
@@BODY@@
    @@FOOT@@
  </div>
</main>
</div>
<script>
(function(){
  var q=document.getElementById('q'), hit=document.getElementById('hit');
  var secs=[].slice.call(document.querySelectorAll('#doc .pg'));
  var all=[].slice.call(document.querySelectorAll('#nav a'));
  function run(){
    var v=q.value.trim().toLowerCase(), n=0;
    secs.forEach(function(s){
      var ok=!v||s.textContent.toLowerCase().indexOf(v)>-1;
      s.hidden=!ok;
      if(ok)n++;
      var a=document.querySelector('#nav a[data-sec="'+s.id+'"]');
      if(a)a.classList.toggle('is-dim',!ok);
    });
    hit.textContent=v?(n+' 节匹配'):'全部';
  }
  q.addEventListener('input',run);
  document.addEventListener('keydown',function(e){
    if(e.key==='/'&&document.activeElement!==q){e.preventDefault();q.focus();}
    if(e.key==='Escape'&&document.activeElement===q){q.value='';run();q.blur();}
  });
  var io=new IntersectionObserver(function(es){
    es.forEach(function(e){
      if(!e.isIntersecting)return;
      var id=e.target.id;
      all.forEach(function(a){
        a.classList.toggle('is-active',a.getAttribute('href')==='#'+id);
      });
    });
  },{rootMargin:'-72px 0px -70% 0px',threshold:0});
  secs.forEach(function(s){io.observe(s);});
  run();
})();
</script>
</body>
</html>
"""

doc = (TEMPLATE
       .replace("@@TITLE@@", H.escape(title or "财务库存中心（一期）计算示例"))
       .replace("@@CSS@@", CSS)
       .replace("@@NAV@@", "\n    ".join(nav))
       .replace("@@RAILFOOT@@", RAIL_FOOT)
       .replace("@@H1@@", H.escape(title or "财务库存中心（一期）计算示例"))
       .replace("@@NSEC@@", str(n_sec))
       .replace("@@NTBL@@", str(n_tbl))
       .replace("@@NCODE@@", str(n_code))
       .replace("@@LEAD@@", lead_html)
       .replace("@@BODY@@", body_html)
       .replace("@@FOOT@@", DOC_FOOT.replace("@@SRC@@", H.escape(SRC))
                                  .replace("@@GEN@@", H.escape("build_calc_doc.py"))
                                  .replace("@@AUTH@@", H.escape(AUTH))))

open(OUT, "w", encoding="utf-8").write(doc)
print("wrote", OUT, len(doc), "chars /", len(doc.split("\n")), "lines")
print("章", chapter_list)
print("节", n_sec, "表", n_tbl, "计算逻辑块", n_code,
      "锚点", len(used_ids))
