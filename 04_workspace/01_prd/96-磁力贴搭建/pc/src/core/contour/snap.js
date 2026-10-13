/**
 * 把 AI（或手工）给的多边形吸附到格点上。
 *
 * 磁力片只能放在格点上，边只有 0/45/90/135 四个方向 —— 而 AI 给的轮廓是描着
 * 插画边缘画出来的，顶点可能落在任意小数位置。这一步就是把它拉回格子。
 *
 * 三处容易写错、写错了会「明明能拼的轮廓被判失败」的地方：
 *
 * 1. **放松的单位是顶点，不是边。** 一个顶点同时属于两条边。逐边修的话，
 *    修好第 k 条必然把第 k+1 条推歪，三条边以上的链永远收敛不了。
 *    所以每遍扫的是顶点，每个顶点一次同时照顾左右两条边。
 *
 * 2. **成败判据是「位移预算」，不是「方向不在容差内」。** 任何一条边都能靠移动
 *    端点掰成 45°，区别只在要挪多远 —— 把 30° 的边掰到 45° 要挪 1.69 格，
 *    那不叫吸附，叫重画。所以角容差只负责**选**目标方向，位移上限负责**判**成败。
 *
 * 3. **「已对齐」的定义是「角度精确等于族方向」，不是「偏差小于容差」。**
 *    一条偏了 3.87° 的边落在 15° 容差里，但它不是 0° 也不是 45°，
 *    `isGridFriendly(poly, 0.5)` 会否掉它 —— 于是「吸附成功」返回了一个
 *    没吸附干净的多边形，后面栅格化出来的原子全是错的。
 *
 * 失败时 `poly` 返回**空数组**，半成品放在 `bestEffort` 里（与 solver 同名同义：
 * 「给你看」的数据，不是「能用」的数据）。绝不能返回半成品 —— 否则总会有一条
 * 分支把它喂进 solveContour，然后得到一个 L4 的谜题。
 */
import {
  bboxOf,
  dedupeAdjacent,
  dropCollinear,
  edgeAngles,
  isSimple,
  polygonArea,
  signedArea,
  simplify,
  translateToOrigin,
} from './polygon.js'

/** 网格友好的四个方向。角度是「轴方向」不是「射线方向」，所以 45 与 135 各代表一族斜线。 */
const FAMILY = [0, 45, 90, 135]

const DEFAULTS = {
  /** DP 简化容差，由小到大试；取第一个让顶点数降到 maxVertices 以内的档 */
  dpTolerances: [0.35, 0.6, 1.0, 1.5],
  maxVertices: 48,
  /** AI 有时把边缘上每个像素都当成一个顶点。isSimple 是 O(n²)，先卡住再简化 */
  hardVertexCap: 400,
  /** 单个顶点允许离它的取整位置多远（格）。超过就判失败，不硬掰 */
  vertexBudget: 1.0,
  /** 离最近的族方向超过这个角度 = 骑墙（22.5° 最典型），往哪边掰都是大挪动 */
  ambiguityTol: 20,
  /** 吸附后的面积下限（一个整格是 1.0，最小的零件是半个格） */
  minArea: 0.5,
  /** 吸附后面积掉到吸附前的这个比例以下 = 形状被压塌了 */
  collapseRatio: 0.4,
  maxPasses: 3,
  closeTol: 1e-9,
}

/**
 * @param {Array<[number, number]>} poly 顶点数组，格子坐标（1 = 一格），y 轴向下
 * @param {object} [options] 见 DEFAULTS，每个键都能单独覆盖
 */
export function snapToGrid(poly, options = {}) {
  const o = { ...DEFAULTS, ...options }

  const stats = {
    verticesIn: Array.isArray(poly) ? poly.length : 0,
    verticesOut: 0,
    areaBefore: 0,
    areaAfter: 0,
    /** 成功时必然 0；失败时是最歪那条边差了多少度 */
    maxDeviation: 0,
    /** 失败时：把最歪那条边掰正，至少要把顶点挪多少格 */
    maxRequiredMove: 0,
    /** 取整那一步挪得最远的顶点（格）。上半格以内是量子化，不算变形 */
    roundMove: 0,
    /** 放松那一步挪得最远的顶点（格）。这才是「吸附把形状掰歪了多少」 */
    maxMove: 0,
    movedVertices: 0,
    /** 取整之后就没对齐、要靠放松修的边数 */
    relaxedEdges: 0,
    passes: 0,
    dpTolerance: 0,
  }
  const ctx = { raw: [], offset: { dx: 0, dy: 0 }, flipped: false, warnings: [], bestEffort: [] }

  const done = (code, reason, offendingEdges = []) => ({
    ok: false,
    reasonCode: code,
    reason,
    poly: [],
    bestEffort: ctx.bestEffort,
    raw: ctx.raw,
    offset: ctx.offset,
    flipped: ctx.flipped,
    stats,
    edges: ctx.bestEffort.length >= 3 ? edgeAngles(ctx.bestEffort) : [],
    offendingEdges,
    warnings: ctx.warnings,
  })

  /* ---- 0. 兜底 ---- */

  if (!Array.isArray(poly) || poly.length < 3) {
    return done('TOO_FEW_VERTICES', `轮廓只有 ${stats.verticesIn} 个顶点，围不成一个面。`)
  }
  if (poly.length > o.hardVertexCap) {
    return done(
      'TOO_MANY_VERTICES',
      `轮廓有 ${poly.length} 个顶点，超过 ${o.hardVertexCap} 的上限 —— 看着像是把边缘上的每个像素都当成一个点了。`,
    )
  }

  /* ---- 1. 方向归一 ---- */

  // y 轴向下，所以顺时针是 signedArea > 0。跟 outlineFromMask 的输出保持同向，
  // 报告里的对称性与镜像判断才不会突然反号。
  let ring = poly.map(([x, y]) => [x, y])
  if (signedArea(ring) < 0) {
    ring = ring.slice().reverse()
    ctx.flipped = true
  }

  /* ---- 2. 简化 ---- */

  // polygon.js 的 simplify 是**按开链写的**（它固定 keep[0] 与 keep[n-1]，末尾还会
  // 去掉重复的首点）。直接把闭合环喂进去，起点/终点那一刀会切错 —— 所以先把环
  // 从起点处剪开、末尾补一个重复的起点，跑完让 simplify 自己去重。
  let simplified = null
  let degenerateAt = null
  for (const tol of o.dpTolerances) {
    const s = dedupeAdjacent(simplify(ring.concat([ring[0]]), tol))
    if (s.length < 3) {
      degenerateAt = tol
      continue
    }
    if (s.length <= o.maxVertices) {
      simplified = s
      stats.dpTolerance = tol
      break
    }
  }
  if (!simplified) {
    if (degenerateAt !== null) {
      return done('AREA_TOO_SMALL', '轮廓简化之后连 3 个顶点都剩不下 —— 这个形状太细了。')
    }
    const maxTol = o.dpTolerances[o.dpTolerances.length - 1]
    return done(
      'TOO_MANY_VERTICES',
      `轮廓简化到容差 ${maxTol} 格还是超过 ${o.maxVertices} 个顶点，太碎了。`,
    )
  }
  ctx.raw = simplified
  stats.areaBefore = polygonArea(simplified)

  /* ---- 3. 顶点落到格点 ---- */

  // 后面所有放松都是整数运算（投影用的是整数步长 t），所以「先整体取整、再放松方向」
  // 这个顺序换来的好处是：放松永远不会破坏整数性。
  let lattice = simplified.map(([x, y]) => [Math.round(x), Math.round(y)])
  stats.roundMove = maxPairDist(simplified, lattice)
  lattice = dedupeAdjacent(lattice)
  lattice = dropCollinear(lattice)
  if (lattice.length < 3) {
    return done('AREA_TOO_SMALL', '取整之后轮廓塌成了一条线或一个点 —— 这个形状比一个格还窄。')
  }

  const areaLattice = polygonArea(lattice)
  stats.areaAfter = areaLattice
  if (areaLattice < o.minArea) {
    return done('AREA_TOO_SMALL', `吸附后面积只有 ${areaLattice.toFixed(2)} 格，不到下限 ${o.minArea}。`)
  }
  if (areaLattice < o.collapseRatio * stats.areaBefore) {
    return done(
      'AREA_COLLAPSE',
      `吸附后面积从 ${stats.areaBefore.toFixed(2)} 格掉到 ${areaLattice.toFixed(2)} 格，形状被压塌了。`,
    )
  }
  if (!isSimple(lattice)) {
    return done('SELF_INTERSECT', '轮廓的边和边交叉了（自交），围不出一个合法的目标区域。')
  }

  // 取整之后就没对齐的边，记个数 —— 这些正是要放松的
  stats.relaxedEdges = countUnaligned(lattice)
  ctx.bestEffort = lattice.map((p) => [p[0], p[1]])

  /* ---- 4. 方向放松 ---- */

  // 扫顶点、不扫边。每个顶点挑一个候选位置，判据是局部的
  // (不满足的边数, 两条边的偏差和) 严格变小 —— 允许「边数不变但偏差更小」，
  // 因为「修好这条、弄坏那条」的中转状态正是要多跑几遍的理由。
  //
  // 每次接受的移动都让全局的 (Σ不满足边数, Σ偏差) 严格变小，而它下有界，
  // 所以循环必然收敛，不会在两个状态之间来回抖。
  const origin = lattice.map((p) => [p[0], p[1]])
  const moved = lattice.map(() => 0)

  for (let pass = 1; pass <= o.maxPasses; pass += 1) {
    stats.passes = pass
    let changed = false
    for (let k = 0; k < lattice.length; k += 1) {
      if (vertexOk(lattice, k)) continue
      const best = pickVertex(lattice, k, o)
      if (!best) continue
      // 预算判的是「离取整后的原始位置有多远」—— 来回挪也算在同一个预算里
      const move = Math.hypot(best.point[0] - origin[k][0], best.point[1] - origin[k][1])
      if (move > o.vertexBudget) continue
      lattice[k] = best.point
      moved[k] = move
      changed = true
    }
    if (!changed) break
  }

  // TODO(02 文档 §3.3)：网格原点还有 16 种整体偏移没试（config.js:43 把这件事
  // 归给轮廓管线）。现在不做 —— 吸附本身已经能把轮廓拉到格点上，而多出来的
  // 「哪个偏移赢了」这个问题页面没地方显示，用户也没法拿它做决定。

  /* ---- 5. 终检 ---- */

  // 先剪枝再看对齐。删的是共线点，删完边上剩下的两点方向不变，所以剪枝不会
  // 把已经对齐的边弄歪 —— 这也是为什么可以在终检前放心剪。
  lattice = dedupeAdjacent(lattice)
  lattice = dropCollinear(lattice)
  if (lattice.length < 3) {
    return done('AREA_TOO_SMALL', '放松之后轮廓塌掉了，剩下的点围不成一个面。')
  }

  // 断言语义：放松全程整数运算，坐标不可能掉出格点。真掉了就是程序 bug，
  // 报出来而不是悄悄修（跟 polygon.js 里 isSimple 那段一个态度）。
  for (const [x, y] of lattice) {
    if (Math.abs(x - Math.round(x)) > o.closeTol || Math.abs(y - Math.round(y)) > o.closeTol) {
      return done('NOT_INTEGER', `吸附结果里出现了非格点坐标 (${x}, ${y}) —— 这是程序 bug。`)
    }
  }

  stats.maxMove = Math.max(0, ...moved)
  stats.movedVertices = moved.filter((m) => m > 0).length
  // 放松会改面积（把 141° 掰成 135° 就是这么改的），所以这里得重算一遍 ——
  // 拿取整后、放松前的那个数报出去，页面上「原图 11.0 → 吸附后 10.0」就对不上最终那张图。
  stats.areaAfter = polygonArea(lattice)
  ctx.bestEffort = lattice.map((p) => [p[0], p[1]])

  const offending = []
  let ambiguous = 0
  let worstDev = 0
  let worstNeed = 0
  for (let e = 0; e < lattice.length; e += 1) {
    const t = edgeTarget(lattice, e, o.ambiguityTol)
    if (t.exact) continue
    offending.push(e)
    if (t.dir == null) ambiguous += 1
    const dev = edgeTarget(lattice, e, Infinity).dev
    if (dev > worstDev) worstDev = dev
    const need = requiredMove(lattice, e)
    if (Number.isFinite(need) && need > worstNeed) worstNeed = need
  }

  if (offending.length > 0) {
    stats.maxDeviation = worstDev
    stats.maxRequiredMove = worstNeed
    if (ambiguous > 0) {
      return done(
        'AMBIGUOUS_EDGE',
        `有 ${ambiguous} 条边的方向正好卡在两个可用的方向中间（最歪的差 ${worstDev.toFixed(1)}°），` +
          '往哪边掰都是大挪动。这种斜度磁力片接不上，得换张草图。',
        offending,
      )
    }
    // 两种失败原因，报错得分开说 —— 都说成「超预算」的话，会指导用户往错的方向改图。
    // 8:1 极缓坡（[[0,0],[8,0],[0,1]]）就属于后者：掰正只要挪 1.00 格、正好在预算上，
    // 但挪过去会把邻边弄歪，所以不是「太远」而是「没有两全的落点」。
    const why =
      worstNeed > o.vertexBudget
        ? `掰正它至少要把顶点挪 ${worstNeed.toFixed(2)} 格，超过上限 ${o.vertexBudget} 格 —— 这不是吸附，是重画。`
        : '挪得动，但挪过去会把相邻的那条边弄歪，找不到一个能让两条边同时归位的格点。'
    return done(
      'EDGE_NOT_SNAPPABLE',
      `还有 ${offending.length} 条边没对齐，最歪的一条差 ${worstDev.toFixed(1)}°；${why}`,
      offending,
    )
  }

  // 只在**用满**预算时才提示。斜边修一格（|dx|-|dy|=1 的 45° 斜坡）正好花掉 1.0，
  // 那是设计内的常规操作，报出来只会变成噪声；贴着上限才算真该看一眼。
  if (stats.maxMove >= o.vertexBudget - o.closeTol) {
    ctx.warnings.push({
      code: 'BUDGET_SPENT',
      message: `有顶点挪了 ${stats.maxMove.toFixed(2)} 格，把位移预算（${o.vertexBudget} 格）用满了 —— 这一处已经贴着「吸附」和「重画」的分界线。`,
    })
  }

  const { minX, minY } = bboxOf(lattice)
  ctx.offset = { dx: -minX, dy: -minY }
  const out = translateToOrigin(lattice)
  stats.verticesOut = out.length

  return {
    ok: true,
    reasonCode: '',
    reason: '',
    poly: out,
    bestEffort: out,
    raw: ctx.raw,
    offset: ctx.offset,
    flipped: ctx.flipped,
    stats,
    edges: edgeAngles(out),
    offendingEdges: [],
    warnings: ctx.warnings,
  }
}

/* ------------------------------------------------------------------ */
/* 边的方向                                                            */
/* ------------------------------------------------------------------ */

/**
 * 第 e 条边（poly[e] → poly[e+1]）的目标方向。
 *
 * `exact` 是「已经精确对齐」——整数端点之间，|dx|==|dy| 就是 45°，有一个为 0
 * 就是水平或竖直。这个判定是精确整数比较，不是容差比较，正是为了让
 * 「吸附成功」等价于「isGridFriendly 必真」。
 *
 * `dir` 是「该往哪个族方向掰」，骑墙时返回 null（掰不动，别硬掰）。
 */
function edgeTarget(pts, e, ambiguityTol) {
  const n = pts.length
  const [x1, y1] = pts[e]
  const [x2, y2] = pts[(e + 1) % n]
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) return { exact: false, dir: null, dev: 180 }

  const exact = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)

  const deg = (Math.atan2(dy, dx) * 180) / Math.PI
  const norm = ((deg % 180) + 180) % 180
  let dir = FAMILY[0]
  let dev = Infinity
  for (const t of FAMILY) {
    const d = Math.min(Math.abs(norm - t), 180 - Math.abs(norm - t))
    if (d < dev) {
      dev = d
      dir = t
    }
  }
  return { exact, dir: dev > ambiguityTol ? null : dir, dev }
}

/** 顶点 k 的左右两条边都精确对齐 */
function vertexOk(pts, k) {
  const n = pts.length
  return edgeTarget(pts, (k - 1 + n) % n, Infinity).exact && edgeTarget(pts, k, Infinity).exact
}

/**
 * 顶点 k 的局部代价：(不对齐的边数, 两条边的偏差和)。
 * 位移不进这个比较 —— 它只在同分候选之间做最后的 tiebreak。
 */
function cost(pts, k) {
  const n = pts.length
  let bad = 0
  let dev = 0
  for (const e of [(k - 1 + n) % n, k]) {
    const t = edgeTarget(pts, e, Infinity)
    if (t.exact) continue
    bad += 1
    dev += t.dev
  }
  return { bad, dev }
}

/**
 * 顶点 k 的候选位置：原地，加上「投到左邻边/右邻边的目标方向」给出的格点。
 *
 * 每个候选都是一次局部搜索 —— 只看自己这两条边好不好，不管别人。全局最优吸附是个
 * 研究问题，而「每顶点几个候选 + 多跑几遍」在真实轮廓上已经够用。
 *
 * 投影点**不止一个**：斜线族那边的垂足常落在两个格点正中间，两个一样近但不等价。
 * 三角形 [[0,0],[5,0],[0,4]] 就是活例子 —— 把 (0,4) 挪到 (1,4) 能修好斜边却把
 * 竖直边弄歪了，挪到 (0,5) 则两条边同时对齐。距离都是 1.0，只有把两个都摆出来
 * 让代价函数挑，才选得对。只取「最近的一个」会把这个本该成功的轮廓判失败。
 */
function candidates(pts, k, o) {
  const n = pts.length
  const v = pts[k]
  const prev = pts[(k - 1 + n) % n]
  const next = pts[(k + 1) % n]
  const out = [[v[0], v[1]]]

  for (const [other, e] of [
    [prev, (k - 1 + n) % n],
    [next, k],
  ]) {
    const t = edgeTarget(pts, e, o.ambiguityTol)
    if (t.dir == null) continue
    for (const p of projectOntoDir(v, other, t.dir)) {
      // 落到邻点上就是零长边，直接淘汰
      if ((p[0] === prev[0] && p[1] === prev[1]) || (p[0] === next[0] && p[1] === next[1])) continue
      out.push(p)
    }
  }
  return out
}

/**
 * 把 v 挪到「过 other、方向为 dir」的那条直线上的**格点**，返回距离最近的一两个。
 *
 * 因为 other 与 v 都已经是整数、直线又是 0/45/90/135，这些点天然是整数 ——
 * 这是「先整体取整、再放松方向」这个顺序换来的。
 */
function projectOntoDir(v, other, dir) {
  const dx = v[0] - other[0]
  const dy = v[1] - other[1]
  if (dir === 0) return [[v[0], other[1]]]
  if (dir === 90) return [[other[0], v[1]]]
  // 45 与 135 各是一族斜线。点积给出参数 t，正负号自动就对。
  // 垂足正好落在两个整数参数正中间时（t 是半整数）两边都返回，让代价函数去挑。
  const u = dir === 45 ? [1, 1] : [1, -1]
  const tRaw = (dx * u[0] + dy * u[1]) / 2
  const lo = Math.floor(tRaw)
  const hi = Math.ceil(tRaw)
  const out = [[other[0] + lo * u[0], other[1] + lo * u[1]]]
  if (hi !== lo) out.push([other[0] + hi * u[0], other[1] + hi * u[1]])
  return out
}

/** 顶点 k 的最佳候选；没有能严格变好的就返回 null */
function pickVertex(pts, k, o) {
  const cur = cost(pts, k)
  let best = null
  for (const point of candidates(pts, k, o)) {
    const trial = pts.map((p, idx) => (idx === k ? point : p))
    const c = cost(trial, k)
    const better = c.bad < cur.bad || (c.bad === cur.bad && c.dev < cur.dev - 1e-9)
    if (!better) continue
    const move = Math.hypot(point[0] - pts[k][0], point[1] - pts[k][1])
    const key = [c.bad, c.dev, move]
    if (!best || keyLess(key, best.key)) best = { point, key }
  }
  return best
}

/** 把第 e 条边掰到族方向上，两个端点各自最少要挪多少格；取小的那个 */
function requiredMove(pts, e) {
  const n = pts.length
  const t = edgeTarget(pts, e, Infinity)
  if (t.dir == null) return Infinity
  const a = e
  const b = (e + 1) % n
  let best = Infinity
  for (const [idx, other] of [
    [a, pts[b]],
    [b, pts[a]],
  ]) {
    for (const p of projectOntoDir(pts[idx], other, t.dir)) {
      best = Math.min(best, Math.hypot(p[0] - pts[idx][0], p[1] - pts[idx][1]))
    }
  }
  return best
}

/** 两个等长点列逐点距离的最大值。取整那一步的位移就靠它报出来。 */
function maxPairDist(a, b) {
  let m = 0
  for (let k = 0; k < a.length && k < b.length; k += 1) {
    m = Math.max(m, Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1]))
  }
  return m
}

function countUnaligned(pts) {
  let n = 0
  for (let e = 0; e < pts.length; e += 1) {
    if (!edgeTarget(pts, e, Infinity).exact) n += 1
  }
  return n
}

/** 三元组字典序：先比不对齐的边数，再比偏差和，最后才比位移 */
function keyLess(a, b) {
  if (a[0] !== b[0]) return a[0] < b[0]
  if (a[1] !== b[1]) return a[1] < b[1]
  return a[2] < b[2]
}
