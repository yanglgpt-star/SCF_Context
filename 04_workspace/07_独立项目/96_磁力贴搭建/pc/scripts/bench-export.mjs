/**
 * M4 验收台之三：对**导出的 SVG 字符串**做断言。
 *
 * 为什么不做像素级 diff：那要起无头浏览器、要有基准图、字体渲染差一个像素就红，
 * 成本高且脆。而导出图出问题的方式其实很有限，全都能在字符串上抓住：
 *
 *   带 `var(--x)` 出去      → `<img>` 里读不到 CSS 变量，出来是一张透明或全黑的图
 *   带 `class="mc-tile"` 出去 → 同上，样式在页面里，图片里没有
 *   颜色不是 hex            → 同上，只是更隐蔽
 *   底色 rect 丢了          → 社交平台把透明当黑色，发出去是黑框
 *   片数对不上              → 少画了片，图看着"挺正常"但和 work.json 不一致
 *
 * 这几条正是「导出的图和画布所见一致」这句话能被机器验证的部分。
 * 剩下那部分（真的长得一样）靠页面并排显示来验。
 *
 *   node scripts/bench-export.mjs
 *   node scripts/bench-export.mjs --verbose     打印导出的 SVG 全文
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { solveContour } from '../src/core/solver/solve.js'
import { stockToShapeMap } from '../src/core/model/stock.js'
import { COLOR_NAMES, colorHex } from '../src/core/model/palette.js'
import { analyzeWork } from '../src/core/model/work.js'
import { CONTOURS } from '../src/core/solver/contours.js'
import { buildExportSvg } from '../src/components/MosaicCanvas/exportSvg.js'
import { tileSvgAttrs } from '../src/components/MosaicCanvas/paint.js'
import { tokens } from '../src/theme.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const LIB = resolve(HERE, '../../library')
const verbose = process.argv.includes('--verbose')

const stock = stockToShapeMap(JSON.parse(readFileSync(resolve(LIB, 'stock.json'), 'utf8')).items)
const HEX = /#[0-9A-Fa-f]{6}\b/g

/* ---------------- 造一份真实的 work：跑求解器，不手写 ---------------- */
// 手写的 fixture 只能测出「我以为 work.json 长什么样」；跑一遍求解器拿到的
// 是**真的**会落盘的那份数据，字段名、canvas、tiles 的形状都是真的。
function makeWork(id) {
  const contour = CONTOURS.find((c) => c.id === id)
  const sol = solveContour({ poly: contour.poly, stock, palette: COLOR_NAMES, options: { seedKey: id } })
  const analysis = analyzeWork({ workId: `W-export-${id}`, canvas: sol.canvas, tiles: sol.tiles })
  if (!analysis.ok || analysis.work.tiles.length === 0) {
    throw new Error(`用例 ${id} 没解出可用的 work，导出测试没法进行`)
  }
  return { work: analysis.work, contour: contour.poly }
}

const problems = []
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '过' : '✗ 不过'}  ${name}${detail ? `   ${detail}` : ''}`)
  if (!ok) problems.push(name)
}

for (const id of ['sq4', 'house', 'thickL', 'plus']) {
  const { work, contour } = makeWork(id)
  const svg = buildExportSvg({ work, contour })
  const n = work.tiles.length

  console.log(`\n── ${id}（${work.canvas.cols}×${work.canvas.rows}，${n} 片，${svg.length} 字符）`)

  // 1) 自包含：不许有页面才认得的引用
  check('没有 var(', !svg.includes('var('), svg.includes('var(') ? svg.match(/var\([^)]*\)/)[0] : '')
  check('没有 class=', !svg.includes('class='))
  check('没有 <style', !svg.includes('<style'))
  check('没有 url(#', !svg.includes('url(#'))

  // 2) 有底色 rect，且底色跟 work.canvas.background 一致
  const sheet = work.canvas.background ?? tokens.canvas
  check('有画布底色 rect', svg.includes(`fill="${sheet}"`), sheet)

  // 3) 所有 fill/stroke 值都是 hex 或 none —— 抓到「混进一个命名色或 rgb()」这种
  const loose = [...svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((v) => v !== 'none' && !/^#[0-9A-Fa-f]{6}$/.test(v))
  check('fill/stroke 全是 hex 或 none', loose.length === 0, loose.length ? `混进了 ${JSON.stringify([...new Set(loose)])}` : '')

  // 4) 片数对得上：每片一个 <path d="M...Z"> + 它的磁铁点
  const tilePaths = work.tiles.map((t) => tileSvgAttrs(t, { nonScalingStroke: false }).path.d)
  const missing = tilePaths.filter((d) => !svg.includes(`d="${d}"`))
  check(`${n} 片一片不少`, missing.length === 0, missing.length ? `少了 ${missing.length} 片` : '')

  const magnetCount = work.tiles.reduce(
    (sum, t) => sum + tileSvgAttrs(t, { nonScalingStroke: false }).magnets.length,
    0,
  )
  const circles = (svg.match(/<circle /g) ?? []).length
  check('磁铁点数对得上', circles === magnetCount, `期望 ${magnetCount}，实际 ${circles}`)

  // 5) 网格线：给了 gridPath 才有，且是一条 path 而不是 cols+rows 个节点
  const gridOn = (svg.match(/<path /g) ?? []).length
  check('网格线只占一个 path 节点', gridOn === 1 + n + (svg.includes('stroke-dasharray="7 5"') ? 1 : 0), `总 path ${gridOn} 条`)

  // 6) 轮廓虚线：给了 contour 才叠，且颜色是 ink 而不是 brand 红
  if (contour) {
    check('轮廓叠在最上层且是虚线', svg.includes('stroke-dasharray="7 5"'))
    check('轮廓用 ink 而不是 brand', svg.includes(`stroke="${tokens.ink}"`))
  }

  // 7) 尺寸：显式 width/height（没有它 <img> 拿不到固有尺寸），且和 viewBox 比例一致
  const wh = svg.match(/width="(\d+)" height="(\d+)"/)
  const vb = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/)
  check('根节点有 width/height 和 viewBox', Boolean(wh && vb))
  if (wh && vb) {
    const ratio = (Number(wh[1]) / Number(wh[2])).toFixed(4)
    const want = (Number(vb[3]) / Number(vb[4])).toFixed(4)
    check('出图比例与画布一致', ratio === want, `${ratio} vs ${want}`)
  }

  // 8) 属性值里不许有裸的 < & "（会把 XML 拼坏）
  const attrVals = [...svg.matchAll(/="([^"]*)"/g)].map((m) => m[1])
  check('属性值里没有裸 & 或 <', !attrVals.some((v) => /[<&]/.test(v)))

  if (verbose) console.log(`\n${svg}`)
}

// 9) 颜色来源：抓「某一层用了主题和色卡以外的颜色」
//
// 白名单 = theme.tokens 全部 + 色卡全部。除此之外只允许一种东西：`paint.shade()`
// 的产物，也就是白名单里某个颜色**按同一个比例压暗三个通道**。
//
// 这里不照抄 0.68 / 0.78 那两个倍数 —— 抄了就等于把 paint.js 的魔法数字复制到 bench 里，
// 改了 paint 而忘了 bench，断言会以一种很难懂的方式红。改成断言**形状**：
// 存在一个 k ≤ 1，使候选色的三个通道都 ≈ 白名单里某色的三个通道 × k。
// 哪个倍数、改没改，都不影响这条断言，它抓的是「这个颜色是不是从调色板派生出来的」。
const { work } = makeWork('house')
const svg = buildExportSvg({ work })
const used = [...new Set(svg.match(HEX))].map((h) => h.toUpperCase())

const chan = (h) => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const allowed = new Set([...Object.values(tokens), ...COLOR_NAMES.map((c) => colorHex(c))].map((h) => h.toUpperCase()))
const isShadeOf = (h) => {
  const c = chan(h)
  return [...allowed].some((a) => {
    const ac = chan(a)
    // k 从**最大**的那个通道反推：那里 |舍入误差| / 通道值 最小，反推出来的 k 最准。
    // 从最小通道反推会把相对误差放大好几倍，让一个真正的 shade 产物差 1.15 而不过。
    const big = ac.indexOf(Math.max(...ac))
    if (!ac[big]) return false
    const k = c[big] / ac[big]
    if (k <= 0 || k > 1) return false
    // 容差 1.5 而不是 1：shade() 对每个通道各做一次 Math.round，各能差 0.5，
    // 反推 k 又带一点点误差，加起来 1 是不够的。
    return c.every((v, i) => Math.abs(v - ac[i] * k) <= 1.5)
  })
}
console.log(`\n── 配色来源（${used.length} 种颜色）`)
const stray = used.filter((h) => !allowed.has(h) && !isShadeOf(h))
check('导出的颜色要么来自 theme.tokens，要么是色卡压暗来的', stray.length === 0, stray.join(' '))

console.log('─'.repeat(70))
console.log(problems.length ? `✗ ${problems.length} 条不过：\n  ${problems.join('\n  ')}` : '全部断言通过')
process.exit(problems.length ? 1 : 0)
