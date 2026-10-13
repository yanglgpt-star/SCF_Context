/**
 * M4 验收台之二：跑轮廓提取用例，看**决策**对不对 —— 走的哪条路、退没退、退的时候说没说。
 *
 * 这个台子跟 `bench-snap` 的分工：那边管「一个顶点序列能不能吸附到网格」，纯几何；
 * 这边管「两套表示怎么挑」，纯判断。所以在两边都跑了以后，从 AI 响应到求解器输入
 * 这一段就没有没测过的分支了。
 *
 *   node scripts/bench-extract.mjs
 *   node scripts/bench-extract.mjs --verbose     打印 notes / problems / 最终顶点
 *   node scripts/bench-extract.mjs --only noisyMask
 */
import { CASES, checkExtractInvariants, runCase } from '../src/core/outline/extractCases.js'
import { polygonArea } from '../src/core/contour/polygon.js'

const argv = process.argv.slice(2)
const verbose = argv.includes('--verbose')
const onlyAt = argv.indexOf('--only')
const only = onlyAt >= 0 ? argv[onlyAt + 1] : null

const near = (a, b) => Math.abs(a - b) < 1e-3

function check(c, r) {
  const bad = []
  const e = c.expect

  if (r.ok !== e.ok) bad.push(`ok 期望 ${e.ok}，实际 ${r.ok}`)
  if (e.path != null && r.path !== e.path) bad.push(`path 期望 ${e.path}，实际 ${r.path ?? '（空）'}`)
  if (e.area != null && (!r.ok || !near(polygonArea(r.poly), e.area))) {
    bad.push(`面积期望 ${e.area}，实际 ${r.ok ? polygonArea(r.poly).toFixed(2) : '（失败）'}`)
  }

  for (const [field, bag] of [['reasonIncludes', r.reason], ['notesInclude', r.notes.join('|')], ['problemsInclude', r.problems.join('|')]]) {
    if (e[field] == null) continue
    for (const needle of [].concat(e[field])) {
      if (!bag.includes(needle)) bad.push(`${field} 里没出现「${needle}」：${bag || '（空）'}`)
    }
  }

  for (const [side, want] of Object.entries(e.attempts ?? {})) {
    const got = r.attempts[side]
    if (want === 'not-tried') {
      if (got.tried) bad.push(`attempts.${side} 期望「没试过」，实际试过了（${got.reasonCode ?? '成功'}）`)
    } else if (!got.tried || got.reasonCode !== want) {
      bad.push(`attempts.${side}.reasonCode 期望 ${want}，实际 ${got.tried ? got.reasonCode ?? '（成功）' : '没试过'}`)
    }
  }

  for (const msg of checkExtractInvariants(r)) bad.push(msg)
  return bad
}

const rows = []
let slowest = 0

for (const c of CASES) {
  if (only && c.id !== only) continue
  const t0 = performance.now()
  const r = runCase(c)
  const ms = performance.now() - t0
  slowest = Math.max(slowest, ms)
  rows.push({ c, r, ms, bad: check(c, r) })
}

const pad = (s, n) => String(s).padEnd(n, ' ')
const padL = (s, n) => String(s).padStart(n, ' ')

console.log(`${pad('用例', 18)}${pad('走的路', 20)}${padL('顶点', 5)}${padL('面积', 7)}${padL('耗时', 8)}  判定`)
console.log('─'.repeat(76))

for (const { c, r, ms, bad } of rows) {
  const route = r.ok ? `ok · ${r.path}` : '失败'
  console.log(
    `${pad(c.id, 18)}${pad(route, 20)}${padL(r.ok ? r.poly.length : '—', 5)}` +
      `${padL(r.ok ? polygonArea(r.poly).toFixed(2) : '—', 7)}${padL(`${ms.toFixed(1)}ms`, 8)}  ${bad.length ? '✗ 不过' : '过'}`,
  )

  if (verbose) {
    console.log(`      ${c.name}`)
    for (const n of r.notes) console.log(`      note   ${n}`)
    for (const p of r.problems) console.log(`      prob   ${p}`)
    if (!r.ok) console.log(`      reason ${r.reason}`)
    if (r.ok) console.log(`      poly   ${JSON.stringify(r.poly)}`)
  }

  if (bad.length) {
    console.log(`      why: ${c.why}`)
    for (const b of bad) console.log(`      ✗ ${b}`)
  }
}

const ran = rows.length
const passed = rows.filter((x) => x.bad.length === 0).length
const byPoly = rows.filter((x) => x.r.path === 'polygon').length
const byMask = rows.filter((x) => x.r.path === 'mask').length
const failed = rows.filter((x) => !x.r.ok).length
const bailed = rows.filter((x) => x.r.notes.some((n) => n.includes('已改用掩码'))).length

console.log('─'.repeat(76))
console.log(`用例全过                    ${passed}/${ran}`)
console.log(`走多边形 ${byPoly} 条 · 走掩码 ${byMask} 条 · 失败 ${failed} 条 · 其中兜底退到掩码 ${bailed} 条`)
console.log(`最慢一次                    ${slowest.toFixed(1)}ms`)

// 验收线：全部用例过。这里没有「成功率」这种可以打折的指标 ——
// 一条不过就是某条决策分支坏了，而坏掉的样子是安静地用错轮廓。
const ok = passed === ran && ran === CASES.length
if (!ok && ran !== CASES.length) console.log(`\n（--only 模式下只跑了 ${ran}/${CASES.length} 条，判定必然不过）`)
process.exit(ok ? 0 : 1)
