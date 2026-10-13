/**
 * M6 验收台：锁定片重解。
 *
 * 手法跟别的 bench 不太一样：**先用求解器造出方案，再拿它自己的片当锁定输入**。
 * 于是「锁定后应该怎样」有唯一正确答案 —— 全锁定时结果必须与原方案一模一样，
 * 部分锁定时锁定片必须逐位不变。这比手写几组坐标靠谱得多：手写的锁不定落在
 * 合法位置上，反而要先证明夹具本身合法。
 *
 * 十条性质里 P1 最重要：
 *
 *   **`lockedTiles: []` 的输出与完全不传 `lockedTiles` 逐字节相同。**
 *
 * 它把「锁定没有走分叉」从风格偏好变成可检验断言。分叉是可以被无意间写出来的 ——
 * 加一个 `if (locked.length)` 分支、或者在空锁定时也走一遍不同的装配路径 ——
 * 而逐字节比较不会撒谎。改 `solve.js` / `candidates.js` / `assign.js` 之后
 * 先跑这一条，再看别的。
 *
 * 比较时剔掉 `elapsedMs` 与每级的 `ms`：那是墙钟时间，两次跑不会相等，
 * 留着它只会让 P1 永远红着，然后被人加一个容差糊过去。
 *
 * ---
 *
 * **P2 首轮是红的，而它逼出的是一处真 bug**（记在这儿，免得后来人把它当成断言写松了）。
 *
 * `solve.js` 的 `tryLevel` 原本有两条早退：「库存里没有可用的平面形状」「没有任何形状
 * 能放进这个轮廓」。两条都建立在一个前提上 —— **至少得新增一片才算解**。有锁定片
 * 之后这个前提不成立：用户把片全锁上、轮廓本来又留了几处补不上的缝（nub 是 L1，
 * 98% 覆盖）时，「一片都不新增」正是正确答案。
 *
 * 于是 nub 全锁定后的表现是：L0/L1 被那两条早退直接判死，求解器升到 L2 去找一个
 * 压出轮廓的三角把缝补上 —— 98.0% → 100% 覆盖，代价是多一片、溢出 2%、级别 L1 掉到
 * L2。**一条早退把「用户锁完了」翻译成了「用户还想要一片」**。
 *
 * 修法是删掉两条早退，只留 `forcedGaps.length > budgetAtoms` 那条判据 —— 它问的是
 * 「剩下的必需原子能不能被这级的留白预算吸收」，对不解、全解锁、部分锁定是同一条。
 * 修完 P2 绿，且 `npm run bench`（M3）的降级分布逐项不变（`L0:15 L1:1 L2:1 L3:1
 * L4:1 L5:1`）—— 无锁定时 `raster.full.length > 0` 保证每一格都放得下 SQ，所以那两条
 * 早退本来就永不触发，删掉它们对默认路径是恒等操作。
 *
 * 因此 P2 这条断言**不是无条件成立**，它成立的条件是「剩下的缝在这级的留白预算之内」。
 * 真要有轮廓连预算都盖不住，全锁定会诚实地失败（`ok:false`），那是**对**的行为 ——
 * 锁定的语义是「这些片不许动」，不是「必须拼得出」。
 *
 *   node scripts/bench-lock.mjs
 *   node scripts/bench-lock.mjs --verbose
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { CONTOURS } from '../src/core/solver/contours.js'
import { solveContour } from '../src/core/solver/solve.js'
import { buildLocked } from '../src/core/solver/locked.js'
import { FALLBACK_LEVELS } from '../src/core/config.js'
import { createGrid } from '../src/core/geometry/grid.js'
import { atomsAt } from '../src/core/geometry/shapes.js'
import { analyzeWork, normalizeWork } from '../src/core/model/work.js'
import { stockToShapeMap } from '../src/core/model/stock.js'
import { COLOR_NAMES } from '../src/core/model/palette.js'
import { assignColors } from '../src/core/color/assign.js'
import { hashSeed, mulberry32 } from '../src/core/util/rng.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const LIB = resolve(HERE, '../../library')
const verbose = process.argv.includes('--verbose')

let pass = 0
let fail = 0
const failures = []

function check(name, ok, detail = '') {
  if (ok) {
    pass += 1
    console.log(`  过  ${name}${detail ? `   ${detail}` : ''}`)
  } else {
    fail += 1
    failures.push(name)
    console.log(`  **不过** ${name}${detail ? `   ${detail}` : ''}`)
  }
}

const stock = stockToShapeMap(JSON.parse(readFileSync(resolve(LIB, 'stock.json'), 'utf8')).items)
const levelIndex = (l) => FALLBACK_LEVELS.indexOf(l)

/** 剔掉墙钟时间之后再做逐字节比较 —— 见文件头 */
function stable(sol) {
  const clone = JSON.parse(JSON.stringify(sol))
  delete clone.elapsedMs
  for (const l of clone.ladder ?? []) delete l.ms
  return JSON.stringify(clone)
}

const solve = (c, extra = {}) =>
  solveContour({ poly: c.poly, stock, palette: COLOR_NAMES, options: { seedKey: c.id }, ...extra })

/** 用种子从一组片里确定性地取 n 片（不用 Math.random —— 那会让失败不可复现） */
function pickTiles(tiles, seedStr, n) {
  const rand = mulberry32(hashSeed(seedStr))
  const idx = tiles.map((_, k) => k)
  for (let k = idx.length - 1; k > 0; k -= 1) {
    const m = Math.floor(rand() * (k + 1))
    const tmp = idx[k]
    idx[k] = idx[m]
    idx[m] = tmp
  }
  return idx.slice(0, Math.max(0, Math.min(n, idx.length))).map((k) => tiles[k])
}

const tkey = (t) => `${t.id}|${t.shape}|${t.rot}|${t.i}|${t.j}|${t.color ?? '-'}|${t.locked}`

console.log('='.repeat(74))
console.log('M6 锁定片重解\n')

/* ---------------------------------------------------- 造基准方案 ---- */
const BASES = []
for (const c of CONTOURS) {
  const sol = solve(c)
  if (sol.tiles.length > 0) BASES.push({ c, sol })
}
const byId = Object.fromEntries(BASES.map((b) => [b.c.id, b]))

// 参与锁定用例的轮廓。跳过 big8：它一次就要 650ms，锁三档就是两秒，
// 而它验到的东西跟 diamond/house 完全一样（都是 L0 的普通轮廓）。
const LOCKABLE = ['house', 'diamond', 'U', 'thickL', 'nub', 'stairs5', 'stepDiamond']
  .filter((id) => byId[id])
  .map((id) => byId[id])

console.log(`基准方案 ${BASES.length}/${CONTOURS.length} 个轮廓有片，参与锁定用例的 ${LOCKABLE.length} 个\n`)

/* ============================================================ P1 ===== */
console.log('[P1] 空锁定与不传锁定，输出逐字节相同')
{
  let same = 0
  const diffs = []
  for (const { c } of BASES) {
    const a = stable(solve(c))
    const b = stable(solve(c, { lockedTiles: [] }))
    if (a === b) same += 1
    else diffs.push(c.id)
  }
  check(
    `${BASES.length} 个轮廓的 ` + '`lockedTiles: []` 输出与不传完全一致',
    diffs.length === 0,
    diffs.length ? `不同的：${diffs.join('、')}` : `${same}/${BASES.length}`,
  )
}

/* ============================================================ P2 ===== */
// 恒等成立的机理：锁定片盖住了 raster.full 里的大部分，剩下的缝（nub 是 2%）数量
// 在这级的留白预算之内，于是必需列可以被 slack 清空 → dlx 立刻返回空解 → 拼上锁定集
// 恰好是恒等。首轮不过的原因与修法见文件头。
console.log('\n[P2] 全锁定 ⇒ 恒等（输出就是锁定集）')
{
  const bad = []
  for (const { c, sol } of LOCKABLE) {
    const r = solve(c, { lockedTiles: sol.tiles })
    if (!r.ok) {
      bad.push(`${c.id}: ok 该是 true，实际 false（${r.reason ?? ''}）`)
      continue
    }
    if (r.tiles.length !== sol.tiles.length) {
      bad.push(`${c.id}: 片数 ${r.tiles.length} ≠ 原方案 ${sol.tiles.length}`)
      continue
    }
    const want = sol.tiles.map((t) => tkey({ ...t, locked: true })).sort()
    const got = r.tiles.map(tkey).sort()
    if (want.join('\n') !== got.join('\n')) {
      bad.push(`${c.id}: 片集与原方案不同`)
      continue
    }
    if (Math.abs(r.metrics.coverage - sol.metrics.coverage) > 1e-12) {
      bad.push(`${c.id}: 覆盖率变了 ${sol.metrics.coverage} → ${r.metrics.coverage}`)
    }
    if (r.level !== sol.level) bad.push(`${c.id}: 级别变了 ${sol.level} → ${r.level}`)
    if (verbose) console.log(`        ${c.id}  ${sol.tiles.length} 片  ${sol.level}  覆盖 ${(sol.metrics.coverage * 100).toFixed(1)}%`)
  }
  check(
    '全锁定后片集、覆盖率、降级级别都与原方案相同（DLX 空必需列路径 + 指标合并一起验到）',
    bad.length === 0,
    bad.join('；'),
  )
}

/* ============================================================ P3 ===== */
console.log('\n[P3] 部分锁定 ⇒ 覆盖率不降、降级级别不升')
{
  const bad = []
  for (const { c, sol } of LOCKABLE) {
    const locks = pickTiles(sol.tiles, `${c.id}-third`, Math.floor(sol.tiles.length / 3))
    if (locks.length === 0) continue
    const r = solve(c, { lockedTiles: locks })
    if (r.tiles.length === 0) {
      bad.push(`${c.id}: 锁了 ${locks.length} 片之后一个方案都给不出来了`)
      continue
    }
    const dc = r.metrics.coverage - sol.metrics.coverage
    if (dc < -1e-9) bad.push(`${c.id}: 覆盖率降了 ${(dc * 100).toFixed(2)} 个百分点（${(sol.metrics.coverage * 100).toFixed(1)}% → ${(r.metrics.coverage * 100).toFixed(1)}%）`)
    if (levelIndex(r.level) < levelIndex(sol.level)) {
      bad.push(`${c.id}: 级别反而升高了 ${sol.level} → ${r.level}`)
    }
    if (verbose) {
      console.log(`        ${c.id}  锁 ${locks.length}/${sol.tiles.length} 片  ${sol.level}(${(sol.metrics.coverage * 100).toFixed(1)}%) → ${r.level}(${(r.metrics.coverage * 100).toFixed(1)}%)`)
    }
  }
  check('锁一部分片之后覆盖率没降、降级级别没升', bad.length === 0, bad.join('；'))
}

/* ============================================================ P4 ===== */
console.log('\n[P4] 同一份输入跑两次，输出完全相同')
{
  const bad = []
  for (const { c, sol } of LOCKABLE) {
    const locks = pickTiles(sol.tiles, `${c.id}-third`, Math.floor(sol.tiles.length / 3))
    const a = stable(solve(c, { lockedTiles: locks }))
    const b = stable(solve(c, { lockedTiles: locks }))
    if (a !== b) bad.push(c.id)
  }
  check('两次求解逐字节相同（Map/Set 的迭代顺序没漏进返回值）', bad.length === 0, bad.length ? `不同的：${bad.join('、')}` : '')
}

/* ============================================================ P5 ===== */
console.log('\n[P5] 每个输出都过 work.json 校验器')
{
  const bad = []
  for (const { c, sol } of LOCKABLE) {
    const locks = pickTiles(sol.tiles, `${c.id}-third`, Math.max(1, Math.floor(sol.tiles.length / 3)))
    const r = solve(c, { lockedTiles: locks })
    const work = normalizeWork({ workId: `W-bench-lock-${c.id}`, canvas: r.canvas, tiles: r.tiles, meta: { title: c.name } })
    const analysis = analyzeWork(work)
    if (!analysis.ok) {
      bad.push(`${c.id}: ${analysis.errors.map((e) => `[${e.code}] ${e.message}`).join('；')}`)
    }
  }
  check('锁定后的方案仍然是合法 work.json（拿原子集合独立复算重叠与越界）', bad.length === 0, bad.join('；'))
}

/* ============================================================ P6 ===== */
console.log('\n[P6] 锁定片原样出现且 locked: true')
{
  const bad = []
  for (const { c, sol } of LOCKABLE) {
    const locks = pickTiles(sol.tiles, `${c.id}-third`, Math.max(1, Math.floor(sol.tiles.length / 3)))
    const r = solve(c, { lockedTiles: locks })
    const got = new Map(r.tiles.map((t) => [t.id, t]))
    for (const L of locks) {
      const g = got.get(L.id)
      if (!g) {
        bad.push(`${c.id}: 锁定的 ${L.id} 在结果里不见了`)
        continue
      }
      if (g.shape !== L.shape || g.rot !== L.rot || g.i !== L.i || g.j !== L.j) {
        bad.push(`${c.id}: ${L.id} 的落点被改了 (${L.shape}/${L.rot}@${L.i},${L.j}) → (${g.shape}/${g.rot}@${g.i},${g.j})`)
      }
      if (g.locked !== true) bad.push(`${c.id}: ${L.id} 的 locked 不是 true`)
    }
  }
  check('每一片锁定片都在结果里，且 id/shape/rot/i/j 逐位不变、locked: true', bad.length === 0, bad.join('；'))
}

/* ============================================================ P7 ===== */
console.log('\n[P7] 传回 canvas ⇒ 画布不变，且没有片落在画布外')
{
  const bad = []
  for (const { c, sol } of LOCKABLE) {
    const locks = pickTiles(sol.tiles, `${c.id}-third`, Math.max(1, Math.floor(sol.tiles.length / 3)))
    const r = solve(c, { canvas: sol.canvas, lockedTiles: locks })
    if (r.canvas.cols !== sol.canvas.cols || r.canvas.rows !== sol.canvas.rows) {
      bad.push(`${c.id}: 画布被改了 ${sol.canvas.cols}×${sol.canvas.rows} → ${r.canvas.cols}×${r.canvas.rows}`)
      continue
    }
    // 画布没变不等于原子索引就对上了：拿结果自己的 canvas 建一张 grid，
    // 逐片重算原子 —— 越界会返回 null，这儿正好当判据用
    const grid = createGrid(r.canvas.cols, r.canvas.rows)
    for (const t of r.tiles) {
      if (!atomsAt(grid, t.shape, t.rot, t.i, t.j)) bad.push(`${c.id}: ${t.id} 落在画布外`)
    }
  }
  check('传 canvas 进去画布原样返回，且每一片都在 [0,cols)×[0,rows) 之内', bad.length === 0, bad.join('；'))
}

/* ============================================================ P8 ===== */
console.log('\n[P8] 锁定片的颜色不变，且它的库存被扣掉')
{
  const bad = []
  for (const { c, sol } of LOCKABLE) {
    const locks = pickTiles(sol.tiles, `${c.id}-third`, Math.max(1, Math.floor(sol.tiles.length / 3)))
    const r = solve(c, { lockedTiles: locks })
    const got = new Map(r.tiles.map((t) => [t.id, t]))
    for (const L of locks) {
      const g = got.get(L.id)
      if (g && g.color !== L.color) bad.push(`${c.id}: ${L.id} 的颜色被重新挑了 ${L.color} → ${g.color}`)
    }
    // 报告里的用量必须把锁定片算进去，否则「各颜色用了几片」会对不上实际片数
    const total = Object.values(r.colorUsage ?? {}).reduce((a, b) => a + b, 0)
    if (total !== r.tiles.length) bad.push(`${c.id}: colorUsage 合计 ${total} ≠ 片数 ${r.tiles.length}（锁定片没算进用量）`)
  }
  check('锁定片的颜色原样保留，且 colorUsage 把锁定片算进了用量', bad.length === 0, bad.join('；'))
}

{
  // 直接对 assignColors 下刀：库存**刚好够**的时候，锁定片占掉的额度必须先从
  // 池子里扣掉，否则后面的片会照着「满库存」挑色，撞出超库存还浑然不知。
  //
  // 用例的形状是挑过的，不是随手写的。两片的布局必须是「自由片紧挨着锁定片」——
  // 那样自由片的第 1 步（延续邻片颜色）才会去要红色，而红色的额度只剩 0。
  // 换成三片（旧的写法）验不到这件事：三片配 red:1/blue:1 必然把两色都用光、
  // 走 `exhausted` 兜底挑 palette[0]，出 2 片红是**设计好的**行为，不是漏扣额度。
  const grid = createGrid(4, 4)
  const tiles = [
    { id: 'SQ-0-0-0', shape: 'SQ', rot: 0, i: 0, j: 0, color: 'red', locked: true },
    { id: 'SQ-0-0-1', shape: 'SQ', rot: 0, i: 0, j: 1 },
  ]
  const tight = { SQ: { red: 1, blue: 1 } }
  const r = assignColors({ tiles, grid, palette: ['red', 'blue'], stock: tight, keep: ['SQ-0-0-0'] })
  const bad = []
  if (r.tiles[0].color !== 'red') bad.push(`锁定片的颜色被改了：${r.tiles[0].color}`)
  const reds = r.tiles.filter((t) => t.color === 'red').length
  if (reds > 1) bad.push(`红色只剩 1 片却用了 ${reds} 片 —— 锁定片占的额度没扣`)
  if (r.exhausted.length) bad.push(`不该有耗尽的颜色，却报了 ${r.exhausted.join('、')}`)
  if (r.colorUsage.red !== reds) bad.push(`colorUsage.red = ${r.colorUsage.red}，实际红色 ${reds} 片`)

  // 对照组：把同一片单独拿出来配同一份库存。它没有邻片可延续，会落到第 2 步
  // 「挑库存剩最多的」，两色同为 1 片时按色板顺序挑 —— 挑的正是红色。
  // 也就是说：**假如锁定片占的额度没被扣掉，正片也会挑红**，于是两片都红。
  // 这条对照把「上面的差异确实来自扣额度」变成一个可证伪的断言，而不是我的说辞。
  const alone = assignColors({ tiles: [tiles[1]], grid, palette: ['red', 'blue'], stock: tight })
  if (alone.tiles[0].color !== 'red') {
    bad.push(`对照组不成立：单独一片时挑的是 ${alone.tiles[0].color} 而不是红色，验不到「扣了额度」`)
  }
  check('库存刚好够时，锁定片先占额度（单放一片的对照会挑红，说明差异来自扣额度）', bad.length === 0, bad.join('；'))
}

/* ============================================================ P9 ===== */
console.log('\n[P9] 垃圾锁定：报错但不抛')
{
  const { c } = LOCKABLE[0]
  const good = byId[c.id].sol.tiles[0]
  const CASES = [
    ['未知形状', [{ ...good, id: 'X-1', shape: 'PENTAGON' }], 'UNKNOWN_SHAPE'],
    ['整个落在画布外', [{ ...good, id: 'X-2', i: 9999, j: 9999 }], 'OUT_OF_BOUNDS'],
    ['i 是字符串 "3"（会变成拼接而不是越界）', [{ ...good, id: 'X-3', i: '3' }], null],
    ['i 是 NaN', [{ ...good, id: 'X-4', i: '三' }], 'OUT_OF_BOUNDS'],
    ['两片完全重叠', [good, { ...good, id: 'X-5' }], 'OVERLAP'],
    ['空的片对象', [{}], 'UNKNOWN_SHAPE'],
    ['null', [null], 'UNKNOWN_SHAPE'],
  ]
  const bad = []
  for (const [label, tiles, wantCode] of CASES) {
    let r
    try {
      r = solve(c, { lockedTiles: tiles })
    } catch (e) {
      bad.push(`${label}: **抛异常了** —— ${e.message}`)
      continue
    }
    if (r.ok) {
      bad.push(`${label}: 该失败却成功了`)
      continue
    }
    if (!r.reason || r.reason.length < 6) bad.push(`${label}: 理由太短或没有理由（${JSON.stringify(r.reason)}）`)
    if (wantCode && r.invalid?.[0]?.code !== wantCode) {
      bad.push(`${label}: code 期望 ${wantCode}，实际 ${r.invalid?.[0]?.code}`)
    }
  }
  check('未知形状/越界/重叠/空对象/null 一律 ok:false + 有理由 + 不抛', bad.length === 0, bad.join('；'))
}

/* =========================================================== P10 ===== */
console.log('\n[P10] 锁定溢出档的片 ⇒ 重解仍溢出、级别不低于 L2')
{
  const w = byId.wedge
  const bad = []
  if (!w) {
    bad.push('没有 wedge 用例，验不了')
  } else {
    if (levelIndex(w.sol.level) < levelIndex('L2')) bad.push(`wedge 基准落在 ${w.sol.level}，不是 L2 —— 用例前提变了`)
    const r = solve(w.c, { canvas: w.sol.canvas, lockedTiles: w.sol.tiles })
    if (!(r.metrics.overflow > 0)) {
      bad.push(`全锁之后 overflow 变成 ${r.metrics.overflow}，溢出片被当成不出界了`)
    }
    if (levelIndex(r.level) < levelIndex('L2')) bad.push(`全锁之后级别掉到 ${r.level}`)
    if (verbose) console.log(`        wedge 基准 ${w.sol.level} 溢出 ${(w.sol.metrics.overflow * 100).toFixed(1)}% → 全锁 ${r.level} 溢出 ${(r.metrics.overflow * 100).toFixed(1)}%`)
  }
  check('锁定压出轮廓的片之后，overflow 如实保留、降级级别不退', bad.length === 0, bad.join('；'))
}

/* --------------------------------------------------------- 汇总 ---- */
console.log('\n' + '─'.repeat(74))
console.log(`${pass} 过 / ${fail} 不过`)
if (fail) {
  console.log('不过的：')
  failures.forEach((f) => console.log(`  ${f}`))
}
process.exit(fail ? 1 : 0)
