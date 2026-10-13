/**
 * 从「一堆片」到「有序搭建序列」。
 *
 * 求解器给的是片的**集合**，不是搭建顺序 —— 顺序要单独生成，而且有硬约束：
 * 实物没有底座，每片新磁力片必须与已经搭好的结构共边，否则放上去就掉。
 * 这条约束的判据在 `geometry/adjacency.js` 里已经实现好了（`firstDisconnectedStep`），
 * 这里做的是**排序与合并**。
 *
 * 三层，各自只管一件事：
 *
 *   orderTiles   （orderings.js）  只回答「先想要哪一片」
 *   growOrder                       只回答「想先要，但此刻搭得上吗」
 *   planSizes + 切块                只回答「多少片并成一步」
 *
 * ## 可搭性是构造上的定理，不是验出来的
 *
 * `growOrder` 每次只从「与已放集合相邻」的片里挑，所以它产出的序列逐片合法；
 * 而步骤是**这条序列上的连续段**，第 k 步里每一片（连同本步更早的片）都与前面
 * 所有步相邻。于是「每一步都能搭得上」不需要额外保证。
 *
 * 但**不能因此就省掉验证** —— `firstDisconnectedStep` 是**独立**去验的，
 * 和 `analyzeWork` 复算求解器是同一个思路。构造保证正确性，独立验证抓的是
 * 「有人改了 growOrder 的实现、忘了这条推理」。`bench:steps` 的每一条都跑它。
 *
 * ## 不连通的作品排不出序
 *
 * 这时返回 `{ ok:false, reason:{ code:'DISCONNECTED', atIndex, remaining } }`，
 * **绝不悄悄排出一个错序** —— 一个能导出、看起来正常的错序，比一个明确的失败
 * 危险得多。`analyzeWork` 已经会报 `DISCONNECTED` 警告，Steps 页照着显示即可。
 */
import {
  CAMERA_SPAN,
  DEFAULT_PIECES_PER_STEP,
  MAX_STEPS,
  MIN_STEPS,
} from '../config.js'
import { buildAdjacency } from '../geometry/adjacency.js'
import { SHAPES, atomsAt } from '../geometry/shapes.js'
import { tileBox } from '../model/work.js'
import { STRATEGIES, orderTiles } from './orderings.js'

/* ---------------- 生长 ---------------- */

/**
 * 把优先级排列变成**真的搭建序**：从头开始，每次只在「与已放集合相邻」的片里挑
 * 优先级最高的那片。
 *
 * 片子集连通时（`analyzeWork` 会说），从任意一片出发这样贪心一定能把所有片吃完，
 * 所以「提前吃完」只可能是**不连通**。
 *
 * @param {object[]} tiles
 * @param {object} grid
 * @param {number[]} priority  片的下标排列，优先级从高到低
 * @returns {{ order: number[], reason: null | object }}
 */
export function growOrder(tiles, grid, priority) {
  const n = tiles.length
  if (!n) return { order: [], reason: null }

  const tileAtoms = tiles.map((t) => atomsAt(grid, t.shape, t.rot, t.i, t.j))
  const bad = tileAtoms.findIndex((a) => a === null)
  if (bad >= 0) {
    return {
      order: [],
      reason: {
        code: 'BAD_TILE',
        atIndex: 0,
        remaining: n,
        tileId: tiles[bad].id,
        message: `第 ${bad + 1} 片（${tiles[bad].id}）放不到画布上（形状不认识或越界），排不了序。`,
      },
    }
  }

  // 名次表：优先级排列的逆。挑片时比的是名次，不是下标
  const rank = new Array(n)
  priority.forEach((idx, r) => {
    rank[idx] = r
  })

  const adj = buildAdjacency(tileAtoms, grid)
  const placed = new Array(n).fill(false)

  const first = priority[0]
  placed[first] = true
  const order = [first]

  while (order.length < n) {
    let best = -1
    for (let k = 0; k < n; k += 1) {
      if (placed[k]) continue
      let touching = false
      for (const nb of adj[k]) {
        if (placed[nb]) {
          touching = true
          break
        }
      }
      if (!touching) continue
      if (best < 0 || rank[k] < rank[best]) best = k
    }
    if (best < 0) break
    placed[best] = true
    order.push(best)
  }

  if (order.length < n) {
    const orphan = priority.find((k) => !placed[k])
    return {
      order,
      reason: {
        code: 'DISCONNECTED',
        atIndex: order.length,
        remaining: n - order.length,
        tileId: tiles[orphan].id,
        message:
          `搭到第 ${order.length} 片就接不下去了：还有 ${n - order.length} 片（如 ${tiles[orphan].id}）` +
          `与前面搭好的部分不共边。实物会散架，步骤也拆不出来 —— 先回实际搭建页把它们连起来。`,
      },
    }
  }

  return { order, reason: null }
}

/* ---------------- 合并 ---------------- */

/**
 * 要切成几步、每步几片。
 *
 * 块大小 `floor(n/S)`，前 `n % S` 块各多一片 —— 于是**每块至少一片**，
 * 不产出空步骤。片数少于下限时下限就降到片数（4 片的作品就是 4 步，
 * 不拿「第 5 步：空」来凑够 6 步）。
 */
export function planSizes(n, { perStep = DEFAULT_PIECES_PER_STEP, minSteps = MIN_STEPS, maxSteps = MAX_STEPS } = {}) {
  if (n <= 0) return []
  const effMin = Math.min(minSteps, n)
  const want = Math.round(n / perStep)
  const S = Math.max(1, Math.min(n, Math.min(maxSteps, Math.max(effMin, want))))
  const base = Math.floor(n / S)
  const extra = n % S
  return Array.from({ length: S }, (_, k) => base + (k < extra ? 1 : 0))
}

/** 形状名，用来写不写颜色的步骤文案。`SHAPES` 是唯一定义处，这里不另起一套短名。 */
const shapeName = (id) => SHAPES[id]?.name ?? id

/**
 * 步骤文案。**绝不写颜色名** —— 见下面 `cameraFor` 那段注释里同一个理由：
 * 颜色是求解器第二遍软约束的结果，换一批库存就会变，而文案是给人看、会被复制到
 * 抖音文案里的，不能跟着库存漂。
 *
 * 写的是**本步的形状构成**，纯粹由 `work.json` 决定。
 */
function captionOf(no, tileIdxs, tiles) {
  const count = new Map()
  for (const k of tileIdxs) {
    const s = tiles[k].shape
    count.set(s, (count.get(s) ?? 0) + 1)
  }
  // 按 SHAPES 的声明顺序排（SQ / TRI-R / RECT），不按数量 —— 顺序稳定才好对照
  const order = Object.keys(SHAPES)
  const parts = order
    .filter((s) => count.has(s))
    .map((s) => `${shapeName(s)} ×${count.get(s)}`)
  return `第 ${no} 步 · ${parts.join(' + ')}（共 ${tileIdxs.length} 片）`
}

/** 一组片的并集包围盒。形状不认识的片跳过（那是数据写错了，不该把拆解炸掉）。 */
function unionBox(list) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const t of list) {
    if (!SHAPES[t.shape]) continue
    const b = tileBox(t.shape, t.rot, t.i, t.j)
    x0 = Math.min(x0, b.x)
    y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.w)
    y1 = Math.max(y1, b.y + b.h)
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null
}

/**
 * 这一步的镜头。
 *
 * 包围盒取的是**累计到本步**的所有片，不是本步自己的片：步骤图里更早的片是画出来的
 * （淡一档），镜头要是只框本步那几片，画面上就会有半张图在框外。视频二期真拿它推镜头时，
 * 也应当是「镜头跟着越搭越大的整体走」。
 *
 * `zoom` 只算不消费。**静态步骤图绝不能按它裁切** —— 一裁切，孩子在整块板上找位置
 * 就没法用了，而「照着图搭」正是这些图的全部用途。
 */
function cameraFor(list) {
  const b = unionBox(list)
  if (!b) return { cx: 0, cy: 0, zoom: 1 }
  const span = Math.max(b.x1 - b.x0, b.y1 - b.y0, 1)
  const r3 = (v) => Number(v.toFixed(3))
  return {
    cx: r3((b.x0 + b.x1) / 2),
    cy: r3((b.y0 + b.y1) / 2),
    zoom: r3(Math.max(0.5, Math.min(2, CAMERA_SPAN / span))),
  }
}

/* ---------------- 组装 ---------------- */

/** 一个策略跑到底：优先级 → 生长 → 合并。`chooseStrategy` 也用它 */
function build(tiles, grid, strategy, opts) {
  const { perStep, minSteps, maxSteps, centroid } = opts
  const priority = orderTiles(tiles, grid, strategy, { centroid })
  const grown = growOrder(tiles, grid, priority)
  if (grown.reason) return { ok: false, strategy, order: grown.order, steps: [], reason: grown.reason }

  const sizes = planSizes(tiles.length, { perStep, minSteps, maxSteps })
  const steps = []
  const cumulative = []
  let cursor = 0
  sizes.forEach((size, k) => {
    const block = grown.order.slice(cursor, cursor + size)
    cursor += size
    for (const t of block) cumulative.push(tiles[t])
    steps.push({
      no: k + 1,
      tileIds: block.map((t) => tiles[t].id),
      caption: captionOf(k + 1, block, tiles),
      // 累计到本步，不是本步的片数 —— 进度条要显示的是「搭了多少 / 一共多少」
      progress: { done: cumulative.length, total: tiles.length },
      camera: cameraFor(cumulative),
    })
  })

  const note =
    tiles.length < minSteps
      ? `只有 ${tiles.length} 片，不到 ${minSteps} 步的下限，就按 ${sizes.length} 步拆完，不拿空步骤凑数。`
      : ''

  return { ok: true, strategy, order: grown.order, steps, note, reason: null }
}

/** 各步包围盒面积之和 —— 越小越局部，孩子越搭得动 */
function localityOf(run, byId) {
  let sum = 0
  for (const step of run.steps) {
    const b = unionBox(step.tileIds.map((id) => byId.get(id)).filter(Boolean))
    if (b) sum += (b.x1 - b.x0) * (b.y1 - b.y0)
  }
  return sum
}

/**
 * 自动挑策略：四个都跑一遍，取**确定性局部性得分**最小的。
 *
 * 判据的次序是有讲究的：先比「排不排得出来」（不连通的直接出局），再比各步包围盒
 * 面积之和（每步越紧凑，步骤图上的红框越小，孩子越找得到位置），最后按策略 id 的
 * 声明序兜底 —— 兜底项是必须的，否则「两个策略得分恰好相同」时结果就取决于
 * `Array.sort` 的实现细节了。
 *
 * 界面可以覆盖这个选择；默认用它。
 */
export function chooseStrategy(tiles, grid, opts = {}) {
  return chooseRun(tiles, grid, opts).run.strategy
}

function chooseRun(tiles, grid, opts) {
  const full = {
    perStep: opts.perStep ?? DEFAULT_PIECES_PER_STEP,
    minSteps: opts.minSteps ?? MIN_STEPS,
    maxSteps: opts.maxSteps ?? MAX_STEPS,
    centroid: opts.centroid,
  }
  const byId = new Map(tiles.map((t) => [t.id, t]))

  let best = null
  for (const id of STRATEGIES) {
    const run = build(tiles, grid, id, full)
    const score = [run.ok ? 0 : 1, run.ok ? localityOf(run, byId) : 0, STRATEGIES.indexOf(id)]
    if (!best || cmpScore(score, best.score) < 0) best = { run, score }
  }
  return best
}

function cmpScore(a, b) {
  for (let k = 0; k < a.length; k += 1) {
    if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1
  }
  return 0
}

/**
 * 拆解入口。
 *
 * @param {object[]} tiles  `analysis.work.tiles`
 * @param {object} grid
 * @param {object} [opts]
 * @param {'auto'|string} [opts.strategy]
 * @param {number} [opts.perStep]   每步目标片数
 * @param {number} [opts.minSteps]
 * @param {number} [opts.maxSteps]
 * @returns {{ ok, strategy, order, steps, note?, reason }}
 */
export function sequenceTiles(tiles, grid, opts = {}) {
  if (!tiles?.length) {
    return {
      ok: false,
      strategy: null,
      order: [],
      steps: [],
      reason: {
        code: 'EMPTY',
        atIndex: 0,
        remaining: 0,
        message: '这份作品还没有片，没有什么可拆的。',
      },
    }
  }

  const full = {
    perStep: opts.perStep ?? DEFAULT_PIECES_PER_STEP,
    minSteps: opts.minSteps ?? MIN_STEPS,
    maxSteps: opts.maxSteps ?? MAX_STEPS,
    centroid: opts.centroid,
  }

  if (!opts.strategy || opts.strategy === 'auto') return chooseRun(tiles, grid, full).run

  return build(tiles, grid, opts.strategy, full)
}
