/**
 * M4 验收台之一：跑吸附用例，看结果状态、位移、报错码对不对。
 *
 * 三条全局断言（`checkInvariants`）比每一条用例的具体预期更要紧 ——
 * 它们对**每一条**用例都跑，包括失败的那几条，管的是「吸附结果能不能直接喂给
 * 求解器」这件事本身：坐标全整数、成功即网格友好、失败即空数组。
 *
 *   node scripts/bench-snap.mjs
 *   node scripts/bench-snap.mjs --verbose     打印每条的结果多边形与全部统计
 *   node scripts/bench-snap.mjs --only near45
 */
import { CASES, checkInvariants, runCase } from '../src/core/contour/snapCases.js'
import { isGridFriendly } from '../src/core/contour/polygon.js'

const argv = process.argv.slice(2)
const verbose = argv.includes('--verbose')
const onlyAt = argv.indexOf('--only')
const only = onlyAt >= 0 ? argv[onlyAt + 1] : null

// 位移与面积都是连续量，报到小数点后两位就够了；顶点数那类整数比较也走这个容差，不会被放过
const near = (a, b) => Math.abs(a - b) < 1e-3
const samePoly = (a, b) =>
  a.length === b.length && a.every((p, k) => near(p[0], b[k][0]) && near(p[1], b[k][1]))

/** 一条用例的 `expect` 里，除了 ok / reasonCode，其余键都对 result / result.stats 取值 */
const STAT_KEYS = ['verticesOut', 'areaAfter', 'roundMove', 'maxMove']

function check(c, r) {
  const bad = []
  const e = c.expect

  if (r.ok !== e.ok) bad.push(`ok 期望 ${e.ok}，实际 ${r.ok}`)
  if (e.reasonCode != null && r.reasonCode !== e.reasonCode) {
    bad.push(`reasonCode 期望 ${e.reasonCode}，实际 ${r.reasonCode || '（空）'}`)
  }
  if (e.reasonIncludes != null && !r.reason.includes(e.reasonIncludes)) {
    bad.push(`reason 里没出现「${e.reasonIncludes}」：${r.reason}`)
  }

  for (const key of STAT_KEYS) {
    if (e[key] == null) continue
    if (!near(r.stats[key], e[key])) bad.push(`${key} 期望 ${e[key]}，实际 ${r.stats[key]}`)
  }

  if (e.polyEquals && !samePoly(r.poly, e.polyEquals)) {
    bad.push(`poly 期望 ${JSON.stringify(e.polyEquals)}，实际 ${JSON.stringify(r.poly)}`)
  }

  if (e.warnCodes) {
    const got = r.warnings.map((w) => w.code)
    if (got.length !== e.warnCodes.length || e.warnCodes.some((w) => !got.includes(w))) {
      bad.push(`warnings 期望 [${e.warnCodes.join(',')}]，实际 [${got.join(',')}]`)
    }
  }

  for (const msg of checkInvariants(c.poly, r, isGridFriendly)) bad.push(msg)
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

console.log(
  `${pad('用例', 16)}${pad('结果', 22)}${padL('顶点', 5)}${padL('取整', 7)}${padL('放松', 7)}${padL('耗时', 9)}  判定`,
)
console.log('─'.repeat(84))

for (const { c, r, ms, bad } of rows) {
  const status = r.ok ? 'ok' : r.reasonCode
  console.log(
    `${pad(c.id, 16)}${pad(status, 22)}${padL(r.stats.verticesOut || '—', 5)}` +
      `${padL(r.stats.roundMove.toFixed(2), 7)}${padL(r.stats.maxMove.toFixed(2), 7)}` +
      `${padL(`${ms.toFixed(1)}ms`, 9)}  ${bad.length ? '✗ 不过' : '过'}`,
  )

  if (verbose) {
    console.log(`      ${c.name} —— ${r.ok ? '成功' : '失败'}`)
    console.log(`      简化容差 ${r.stats.dpTolerance}  顶点 ${r.stats.verticesIn} → ${r.stats.verticesOut}` +
      `  面积 ${r.stats.areaBefore.toFixed(2)} → ${r.stats.areaAfter.toFixed(2)}`)
    console.log(`      边 ${r.edges.length} 条，其中失败前未对齐 ${r.stats.relaxedEdges} 条；放松 ${r.stats.passes} 遍，挪了 ${r.stats.movedVertices} 个顶点`)
    if (r.offset.dx || r.offset.dy) console.log(`      平移回原点 (${r.offset.dx}, ${r.offset.dy})${r.flipped ? '，输入被翻过向' : ''}`)
    if (r.poly.length) console.log(`      poly  ${JSON.stringify(r.poly)}`)
    else if (r.bestEffort.length) console.log(`      半成品（仅供显示）  ${JSON.stringify(r.bestEffort)}`)
  }

  if (bad.length) {
    console.log(`      why: ${c.why}`)
    for (const b of bad) console.log(`      ✗ ${b}`)
    if (!r.ok) console.log(`      reason: ${r.reason}`)
  }
}

const ran = rows.length
const passed = rows.filter((x) => x.bad.length === 0).length
const okCount = rows.filter((x) => x.r.ok).length

console.log('─'.repeat(84))
console.log(`用例全过                    ${passed}/${ran}`)
console.log(`其中吸附成功                ${okCount}/${ran}   （其余按设计失败，报错码各不相同）`)
console.log(`最慢一次                    ${slowest.toFixed(1)}ms`)
console.log(
  `失败码覆盖                  ${[...new Set(rows.filter((x) => !x.r.ok).map((x) => x.r.reasonCode))].sort().join('  ')}`,
)

// 验收线：全部用例过。用例少，没有「成功率」这种可以打折的指标 ——
// 一条不过就是吸附器在某类输入上有明确缺陷。
const ok = passed === ran && ran === CASES.length
if (!ok && ran !== CASES.length) console.log(`\n（--only 模式下只跑了 ${ran}/${CASES.length} 条，判定必然不过）`)
process.exit(ok ? 0 : 1)
