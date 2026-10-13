/**
 * M7 验收台：步骤拆解 + 步骤图。
 *
 * 跟前几个 bench 一样的路子：**先用求解器造出作品**，再对它们断言**性质**而不是答案。
 * 「正确答案」在这里尤其没法手写 —— 步骤序取决于四套排序和一次合并，任何一份手写的
 * 期望值都只是在抄一遍当前实现。
 *
 * 查的七件事：
 *
 *   ① 四个策略的序列**都**通过 `firstDisconnectedStep`（硬约束的独立验证器）
 *   ② 步骤恰好划分片集 —— 不重不漏（漏一片或多一片，步骤图就跟 work.json 对不上，
 *      而 M7 的验收原文正是「步骤图与 work.json 100% 一致」）
 *   ③ `no` 是 1..n 连续，`progress.done` 单调不减、末尾等于 `total`
 *   ④ 每个 `tileIds` 都解析得到
 *   ⑤ `chooseStrategy` 两次稳定，**且把输入打乱后选择不变**
 *   ⑥ 片数少于下限时给理由，**不产出空步骤凑数**
 *   ⑦ 不连通的作品返回 `ok:false` 和第一个孤儿，**不悄悄排一个错序**
 *
 * 再加一组对**导出的步骤 SVG 字符串**的断言（本步片全画、更早的片淡一档、更晚的片
 * 一片不画、caption 里的 `&` 被转义），以及一次 `assets.stepImages` ↔ 磁盘的核对。
 *
 * ⑤ 那条抓的是这里最经典的静默 bug：「对输入数组的下标顺序有依赖」。片 id 是位置派生的，
 * 所以打乱之后一切看着都还对，只有策略选择悄悄变了 —— 而策略一变，四张步骤图一起变。
 *
 *   node scripts/bench-steps.mjs
 *   node scripts/bench-steps.mjs --verbose
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { CONTOURS } from '../src/core/solver/contours.js'
import { solveContour } from '../src/core/solver/solve.js'
import { createGrid } from '../src/core/geometry/grid.js'
import { atomsAt, SHAPES } from '../src/core/geometry/shapes.js'
import { firstDisconnectedStep } from '../src/core/geometry/adjacency.js'
import { analyzeWork, normalizeWork } from '../src/core/model/work.js'
import { stockToShapeMap } from '../src/core/model/stock.js'
import { COLOR_NAMES } from '../src/core/model/palette.js'
import { hashSeed, mulberry32 } from '../src/core/util/rng.js'
import { STRATEGIES } from '../src/core/steps/orderings.js'
import { chooseStrategy, planSizes, sequenceTiles } from '../src/core/steps/sequence.js'
import { MIN_STEPS } from '../src/core/config.js'
import { buildStepSvg } from '../src/components/MosaicCanvas/exportSvg.js'
import { tileMagnets } from '../src/components/MosaicCanvas/paint.js'

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

/* ---------------- 造作品 ---------------- */

const stock = stockToShapeMap(JSON.parse(readFileSync(resolve(LIB, 'stock.json'), 'utf8')).items)
const palette = COLOR_NAMES

/** 拿求解器造一份合法作品。求解失败（L5）的轮廓直接跳过，那不是步骤拆解该管的事 */
function makeWork(contour) {
  const sol = solveContour({
    poly: contour.poly,
    canvas: contour.canvas,
    stock,
    palette,
    options: { seed: 1, seedKey: `bench-steps-${contour.id}` },
  })
  const analysis = analyzeWork(sol)
  if (!analysis.ok || !analysis.work.tiles.length) return null
  return { analysis, grid: createGrid(analysis.work.canvas.cols, analysis.work.canvas.rows) }
}

const CASES = CONTOURS.map((c) => ({ contour: c, ...(makeWork(c) ?? {}) })).filter((c) => c.analysis)

console.log(`\n${'='.repeat(78)}`)
console.log(`步骤拆解  ·  ${CASES.length} 个轮廓（${CONTOURS.length - CASES.length} 个求解不出作品，跳过）`)
console.log('='.repeat(78))

/* ---------------- ①–④ 每个策略都过四关 ---------------- */

const brokenAt = []
const brokenDisconnected = []
const splitCases = []

for (const c of CASES) {
  const { tiles } = c.analysis.work
  const atoms = tiles.map((t) => atomsAt(c.grid, t.shape, t.rot, t.i, t.j))

  // 有一类轮廓**本来就不连通**（`t8to1` 是刻意构造的：斜得太缓的边切出来的碎片
  // 补不满，求解器只能给两块互不相连的片）。它们排不出序是**正确行为**，
  // 不是这几个策略出了问题 —— 对它们的断言应该是「四个策略都拒绝，而不是各自
  // 硬凑一个错序」。混在一起数的话，一条本该通过的断言会被这 4 条淹掉。
  const disconnected = c.analysis.warnings.some((w) => w.code === 'DISCONNECTED')
  if (disconnected) {
    let allRejected = true
    for (const strategy of STRATEGIES) {
      const run = sequenceTiles(tiles, c.grid, { strategy })
      if (run.ok || run.reason?.code !== 'DISCONNECTED' || run.steps.length) allRejected = false
    }
    if (!allRejected) brokenDisconnected.push(c.contour.id)
    splitCases.push(c.contour.id)
    continue
  }

  for (const strategy of STRATEGIES) {
    const run = sequenceTiles(tiles, c.grid, { strategy })
    if (!run.ok) {
      brokenAt.push(`${c.contour.id}/${strategy}: ${run.reason?.code}`)
      continue
    }

    // ① 硬约束：独立验证器说合法
    const v = firstDisconnectedStep(atoms, run.order, c.grid)
    if (v.index !== -1) brokenAt.push(`${c.contour.id}/${strategy}: 第 ${v.index} 片起接不上`)
    if (run.order.length !== tiles.length) brokenAt.push(`${c.contour.id}/${strategy}: 序列长度不符`)

    // ② 不重不漏
    const ids = run.steps.flatMap((s) => s.tileIds)
    const uniq = new Set(ids)
    if (ids.length !== tiles.length || uniq.size !== tiles.length) {
      brokenAt.push(`${c.contour.id}/${strategy}: 划分不严 （${ids.length} vs ${uniq.size} vs ${tiles.length}）`)
    }

    // ③ 序号连续 + 进度单调
    let done = 0
    run.steps.forEach((s, k) => {
      if (s.no !== k + 1) brokenAt.push(`${c.contour.id}/${strategy}: 第 ${k + 1} 步的 no 是 ${s.no}`)
      if (s.progress.done <= done) brokenAt.push(`${c.contour.id}/${strategy}: 第 ${s.no} 步进度没涨`)
      if (s.progress.total !== tiles.length) brokenAt.push(`${c.contour.id}/${strategy}: total 不对`)
      done = s.progress.done
      // ⑥ 不产出空步骤
      if (!s.tileIds.length) brokenAt.push(`${c.contour.id}/${strategy}: 第 ${s.no} 步是空的`)
    })
    if (done !== tiles.length) brokenAt.push(`${c.contour.id}/${strategy}: 末尾进度 ${done} ≠ ${tiles.length}`)

    // ④ 每个 id 都解析得到
    const known = new Set(tiles.map((t) => t.id))
    for (const id of ids) if (!known.has(id)) brokenAt.push(`${c.contour.id}/${strategy}: 悬空 id ${id}`)
  }
}

console.log('\n① 四个策略的序列都通过 firstDisconnectedStep')
console.log('② 步骤恰好划分片集，不重不漏')
console.log('③ no 连续、progress.done 单调不减且末尾等于 total')
console.log('④ 每个 tileIds 都解析得到')
check(`四个策略 × ${CASES.length - splitCases.length} 个连通轮廓全过`, brokenAt.length === 0, brokenAt.slice(0, 5).join('；'))
if (splitCases.length) {
  check(`不连通的轮廓（${splitCases.join('、')}）：四个策略都拒绝，不各自硬凑一个错序`,
    brokenDisconnected.length === 0)
}

/* ---------------- ⑤ 策略选择的稳定性 ---------------- */

console.log('\n⑤ chooseStrategy 稳定，且与输入顺序无关')

/** 确定性洗牌 —— 用 core 自己的 rng，不用 Math.random */
function shuffle(list, seed) {
  const rnd = mulberry32(hashSeed(seed))
  const out = list.slice()
  for (let k = out.length - 1; k > 0; k -= 1) {
    const r = Math.floor(rnd() * (k + 1))
    ;[out[k], out[r]] = [out[r], out[k]]
  }
  return out
}

const unstable = []
const shuffleSensitive = []

for (const c of CASES) {
  const { tiles } = c.analysis.work
  const a = chooseStrategy(tiles, c.grid, {})
  const b = chooseStrategy(tiles, c.grid, {})
  if (a !== b) unstable.push(`${c.contour.id}: ${a} vs ${b}`)

  for (const seed of [7, 99, 12345]) {
    const s = chooseStrategy(shuffle(tiles, `${c.contour.id}-${seed}`), c.grid, {})
    if (s !== a) shuffleSensitive.push(`${c.contour.id} seed${seed}: ${a} → ${s}`)
  }
}

check('两次调用结果相同', unstable.length === 0, unstable.slice(0, 3).join('；'))
check('打乱输入后选择不变', shuffleSensitive.length === 0, shuffleSensitive.slice(0, 3).join('；'))

/* ---------------- ⑥ 片数不足下限 ---------------- */

console.log('\n⑥ 片数少于下限：给理由，不凑空步骤')

const tiny = CASES.filter((c) => c.analysis.work.tiles.length < MIN_STEPS)
if (!tiny.length) {
  console.log(`  ·  没有片数少于 ${MIN_STEPS} 的轮廓，这条没验到 —— 下面用人工造的 3 片作品补上`)
  const grid = createGrid(4, 4)
  const tiles = [
    { id: 'SQ-0-0-0', shape: 'SQ', i: 0, j: 0, rot: 0, color: '红' },
    { id: 'SQ-0-1-0', shape: 'SQ', i: 1, j: 0, rot: 0, color: '红' },
    { id: 'SQ-0-0-1', shape: 'SQ', i: 0, j: 1, rot: 0, color: '蓝' },
  ]
  const run = sequenceTiles(tiles, grid, { strategy: 'auto' })
  check('3 片 → 3 步，不是 6 步', run.ok && run.steps.length === 3, `${run.steps.length} 步`)
  check('带一句说明', Boolean(run.note), run.note)
  check('没有空步骤', run.steps.every((s) => s.tileIds.length > 0))
  check('planSizes 不产出 0', planSizes(3).every((x) => x > 0), planSizes(3).join(','))
} else {
  for (const c of tiny) {
    const run = sequenceTiles(c.analysis.work.tiles, c.grid, { strategy: 'auto' })
    // 不连通的轮廓压根拆不出来，没有「步骤」也就没有下限这回事 —— ⑦ 管那条路
    if (!run.ok) {
      console.log(`  ·  ${c.contour.id} 不连通（${run.reason?.code}），没有步骤可言，这条不适用`)
      continue
    }
    check(`${c.contour.id}（${c.analysis.work.tiles.length} 片）带说明`, Boolean(run.note), run.note)
    check(`${c.contour.id} 没有空步骤`, run.steps.every((s) => s.tileIds.length > 0))
  }
}

/* ---------------- ⑦ 不连通 ---------------- */

console.log('\n⑦ 不连通的作品：ok:false + 第一个孤儿，不排错序')

{
  const grid = createGrid(6, 4)
  const tiles = [
    { id: 'SQ-0-0-0', shape: 'SQ', i: 0, j: 0, rot: 0, color: '红' },
    { id: 'SQ-0-1-0', shape: 'SQ', i: 1, j: 0, rot: 0, color: '红' },
    { id: 'SQ-0-4-0', shape: 'SQ', i: 4, j: 0, rot: 0, color: '蓝' }, // 隔了两格，接不上
  ]
  const analysis = analyzeWork({ workId: 'W-bench-disconnected', canvas: { cols: 6, rows: 4 }, tiles })
  const run = sequenceTiles(analysis.work.tiles, grid, { strategy: 'auto' })
  check('返回 ok:false', run.ok === false)
  check('原因是 DISCONNECTED', run.reason?.code === 'DISCONNECTED', run.reason?.code)
  check('steps 是空的（没有排出一个错序）', run.steps.length === 0)
  check('指出了第一个孤儿', run.reason?.tileId === 'SQ-0-4-0', run.reason?.tileId)
  check('analyzeWork 也报了 DISCONNECTED',
    analysis.warnings.some((w) => w.code === 'DISCONNECTED'))
}

/* ---------------- 步骤图 ---------------- */

console.log('\n步骤图（buildStepSvg）')

{
  const c = CASES.find((x) => x.contour.id === 'house') ?? CASES[0]
  const work = normalizeWork({
    ...c.analysis.work,
    steps: sequenceTiles(c.analysis.work.tiles, c.grid, { strategy: 'auto' }).steps,
  })

  const svgBad = []
  work.steps.forEach((step, k) => {
    const svg = buildStepSvg({ work, index: k, showGrid: false })
    const drawn = work.tiles.filter((t) => {
      if (!SHAPES[t.shape]) return false
      for (let m = 0; m <= k; m += 1) if (work.steps[m].tileIds.includes(t.id)) return true
      return false
    })

    const paths = (svg.match(/<path /g) ?? []).length
    if (paths !== drawn.length) svgBad.push(`第 ${step.no} 步 path 数 ${paths} ≠ ${drawn.length}`)

    // 磁铁点数的期望值从 `tileMagnets()` 现算，不写死每个形状几个 ——
    // 那是个会随形状定义变的数（现在 SQ 4 / TRI-R 3 / RECT 4），写死了就是第二个真相来源
    const magnets = (svg.match(/<circle /g) ?? []).length
    const wantMagnets = drawn.reduce(
      (n, t) => n + tileMagnets(t.shape, t.rot, t.i, t.j).length,
      0,
    )
    if (magnets !== wantMagnets) svgBad.push(`第 ${step.no} 步磁铁点 ${magnets} ≠ ${wantMagnets}`)

    // 本步的片必须带品牌色描边，且只给本步的片
    const brand = (svg.match(new RegExp(`stroke="#[0-9A-Fa-f]{6}" stroke-width="2.6"`, 'g')) ?? []).length
    if (brand !== step.tileIds.length) svgBad.push(`第 ${step.no} 步品牌描边 ${brand} ≠ ${step.tileIds.length}`)

    if (svg.includes('var(')) svgBad.push(`第 ${step.no} 步有 var(`)
    if (svg.includes('class=')) svgBad.push(`第 ${step.no} 步有 class=`)
    if (svg.includes('<style')) svgBad.push(`第 ${step.no} 步有 <style`)
    if (svg.includes('url(#')) svgBad.push(`第 ${step.no} 步有 url(#`)
    if (!svg.includes(`<title>${step.caption.replace(/&/g, '&amp;')}</title>`)) {
      svgBad.push(`第 ${step.no} 步标题不对`)
    }
    if (!svg.includes(`累计 ${step.progress.done} / ${step.progress.total} 片`)) {
      svgBad.push(`第 ${step.no} 步进度数字不对`)
    }
  })
  check(`${work.steps.length} 张步骤图与 work.json 对得上`, svgBad.length === 0, svgBad.slice(0, 4).join('；'))

  // caption 是用户可见的自由文本 —— `&` 没转义会让整张图「解析失败」
  const nasty = normalizeWork({
    ...work,
    steps: [{ ...work.steps[0], caption: '第 1 步 · A & B <c> "d"' }],
  })
  const svgNasty = buildStepSvg({ work: nasty, index: 0 })
  check('caption 里的 & < > " 都转义了',
    svgNasty.includes('A &amp; B &lt;c&gt; &quot;d&quot;') && !/&(?!amp;|lt;|gt;|quot;|apos;)/.test(svgNasty))
  check('\\u0026 之外没漏：整体不含裸 & ', !/&(?!(amp|lt|gt|quot|apos);)/.test(svgNasty))

  // 取不到那一步就该炸，不能悄悄给一张别的图
  let threw = false
  try {
    buildStepSvg({ work, index: work.steps.length })
  } catch {
    threw = true
  }
  check('越界的 index 抛异常', threw)

  // 存盘 → 读回：步骤必须过一遍 normalizeWork 还活着（页面保存后要能重新载入）
  const round = normalizeWork(JSON.parse(JSON.stringify(work)))
  check('步骤能 JSON 往返（不丢字段）',
    round.steps.length === work.steps.length &&
      round.steps.every((s, k) => s.caption === work.steps[k].caption &&
        s.tileIds.join() === work.steps[k].tileIds.join() &&
        s.progress.done === work.steps[k].progress.done &&
        s.camera.zoom === work.steps[k].camera.zoom))

  // 悬空 id 应该是**警告**，不是错误 —— 过期的步骤不该让作品存不下去
  const staleWork = normalizeWork({
    ...work,
    tiles: work.tiles.slice(0, work.tiles.length - 1),
  })
  const staleAnalysis = analyzeWork(staleWork)
  check('片没了之后 stepsStaleReason 指得出悬空 id',
    Boolean(staleAnalysis.warnings.find((w) => w.code === 'STEPS_STALE')))
}

/* ---------------- 磁盘核对 ---------------- */

console.log('\n磁盘核对：assets.stepImages ↔ 真文件')

{
  const worksDir = resolve(LIB, 'works')
  const dirs = existsSync(worksDir) ? readdirSync(worksDir, { withFileTypes: true }).filter((e) => e.isDirectory()) : []
  const problems = []
  let withSteps = 0

  for (const d of dirs) {
    const file = resolve(worksDir, d.name, 'work.json')
    if (!existsSync(file)) continue
    let json
    try {
      json = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      problems.push(`${d.name}: work.json 解析不了`)
      continue
    }
    const work = normalizeWork(json)
    if (!work.steps.length) continue
    withSteps += 1

    const listed = (Array.isArray(work.assets.stepImages) ? work.assets.stepImages : []).map(String)
    if (!listed.length) {
      problems.push(`${d.name}: 有 ${work.steps.length} 步却没有 assets.stepImages`)
      continue
    }
    // **不比对「项数 == 步数」**：一步两张图（.svg 给打印和二次编辑，.png 给
    // 小红书/抖音），项数天然是步数的两倍；而某天只出一种格式的清单也是合法的。
    // 真正的不变量是「每一步都有图」，下面分开查三件事：清单↔盘上互相都在，
    // 以及每一步至少有一张图。
    for (const p of listed) {
      if (!existsSync(resolve(LIB, p))) problems.push(`${d.name}: 清单里的 ${p} 不在盘上`)
    }
    // 目录里躺着的步骤文件必须都在清单里 —— 没有删除路由，残留文件删不掉，
    // 所以「清单」是唯一事实来源，对不上就说明有人手改过目录
    const onDisk = readdirSync(resolve(worksDir, d.name)).filter((f) => /^step-\d+\.(svg|png)$/.test(f))
    for (const f of onDisk) {
      if (!listed.some((p) => p.endsWith(`/${f}`))) problems.push(`${d.name}: 盘上的 ${f} 不在清单里`)
    }
    for (let k = 1; k <= work.steps.length; k += 1) {
      const stem = `step-${String(k).padStart(2, '0')}.`
      if (!listed.some((p) => p.includes(`/${stem}`))) {
        problems.push(`${d.name}: 第 ${k} 步在清单里一张图都没有`)
      }
    }
  }

  check('每个有步骤的作品，清单与盘上文件互相对得上', problems.length === 0, problems.slice(0, 4).join('；'))
  if (!withSteps) {
    console.log(`  ·  盘上 ${dirs.length} 个作品目录里一个带步骤的都没有 —— 这条**现在是空过的**，`)
    console.log('     等 M7 页面保存过一次步骤才真正开始起作用。')
  } else {
    console.log(`  ·  核对了 ${withSteps} 个带步骤的作品`)
  }
}

/* ---------------- 汇总 ---------------- */

if (verbose) {
  const c = CASES.find((x) => x.contour.id === 'house') ?? CASES[0]
  const run = sequenceTiles(c.analysis.work.tiles, c.grid, { strategy: 'auto' })
  console.log(`\n-- ${c.contour.id} 自动策略 ${run.strategy}，${run.steps.length} 步 --`)
  for (const s of run.steps) {
    console.log(`   ${s.no}. ${s.caption}   [${s.progress.done}/${s.progress.total}]`)
  }
}

console.log(`\n${'─'.repeat(78)}`)
console.log(`${pass} 过 / ${fail} 不过`)
if (fail) {
  console.log(`不过的：${failures.join('、')}`)
  process.exit(1)
}
