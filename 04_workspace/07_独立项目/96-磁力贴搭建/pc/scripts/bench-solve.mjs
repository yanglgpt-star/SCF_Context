/**
 * M3 验收台：跑 20 个内置轮廓，看成功率、耗时、降级落点，
 * 并且**用 analyzeWork 反过来验一遍输出是不是合法 work.json**。
 *
 * 最后这条是关键：求解器自己说「我成了」不算数，得让 work.json 的校验器
 * 拿原子集合重新算一遍重叠/越界/连通，两边对得上才叫真成。
 *
 *   node scripts/bench-solve.mjs
 *   node scripts/bench-solve.mjs --verbose     打印每片的形状与位置
 *   node scripts/bench-solve.mjs --only house
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { CONTOURS, checkContours } from '../src/core/solver/contours.js'
import { solveContour } from '../src/core/solver/solve.js'
import { acceptSolution, levelSpec } from '../src/core/solver/strategies.js'
import { buildReport } from '../src/core/report.js'
import { stockToShapeMap } from '../src/core/model/stock.js'
import { COLOR_NAMES } from '../src/core/model/palette.js'
import { analyzeWork, normalizeWork } from '../src/core/model/work.js'
import { FALLBACK_LEVELS } from '../src/core/config.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const LIB = resolve(HERE, '../../library')

const argv = process.argv.slice(2)
const verbose = argv.includes('--verbose')
const onlyAt = argv.indexOf('--only')
const only = onlyAt >= 0 ? argv[onlyAt + 1] : null

const stockFile = JSON.parse(readFileSync(resolve(LIB, 'stock.json'), 'utf8'))
const stock = stockToShapeMap(stockFile.items)

/* ---------------- 用例自检 ---------------- */
const badAreas = checkContours()
if (badAreas.length) {
  console.log('!! 用例标注的面积跟实际对不上，先修用例：')
  for (const b of badAreas) console.log(`   ${b.id}: 标注 ${b.declared}，实际 ${b.actual}`)
  console.log()
}

/* ---------------- 跑 ---------------- */
const rows = []
let slowest = 0

for (const c of CONTOURS) {
  if (only && c.id !== only) continue

  const t0 = performance.now()
  const sol = solveContour({ poly: c.poly, stock, palette: COLOR_NAMES, options: { seedKey: c.id } })
  const ms = performance.now() - t0
  slowest = Math.max(slowest, ms)

  const row = { id: c.id, name: c.name, declared: c.area, expect: c.expect, ms, sol }

  // 注意这里判的是「有没有片」而不是「ok」：L5 会带一套尽力而为的片回来，
  // 那张图同样要过 work.json 校验器 —— 一个不可照搭的方案仍然是**合法**的数据，
  // 混淆这两件事正是之前把 57% 的覆盖率显示成「已求解」的根源。
  if (sol.tiles.length > 0) {
    const work = normalizeWork({
      workId: `W-bench-${c.id}`,
      canvas: sol.canvas,
      tiles: sol.tiles,
      meta: { title: c.name },
    })
    const analysis = analyzeWork(work)
    const report = buildReport({ solution: sol })

    row.analysis = analysis
    row.report = report
    row.level = sol.level
    row.pieces = sol.tiles.length
    row.coverage = sol.metrics?.coverage ?? 0
    row.overflow = sol.metrics?.overflow ?? 0
    row.overStock = sol.overStock
    row.legal = analysis.ok

    // 「合格」= 四件事都对上：
    //   1. work.json 校验器认（拿原子集合重算重叠/越界，没有 error）
    //   2. 连成一片（散架的方案没法照着搭）
    //   3. **这一级自己的闸门确实过了** —— 不是一律卡 95%，
    //      否则 L4 的用例天生就不可能合格，那个级别等于没有用例
    //   4. 不可拼的用例必须真的走完了整条阶梯。计划书里「构造一个故意无解的
    //      轮廓，确认降级策略逐级触发」验的就是这一条
    row.pass =
      analysis.ok &&
      analysis.warnings.every((w) => w.code !== 'DISCONNECTED') &&
      (sol.ok
        ? acceptSolution(sol.metrics, levelSpec(sol.level))
        : c.expect === 'L5' && (sol.ladder?.length ?? 0) === FALLBACK_LEVELS.length)
  } else {
    row.level = 'L5'
    row.pass = c.expect === 'L5' && (sol.ladder?.length ?? 0) === FALLBACK_LEVELS.length
  }

  rows.push(row)
}

/* ---------------- 打印 ---------------- */
const pad = (s, n) => String(s).padEnd(n, ' ')
const padL = (s, n) => String(s).padStart(n, ' ')

console.log(
  `${pad('用例', 16)}${pad('预期', 10)}${pad('落点', 5)}${padL('片数', 5)}${padL('覆盖', 8)}${padL('溢出', 8)}${padL('耗时', 9)}  校验`,
)
console.log('─'.repeat(78))

for (const r of rows) {
  const cov = r.coverage != null ? `${(r.coverage * 100).toFixed(1)}%` : '—'
  const ovf = r.overflow != null ? `${(r.overflow * 100).toFixed(1)}%` : '—'
  const ms = `${r.ms.toFixed(0)}ms`
  const hit = r.level === r.expect ? '' : `  ← 预估 ${r.expect}`
  let check = '—'
  if (r.analysis) {
    const errs = r.analysis.errors.map((e) => e.code)
    const warns = r.analysis.warnings.map((w) => w.code)
    check = errs.length ? `错误 ${errs.join(',')}` : warns.length ? `警告 ${warns.join(',')}` : 'ok'
  }
  console.log(
    `${pad(r.id, 16)}${pad(r.expect, 10)}${pad(r.level, 5)}${padL(r.pieces ?? '-', 5)}${padL(cov, 8)}${padL(ovf, 8)}${padL(ms, 9)}  ${check}${hit}`,
  )

  if (verbose && r.sol.tiles.length) {
    for (const t of r.sol.tiles) {
      console.log(`      ${pad(t.shape, 7)}rot${padL(t.rot, 3)}  (${t.i},${t.j})  ${t.color ?? '无色'}`)
    }
  }
  if (r.report) {
    console.log(
      `      → ${r.report.ageBand.label}  难度 ${r.report.difficulty.score}  对称 ${r.report.symmetry}  ${r.report.connected ? '连成一片' : `${r.report.componentCount} 块（会散架）`}`,
    )
    if (r.report.shortfall.length) {
      console.log(`      → 需补料：${r.report.shortfall.map((s) => `${s.shape} ${s.need - s.have} 片`).join('、')}`)
    }
  }
  if (!r.sol.ok && r.sol.reason) {
    console.log(`      → ${r.sol.reason}`)
  }
  if (!r.sol.ok) {
    // 把整条阶梯摊开：每一级是「因为什么」被跳过的。故意无解的轮廓
    // 走到这儿时，这张表就是「降级策略逐级触发」这件事本身的证据。
    for (const l of r.sol.ladder ?? []) {
      const why = l.reason ?? (l.accepted ? '通过' : '')
      console.log(`      · ${pad(l.level, 4)}${padL(l.pieces ?? '-', 3)} 片  ${padL(l.ms ?? 0, 5)}ms  ${why}`)
    }
  }
}

/* ---------------- 汇总 ---------------- */
const ran = rows.length
const passed = rows.filter((r) => r.pass).length
const solved = rows.filter((r) => r.sol.ok).length
const withTiles = rows.filter((r) => r.sol.tiles.length > 0).length
const legal = rows.filter((r) => r.legal).length
const withErr = rows.filter((r) => r.analysis && !r.analysis.ok)
const expectHit = rows.filter((r) => r.level === r.expect).length

console.log('─'.repeat(78))
console.log(`给出可照搭的方案            ${solved}/${ran}${ran - solved ? `   （其余 ${ran - solved} 个判为 L5 不可拼，按设计如此）` : ''}`)
console.log(`合格（一级一闸门 + 连成一片）  ${passed}/${ran}  = ${((passed / ran) * 100).toFixed(0)}%`)
console.log(`输出是合法 work.json        ${legal}/${withTiles}`)
console.log(`落点与预估一致              ${expectHit}/${ran}`)
console.log(`最慢一次                    ${slowest.toFixed(0)}ms`)

if (withErr.length) {
  console.log('\n校验报错的用例：')
  for (const r of withErr) {
    for (const e of r.analysis.errors) console.log(`   ${r.id}: [${e.code}] ${e.message}`)
  }
}

const byLevel = {}
for (const r of rows) byLevel[r.level] = (byLevel[r.level] ?? 0) + 1
console.log(`\n降级分布       ${Object.entries(byLevel).map(([k, v]) => `${k}:${v}`).join('  ')}`)

// 验收线（计划书 M3）：成功率 ≥70%、单次 <2s、输出即合法 work.json。
// 最后一条对所有**有片**的用例都成立才算过 —— L5 那套尽力而为的片同样得是合法数据。
const ok = passed / ran >= 0.7 && slowest < 2000 && legal === withTiles
process.exit(ok ? 0 : 1)
