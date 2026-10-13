#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""md -> 账页 HTML（财务库存中心一期文档阅读版）。无第三方依赖。

用法：
    python3 02_tools/md2html.py <输入.md> [输出.html] [--mermaid <mermaid.min.js>] [--kicker 文字]

不带 --mermaid 时输出无图版本；带则把 mermaid bundle 内联进 HTML（离线可用）。
版式令牌取自 04_workspace/01_prd/14_财务库存中心/财务库存中心（一期）PC端界面.html，
为单一固定状态（不跟随系统主题）。
"""
import re, sys, html, os

def esc(s): return html.escape(s, quote=False)

_ITAL = re.compile(r'(?<![\*\w])\*([^\*\s][^\*\n]*?)\*(?!\*)')
_BOLD = re.compile(r'\*\*(.+?)\*\*')
_LINK = re.compile(r'\[([^\]]+)\]\(([^)\s]+)\)')

def inline(s):
    codes = []
    s = re.sub(r'`([^`]+)`', lambda m: (codes.append(m.group(1)), "\x00%d\x00" % (len(codes)-1))[1], s)
    s = esc(s).replace('&lt;br&gt;', '<br>')   # 尊重作者手写的单元格内换行
    s = _LINK.sub(lambda m: '<a href="%s" target="_blank" rel="noopener">%s</a>' % (esc(m.group(2)), m.group(1)), s)
    s = _BOLD.sub(r'<strong>\1</strong>', s)
    s = _ITAL.sub(r'<em>\1</em>', s)
    return re.sub(r'\x00(\d+)\x00', lambda m: '<code>%s</code>' % esc(codes[int(m.group(1))]), s)

BR = '\x01'

def inline_br(parts):
    return inline(BR.join(parts)).replace(BR, '<br>')

# ---------------- 表 ----------------
def split_row(line):
    t = line.strip()
    if t.startswith('|'): t = t[1:]
    if t.endswith('|'):   t = t[:-1]
    cells, buf, incode = [], '', False
    for ch in t:
        if ch == '`': incode = not incode; buf += ch
        elif ch == '|' and not incode: cells.append(buf); buf = ''
        else: buf += ch
    cells.append(buf)
    return [c.strip() for c in cells]

_NUM = re.compile(r'^[+\-−]?[\d,]+(\.\d+)?%?$')
def num_cell(c):
    t = re.sub(r'\*\*|`|\s', '', c)
    if t in ('', '—', '-', '——', '－'): return None
    return bool(_NUM.match(t))

def disp_w(s):
    """显示宽度：CJK 记 2，其余记 1。"""
    return sum(2 if ord(c) > 0x2000 else 1 for c in s)

def render_table(rows):
    head = split_row(rows[0])
    body = [split_row(r) for r in rows[2:]]
    ncol = len(head)
    align, nowrap = [], []
    for c in range(ncol):
        vals = [num_cell(r[c]) for r in body if c < len(r)]
        vals = [v for v in vals if v is not None]
        align.append(len(vals) >= 2 and sum(vals) / len(vals) >= 0.6)
        widths = [disp_w(re.sub(r'\*\*|`', '', head[c]))]
        for r in body:
            cell = r[c] if c < len(r) else ''
            if BR in cell: widths = [999]; break          # 作者手写换行 => 本来就是多行
            widths.append(disp_w(re.sub(r'\*\*|`', '', cell)))
        nowrap.append(max(widths) <= 14)
    def cls(i):
        t = []
        if align[i]: t.append('num')
        if nowrap[i]: t.append('nw')
        return ' class="%s"' % ' '.join(t) if t else ''
    o = ['<div class="tw"><table><thead><tr>']
    for i, h in enumerate(head): o.append('<th%s>%s</th>' % (cls(i), inline(h)))
    o.append('</tr></thead><tbody>')
    for r in body:
        o.append('<tr>')
        for i in range(ncol):
            cell = r[i] if i < len(r) else ''
            o.append('<td%s>%s</td>' % (cls(i), inline(cell)))
        o.append('</tr>')
    o.append('</tbody></table></div>')
    return ''.join(o)

# ---------------- 列表 ----------------
def render_list(lines):
    items = []
    for ln in lines:
        m = re.match(r'^(\s*)([-*+]|\d+\.)\s+(.*)$', ln)
        if m:
            items.append((0 if len(m.group(1)) < 2 else 1, m.group(3)))
        elif items and ln.strip():
            d, t = items[-1]; items[-1] = (d, t + BR + ln.strip())
    pos = [0]
    def render(level):
        res = ['<ul class="lst">']
        while pos[0] < len(items):
            d, t = items[pos[0]]
            if d < level: break
            if d > level:
                res.append(render(level + 1)); continue
            pos[0] += 1
            res.append('<li>%s' % inline(t).replace(BR, '<br>'))
            if pos[0] < len(items) and items[pos[0]][0] > level:
                res.append(render(level + 1))
            res.append('</li>')
        res.append('</ul>')
        return ''.join(res)
    return render(0)

# ---------------- 块 ----------------
STOP = re.compile(r'^(#{1,6} |\||>|```)')
LI   = re.compile(r'^\s*([-*+]|\d+\.)\s')
HR   = re.compile(r'^\s*(-{3,}|\*{3,})\s*$')

def parse(L, anchors):
    i, n, out = 0, len(L), []
    while i < n:
        s = L[i]
        if not s.strip(): i += 1; continue
        if s.startswith('```'):
            lang = s[3:].strip(); j = i + 1; buf = []
            while j < n and not L[j].startswith('```'): buf.append(L[j]); j += 1
            body = '\n'.join(buf)
            out.append('<div class="diagram"><pre class="mermaid">%s</pre></div>' % esc(body) if lang == 'mermaid'
                       else '<div class="code"><pre><code>%s</code></pre></div>' % esc(body))
            i = j + 1; continue
        m = re.match(r'^(#{1,6})\s+(.*)$', s)
        if m:
            lv = len(m.group(1)); txt = m.group(2).strip()
            aid = 'sec%d' % len(anchors)
            anchors.append((lv, aid, re.sub(r'<[^>]+>', '', inline(txt)).replace('&amp;', '&')))
            out.append('<h%d id="%s">%s</h%d>' % (lv, aid, inline(txt), lv)); i += 1; continue
        if HR.match(s): out.append('<hr>'); i += 1; continue
        if s.lstrip().startswith('>'):
            j = i; buf = []
            while j < n and L[j].lstrip().startswith('>'):
                buf.append(re.sub(r'^\s*>\s?', '', L[j])); j += 1
            raw = '\n'.join(buf)
            cls = ' bq-warn' if '⚠️' in raw else (' bq-note' if raw.lstrip().startswith('**要点') else '')
            out.append('<blockquote class="bq%s">%s</blockquote>' % (cls, parse(buf, anchors)))
            i = j; continue
        if s.lstrip().startswith('|'):
            j = i; rows = []
            while j < n and L[j].lstrip().startswith('|'): rows.append(L[j]); j += 1
            out.append(render_table(rows) if (len(rows) >= 2 and re.match(r'^[\s\|:\-]+$', rows[1]))
                       else '<p>%s</p>' % inline_br(rows))
            i = j; continue
        if LI.match(s):
            j = i; items = []
            while j < n:
                ln = L[j]
                if LI.match(ln): items.append(ln); j += 1
                elif ln.strip() and not STOP.match(ln) and ln[:1] in (' ', '\t'): items.append(ln); j += 1
                else: break
            out.append(render_list(items)); i = j; continue
        j = i; buf = []
        while j < n and L[j].strip() and not STOP.match(L[j]) and not LI.match(L[j]) and not HR.match(L[j]):
            buf.append(L[j]); j += 1
        out.append('<p>%s</p>' % inline_br(buf)); i = j
    return '\n'.join(out)

CSS = r"""
:root{
  --paper:#F3F3E9; --surface:#FFFEF9; --surface-2:#EDECE0;
  --ink:#1A2119; --ink-2:#53604E; --ink-3:#7C8874; --rule:#DAD8C5; --rule-2:#C4C1A9;
  --brand:#1F5C46; --brand-ink:#14402F; --brand-wash:#E2EFE7; --brand-line:#A9CDB8;
  --ledger:#9B6520; --ledger-ink:#714913; --ledger-wash:#F8EEDA; --ledger-line:#DFC08A;
  --warn:#8A5A08; --warn-wash:#FBF0DA;
  --seal:#B2422A; --seal-line:rgba(178,66,42,.30);
  --rail:#14231C; --rail-2:#1C3128; --rail-line:#274334; --rail-ink:#8CA79A; --rail-ink-2:#5E7A6C; --rail-hi:#E9F1EA;
  --rule-step:24px;
  --shadow:0 2px 4px rgba(31,46,36,.05),0 10px 28px rgba(31,46,36,.07);
  --font-ui:"Inter",-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  --font-display:"Noto Serif SC","Songti SC","Source Han Serif SC",Georgia,serif;
  --font-mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--font-ui);font-size:15px;line-height:1.78;-webkit-font-smoothing:antialiased}
.wrap{display:grid;grid-template-columns:300px minmax(0,1fr);min-height:100vh}
.rail{background:var(--rail);color:var(--rail-ink);position:sticky;top:0;height:100vh;display:flex;flex-direction:column;border-right:1px solid var(--rail-line)}
.rail-head{padding:20px 20px 16px;border-bottom:1px solid var(--rail-line)}
.rail-kicker{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.16em;color:var(--rail-ink-2);text-transform:uppercase}
.rail-title{font-family:var(--font-display);font-size:17px;line-height:1.45;color:var(--rail-hi);margin-top:8px;font-weight:600}
.rail-meta{margin-top:10px;font-family:var(--font-mono);font-size:11px;color:var(--rail-ink-2)}
.toc{overflow-y:auto;padding:12px 10px 40px;flex:1;scrollbar-width:thin}
.toc::-webkit-scrollbar{width:8px}.toc::-webkit-scrollbar-thumb{background:var(--rail-line);border-radius:4px}
.toc a{display:block;text-decoration:none;color:var(--rail-ink);border-radius:5px;padding:5px 10px;font-size:13px;line-height:1.5;border-left:2px solid transparent}
.toc a:hover{color:var(--rail-hi);background:var(--rail-2)}
.toc a.t1{margin-top:16px;font-family:var(--font-mono);font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--rail-ink-2);padding:4px 10px 6px;border-left-color:var(--brand)}
.toc a.t2{font-weight:600;color:#B9CFC2}
.toc a.t2.on{background:var(--brand);color:#fff;border-left-color:var(--seal)}
.toc a.t3{padding-left:22px;font-size:12.2px;color:var(--rail-ink-2)}
.toc a.t3.on{color:var(--rail-hi);background:var(--rail-2);border-left-color:var(--brand-line)}
.page{padding:0 34px 90px;background-image:repeating-linear-gradient(180deg,transparent 0 calc(var(--rule-step) - 1px),rgba(31,92,70,.062) calc(var(--rule-step) - 1px) var(--rule-step))}
.sheet{max-width:1000px;margin:34px auto 0;background:var(--surface);border:1px solid var(--rule);border-radius:10px;box-shadow:var(--shadow);padding:46px 54px 60px;position:relative}
.sheet::before{content:"";position:absolute;left:22px;top:0;bottom:0;width:1px;background:var(--seal-line)}
.doc-head{border-bottom:2px solid var(--rule-2);padding-bottom:20px;margin-bottom:34px}
.doc-head .kicker{font-family:var(--font-mono);font-size:11px;letter-spacing:.16em;color:var(--ledger);text-transform:uppercase}
.doc-head h1.doc-title{font-family:var(--font-display);font-size:31px;line-height:1.3;margin:12px 0 0;color:var(--ink);font-weight:700}
.doc-head .sub{margin-top:10px;font-family:var(--font-mono);font-size:12px;color:var(--ink-3)}
article.doc > h1:first-child{display:none}
h1{font-family:var(--font-display);font-size:25px;line-height:1.35;font-weight:700;color:var(--brand-ink);margin:70px 0 26px;padding:18px 0 0;border-top:2px solid var(--ledger-line)}
h1::before{content:"篇";display:inline-block;font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;color:#fff;background:var(--ledger);border-radius:3px;padding:2px 6px;margin-right:10px;vertical-align:3px}
h2{font-family:var(--font-display);font-size:20.5px;line-height:1.45;font-weight:600;color:var(--brand);margin:52px 0 18px;padding-left:13px;border-left:4px solid var(--brand)}
h3{font-size:16.5px;font-weight:650;color:var(--ink);margin:38px 0 14px;padding-bottom:7px;border-bottom:1px solid var(--rule)}
h4,h5,h6{font-size:15px;font-weight:650;color:var(--ink-2);margin:26px 0 10px}
p{margin:0 0 14px}
strong{color:var(--brand-ink);font-weight:650}
a{color:var(--brand);text-decoration:none;border-bottom:1px solid var(--brand-line)}
a:hover{border-bottom-color:var(--brand)}
code{font-family:var(--font-mono);font-size:12.4px;background:var(--surface-2);border:1px solid var(--rule);border-radius:4px;padding:1px 5px;color:var(--ledger-ink);white-space:nowrap}
hr{border:0;border-top:1px dashed var(--rule-2);margin:46px 0}
ul.lst{margin:0 0 16px;padding-left:22px}ul.lst li{margin:5px 0}ul.lst ul{margin:5px 0;padding-left:20px}
.tw{overflow-x:auto;margin:0 0 20px}
table{border-collapse:collapse;width:100%;font-size:13.4px;line-height:1.62;font-variant-numeric:tabular-nums}
thead th{background:var(--brand-wash);color:var(--brand-ink);text-align:left;font-weight:650;padding:9px 12px;border-bottom:2px solid var(--brand-line);white-space:nowrap;font-size:12.8px}
tbody td{padding:8px 12px;border-bottom:1px solid var(--rule);vertical-align:top}
tbody tr:nth-child(even){background:#FBFAF0}
tbody tr:hover{background:var(--brand-wash)}
th.num,td.num{text-align:right}
th.nw,td.nw{white-space:nowrap}
td code,th code{white-space:nowrap;background:transparent;border:0;padding:0;font-size:12.6px}
tbody td:first-child{color:var(--ink-2)}
blockquote .tw{margin-bottom:12px}
.code{margin:0 0 20px;border:1px solid var(--rule);border-left:3px solid var(--ledger);border-radius:0 8px 8px 0;background:#FBFAF1;overflow:hidden}
.code pre{margin:0;padding:15px 18px;overflow-x:auto}
.code code{font-family:var(--font-mono);font-size:12.7px;line-height:1.72;color:var(--ink);background:transparent;border:0;padding:0;white-space:pre;tab-size:4}
blockquote.bq{margin:0 0 20px;padding:14px 18px;background:var(--brand-wash);border-left:3px solid var(--brand-line);border-radius:0 8px 8px 0}
blockquote.bq > *:last-child{margin-bottom:0}
blockquote.bq p{margin-bottom:10px}
blockquote.bq.bq-note{background:var(--ledger-wash);border-left-color:var(--ledger)}
blockquote.bq.bq-warn{background:var(--warn-wash);border-left-color:var(--warn);color:#4A3208}
blockquote.bq.bq-warn strong{color:#6B4406}
blockquote.bq blockquote.bq{margin:10px 0;background:rgba(255,255,255,.55)}
blockquote.bq code{background:rgba(255,255,255,.72)}
blockquote.bq .code{background:rgba(255,255,255,.66);border-color:var(--rule-2)}
blockquote.bq table{background:rgba(255,255,255,.55)}
blockquote.bq thead th{background:rgba(255,255,255,.5)}
.diagram{margin:0 0 22px;padding:16px;background:#FCFBF4;border:1px solid var(--rule);border-radius:8px;overflow-x:auto}
.diagram pre.mermaid{margin:0;background:transparent;text-align:center;font-family:var(--font-mono);font-size:12px;color:var(--ink-2);white-space:pre;overflow-x:auto}
.toTop{position:fixed;right:26px;bottom:26px;background:var(--brand);color:#fff;border:0;width:42px;height:42px;border-radius:50%;cursor:pointer;font-size:17px;box-shadow:var(--shadow);opacity:0;transition:opacity .2s;pointer-events:none}
.toTop.on{opacity:1;pointer-events:auto}
@media (max-width:1080px){.wrap{grid-template-columns:1fr}.rail{position:static;height:auto;border-right:0;border-bottom:1px solid var(--rail-line)}.toc{max-height:280px}.page{padding:0 16px 70px}.sheet{padding:30px 22px 44px;margin-top:18px}}
@media print{.rail,.toTop{display:none}body{background:#fff}.page{background:none;padding:0}.sheet{box-shadow:none;border:0;margin:0;max-width:none;padding:0}h1,h2,h3{break-after:avoid}.tw,.code,.diagram,table,blockquote{break-inside:avoid}}
"""

JS = """
var toc=document.querySelector('.toc');
var links=[].slice.call(toc.querySelectorAll('a'));
var heads=links.map(function(a){return document.getElementById(a.getAttribute('href').slice(1));});
function spy(){
  var y=window.scrollY+150,best=0;
  for(var i=0;i<heads.length;i++){if(heads[i]&&heads[i].offsetTop<=y)best=i;}
  links.forEach(function(a,i){a.classList.toggle('on',i===best&&a.dataset.lv!=='1');});
  var act=links[best];
  if(act&&act.dataset.lv!=='1'){
    var r=act.getBoundingClientRect(),t=toc.getBoundingClientRect();
    if(r.top<t.top+46||r.bottom>t.bottom-46)act.scrollIntoView({block:'nearest'});
  }
}
document.addEventListener('scroll',spy,{passive:true});spy();
var tt=document.getElementById('tt');
tt.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'});});
window.addEventListener('scroll',function(){tt.classList.toggle('on',window.scrollY>600);},{passive:true});
"""

def build(md_path, out_path, kicker, mermaid_js=None):
    raw = open(md_path, encoding="utf-8").read().replace("\r\n", "\n")
    L = raw.split("\n")
    h1 = next((s[2:].strip() for s in L if s.startswith("# ")), "")
    anchors = []
    body = parse(L, anchors)
    tnav = ['<a class="t%d" href="#%s" data-lv="%d">%s</a>' % (lv, aid, lv, esc(txt))
            for lv, aid, txt in anchors if lv <= 3]
    m = re.search(r'版本[:：]\s*([^\n（(]+)', raw)
    version = m.group(1).strip() if m else ""
    mm = ""
    if mermaid_js and os.path.exists(mermaid_js):
        js = open(mermaid_js, encoding="utf-8").read()
        mm = ('<script>%s</script>\n<script>(function(){var m=window.mermaid||'
              '(window.__esbuild_esm_mermaid_nm&&window.__esbuild_esm_mermaid_nm.mermaid);'
              'if(!m){return;}m.initialize({startOnLoad:true,securityLevel:"loose",theme:"base",'
              'themeVariables:{fontFamily:"Inter,-apple-system,PingFang SC,Hiragino Sans GB,sans-serif",fontSize:"13px",'
              'lineColor:"#53604E",clusterBkg:"#F3F3E9",clusterBorder:"#C4C1A9",'
              'edgeLabelBackground:"#FFFEF9",titleColor:"#14402F",tertiaryColor:"#FBFAF1"}});})();</script>') % js
    doc = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>%s</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Noto+Serif+SC:wght@600;700&display=swap">
<style>%s</style></head>
<body><div class="wrap">
<aside class="rail"><div class="rail-head">
<div class="rail-kicker">财务库存中心 · 一期</div>
<div class="rail-title">%s</div>
<div class="rail-meta">%s</div>
</div><nav class="toc">%s</nav></aside>
<main class="page"><div class="sheet">
<header class="doc-head"><div class="kicker">%s</div><h1 class="doc-title">%s</h1>
<div class="sub">%s</div></header>
<article class="doc">%s</article>
</div></main></div>
<button class="toTop" id="tt" aria-label="回到顶部">↑</button>
<script>%s</script>
%s
</body></html>""" % (esc(h1), CSS, esc(h1), esc(version), '\n'.join(tnav),
                     esc(kicker), esc(h1), esc(version), body, JS, mm)
    open(out_path, "w", encoding="utf-8").write(doc)
    return len(doc)


def _cli():
    import argparse
    ap = argparse.ArgumentParser(description="md -> 账页 HTML")
    ap.add_argument("src")
    ap.add_argument("dst", nargs="?", default=None)
    ap.add_argument("--mermaid", default=None, help="mermaid bundle 的 js 路径，内联进 HTML")
    ap.add_argument("--kicker", default="财务库存中心 · 一期")
    a = ap.parse_args()
    dst = a.dst or os.path.splitext(a.src)[0] + ".html"
    n = build(a.src, dst, a.kicker, mermaid_js=a.mermaid)
    print("%s  (%d bytes)" % (dst, n))


if __name__ == "__main__":
    _cli()
