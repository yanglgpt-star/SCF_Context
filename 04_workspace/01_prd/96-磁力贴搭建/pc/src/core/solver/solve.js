/**
 * 求解入口：轮廓 → 一套能照着搭的磁力片。
 *
 * 整体流程
 *   1. 轮廓归一化（平移到原点、自交检查）
 *   2. 栅格化成原子三分类（FULL 必盖 / PARTIAL 可选 / OUTSIDE 禁碰）
 *   3. 按 L0→L5 逐级尝试，每级：
 *        a. 枚举候选放置（形状 × 旋转 × 位置）
 *        b. 数每个必须原子的候选数 —— 候选数为 0 的是**注定补不上的洞**
 *        c. 装成 DLX 矩阵，跑若干次（换种子，顺序不同结果不同），每次收多个解
 *        d. 解打分，挑最好的；过了这级的闸门就返回，否则放到下一级
 *   4. L3 起不再限制库存，报告里列出该补哪些片
 *
 * 三处刻意的取舍
 *
 * **留白不是「允许漏掉某些原子」，而是「把某些原子从必须列里摘出去」。**
 * 在 DLX 里加一条「最多 n 个未覆盖」的全局约束要拆列复制，矩阵会炸；摘列只是
 * 改一个 Uint8Array 的某一位。哪几个原子可以摘呢 —— 摘候选最少的那个，
 * 因为「候选少」正是「这里难盖」的代理指标。摘一个不行再摘下一个，次数由这级的
 * 留白额度卡住，所以重试是有界的。
 *
 * **溢出不是「给一个数量额度」，而是「在空间上放开贴着轮廓的一圈」。**
 * 同样绕开基数约束，而且更符合直觉：压出轮廓的片子只可能紧贴轮廓。
 *
 * **确定性**：种子由 work 标题哈希出来，同样输入永远同样输出。用户改一个颜色
 * 就看到布局全变，那是灾难 —— 而配色根本不在这一层，改了也影响不到这里。
 *
 * 锁定片（`input.lockedTiles`）**不是一条分叉**，只是三份数据：不许碰的原子
 * （blocked）、已被占掉的库存（usage）、已经盖住的必需原子。`lockedTiles: []`
 * 时这三份都是空的，整条管线走的是同一条路 —— 这件事由 bench 的 P1 盯着
 * （空锁定与不传锁定的输出逐字节相同），而不是靠读代码时自觉。
 */
import {
  DEFAULT_CANVAS,
  FALLBACK_LEVELS,
  RASTER_SAMPLES,
  SOLVER_ATTEMPTS,
  SOLVER_MAX_NODES,
  SOLVER_TOP_K,
} from '../config.js'
import { assignColors } from '../color/assign.js'
import { createGrid } from '../geometry/grid.js'
import { SHAPES } from '../geometry/shapes.js'
import { isSimple, translateToOrigin } from '../contour/polygon.js'
import { ATOM_OUTSIDE, rasterize, scoreAgainstTarget } from '../contour/rasterize.js'
import { hashSeed } from '../util/rng.js'
import { coverCounts, dilateAllow, enumerateCandidates } from './candidates.js'
import { solveExactCover } from './dlx.js'
import { buildLocked, remainingFull } from './locked.js'
import { acceptSolution, explainFailure, levelSpec } from './strategies.js'

/** 打分权重：覆盖率最要紧，其次是别压出界，再是片数少、形状种类少（孩子好找） */
const SCORE_WEIGHTS = { gap: 1, overflow: 0.6, pieces: 0.25, variety: 0.15 }

export function solveContour(input) {
  const t0 = Date.now()
  const opts = input.options ?? {}
  const seedBase = opts.seed ?? hashSeed(String(opts.seedKey ?? 'magnetic'))

  // ---- 1. 轮廓归一化 ----
  const rawPoly = (input.poly ?? []).map(([x, y]) => [Number(x), Number(y)])
  const poly = rawPoly.length >= 3 ? translateToOrigin(rawPoly) : []
  if (poly.length < 3) {
    return failure('轮廓至少要三个点')
  }
  if (!isSimple(poly)) {
    return failure('轮廓有自交，先把交叉的边理顺再求解', { poly })
  }

  // ---- 2. 画布尺寸 ----
  const canvas = resolveCanvas(poly, input.canvas)

  // ---- 3. 栅格化 ----
  const grid = createGrid(canvas.cols, canvas.rows)
  const raster = rasterize(poly, grid)
  if (raster.full.length === 0) {
    return failure('轮廓太小，一个完整的原子都盖不住 —— 至少要比半个格子大', { poly, canvas })
  }

  // ---- 3.5 锁定片 ----
  // 由这里自己 buildLocked，**不是**让调用方算好原子再传进来：原子必须对着
  // 同一张 grid 求，让调用方算就得把 grid 对象漏过边界，或者埋一个「两边 grid
  // 不一致」的雷。调用方只给片（shape/rot/i/j），原子这儿自己推。
  const locked = buildLocked({ tiles: input.lockedTiles, grid })
  if (!locked.ok) {
    // 用户的片原样还回去，界面上那份文档还在它自己手里，不会被这儿清空
    return failure(locked.reason, { poly, canvas, tiles: locked.tiles, invalid: locked.invalid })
  }

  const stock = input.stock ?? {}
  const palette = input.palette ?? []
  const shapeList = Object.keys(SHAPES)

  // ---- 4. 逐级尝试 ----
  //
  // 只有**过了这级的闸门**才算成，`best` 单看不能作数：一级里即便什么都没过闸门，
  // 也会留下一个「分数最高的那个未通过解」当参考。早先直接拿它当成功返回，
  // 结果一个覆盖率 74% 的轮廓被报成「L0 严格匹配」，降级阶梯永远停在第一级。
  const ladder = []
  let bestEffort = null

  for (const level of FALLBACK_LEVELS) {
    const spec = levelSpec(level)
    const attempt = tryLevel({ level, spec, grid, raster, stock, shapeList, seedBase, opts, locked })
    ladder.push(attempt.summary)

    if (attempt.accepted && attempt.best) {
      const r = finish({ poly, canvas, level, spec, grid, raster, stock, palette, t0, seedBase, ladder, locked, picked: attempt.best })
      if (level !== 'L5') return r
      // L5 是「判为不可拼」，不是一个可照搭的方案。
      // 但方案本身还是给出去 —— 用户得看见差多少才知道该改哪儿。
      // 早先这一级照样返回 ok:true，界面上会把一张盖住 57% 的图显示成「已求解」。
      return {
        ...r,
        ok: false,
        degraded: true,
        reason: explainFailure({ ladder, bestCoverage: attempt.best.metrics.coverage }),
      }
    }
    // 记下「最接近的一次」。正常情况下到不了这儿（L5 的门槛是「能出方案就算过」），
    // 只有连 L5 都越了溢出上限时才走这条路。
    if (attempt.best && (!bestEffort || betterThan(attempt.best, bestEffort.best))) {
      bestEffort = { level, spec, best: attempt.best }
    }
  }

  // ---- 5. 全阶梯走完都没过闸门 ----
  const bestCoverage = bestEffort?.best.metrics.coverage ?? 0
  const reason = explainFailure({ ladder, bestCoverage })

  // 有尽力而为的方案就一并带上：拼不满是一回事，让用户看看拼到了什么程度是另一回事。
  // 只给一句「不可拼」，用户既不知道差多少，也不知道该改哪儿。
  if (bestEffort) {
    const r = finish({
      poly, canvas, level: bestEffort.level, spec: bestEffort.spec, grid, raster, stock, palette, t0, seedBase, ladder,
      locked, picked: bestEffort.best,
    })
    return { ...r, ok: false, degraded: true, reason }
  }

  return failure(reason, {
    poly,
    canvas,
    seed: seedBase,
    elapsedMs: Date.now() - t0,
    raster: summarizeRaster(raster),
    ladder,
  })
}

/** 组装成功（或尽力而为）的返回。抽出这一段是因为上面两条路都要用 */
function finish(ctx) {
  const { poly, canvas, level, spec, grid, raster, stock, palette, t0, seedBase, ladder, locked, picked } = ctx
  const colored = assignColors({ tiles: picked.tiles, grid, palette, stock, keep: locked.ids })
  return {
    ok: true,
    degraded: false,
    poly,
    canvas,
    level,
    spec,
    tiles: colored.tiles,
    colorUsage: colored.colorUsage,
    overStock: picked.overStock,
    shortfall: picked.shortfall,
    metrics: picked.metrics,
    seed: seedBase,
    elapsedMs: Date.now() - t0,
    raster: summarizeRaster(raster),
    ladder,
    note: spec.note,
    warnings: buildWarnings(picked, colored),
  }
}

const betterThan = (a, b) => scoreSolution(a.metrics) < scoreSolution(b.metrics)

/* ------------------------------------------------------------------ */
/* 单级尝试                                                            */
/* ------------------------------------------------------------------ */

function tryLevel(ctx) {
  const { level, spec, grid, raster, stock, shapeList, seedBase, locked } = ctx
  const t0 = Date.now()

  // 锁定片已经盖住的原子从必需集里摘掉
  const fullAtoms = remainingFull(raster.full, locked.blocked)

  // ★ 留白预算仍然按**轮廓全长**算，不是按过滤后的长度。
  // 留白是轮廓的性质（这条轮廓上本来就有几处缝补不上），不是「还没盖住的原子」
  // 的性质。按过滤后的长度算的话，多锁一片就少一份余量 —— 降级级别会纯粹因为
  // 这个人为原因往下掉，而用户只是锁了一片本来就该在的方案里的片。
  const budgetAtoms = Math.floor(raster.full.length * spec.gapBudget)

  // 允许覆盖的原子：轮廓内的都行；这级允许溢出就再往外放开一圈
  let allow = new Uint8Array(raster.state.length)
  for (let t = 0; t < allow.length; t += 1) allow[t] = raster.state[t] === ATOM_OUTSIDE ? 0 : 1
  if (spec.overflowBudget > 0) allow = dilateAllow(allow, grid)

  // 库存要扣掉锁定片已经占掉的那份。判据是**剩余**容量为 0，不是「库存原值为 0」——
  // 用掉几个不代表这类形状不能再用。
  const stockLeft = (s) => atomBudget(stock[s]) - (locked.usage[s] ?? 0)

  // 候选只跟「哪些形状可能用得上」有关，跟额度无关，所以额外额度的阶梯在
  // 候选枚举**之后**才起作用 —— 枚举一次，反复用不同额度去搜。
  const baseShapes = shapeList.filter((s) => stockLeft(s) > 0 || !spec.stockLimited)

  // 候选枚举跟库存无关 —— 候选问的是「这个位置放得下吗」，不是「还有没有片」。
  // 库存只在搜索时当剪枝用，所以这里不传 shapeCaps。
  const { list, byAtom } = enumerateCandidates({
    grid,
    state: raster.state,
    allow,
    shapes: baseShapes,
    blocked: locked.blocked,
  })

  const { counts } = coverCounts(fullAtoms, byAtom)

  // 候选数为 0 的原子谁也盖不住，先摘出去。摘完还超预算，这级直接没戏。
  //
  // ★ 这里**不能**再加「list 为空就早退」或「baseShapes 为空就早退」。那两条早退
  // 的前提是「至少得新增一片才算解」，有锁定片之后这个前提不成立：「一片都不新增」
  // 完全可以是一个合法解 —— 用户把自己满意的片全锁上、轮廓本来又留了几处补不上的
  // 缝时，锁定集本身就是答案。早退会把这条路堵死，把求解器逼到 L2 去找一个压出
  // 轮廓的片来补缝（实测 nub：98.0% → 100% 覆盖，但多一片、溢出 2%、L1 掉到 L2）。
  // 所以判据只能是下面这条 —— 它问的是「剩下的必需原子能不能被留白预算吸收」，
  // 那才是这级过不过的真实条件，而它对不解、全解锁、部分锁定是同一条。
  const forcedGaps = fullAtoms.filter((t) => (counts.get(t) ?? 0) === 0)
  if (forcedGaps.length > budgetAtoms) {
    return {
      best: null,
      summary: {
        level,
        label: spec.label,
        reason: baseShapes.length === 0
          ? (locked.tiles.length
              ? '库存已经全被锁定片占满了，没有多余的片可用'
              : '库存里没有可用的平面形状')
          : `${forcedGaps.length} 个原子任何形状都放不进去，超过这级允许的 ${budgetAtoms} 个`,
        noCandidateAtoms: forcedGaps.length,
        ms: Date.now() - t0,
      },
    }
  }

  const shapeOfRow = new Int32Array(list.length)
  const shapeIndex = new Map(baseShapes.map((s, k) => [s, k]))
  const rowRank = new Float64Array(list.length)
  list.forEach((c, k) => {
    shapeOfRow[k] = shapeIndex.get(c.shape)
    // 先试大的、先试完整落在轮廓里的、先试靠下的（搭的时候从下往上走）
    rowRank[k] = c.size * -10 + c.partialHits * 2 + c.outsideHits * 3 + c.j * 0.01 - c.i * 0.001
  })

  let best = null
  let lastNodes = 0
  let lastExtra = 0
  let pruned = 0

  // ---- 额外额度阶梯：第一个能拼出来的额度就是最小的补料量 ----
  for (const extra of spec.extraSteps) {
    const caps = baseShapes.map((s) => stockCap(stock, s, extra, locked.usage[s] ?? 0))
    lastExtra = extra

    // 这一档不可能成的**算术**判据：额度加到顶也盖不住需要盖的量。
    // 不是启发式，是上界 —— 有它，8×8 正方形那种超库存的轮廓在 L0/L1/L2 上
    // 一档都不用真搜（实测省掉两秒多，本来是三次穷举搜索各撞满节点上限）。
    const available = baseShapes.reduce((sum, s, k) => sum + caps[k] * shapeAtomCount(s), 0)
    const need = fullAtoms.length - budgetAtoms
    if (available < need) {
      pruned += 1
      continue
    }

    const r = searchThisExtra({ list, fullAtoms, counts, budgetAtoms, shapeOfRow, caps, rowRank, spec, seedBase, grid, raster, stock, locked })
    lastNodes += r.nodes

    if (r.best) {
      best = r.best
      if (r.accepted) {
        return {
          best,
          accepted: true,
          summary: {
            level,
            label: spec.label,
            pieces: best.tiles.length,
            extra,
            // 通过的那一行同样要填缺口数：L1/L4 是**带着留白**通过的，
            // 那几处补不上的缝正是这几级存在的理由
            gaps: best.metrics.gapAtoms,
            nodes: lastNodes,
            ms: Date.now() - t0,
            accepted: true,
          },
        }
      }
    }
  }

  // 一档都没真搜过（全被算术上界挡掉）时，说「没搜到解」是不诚实的 ——
  // 根本没搜。报告里那句话会跟旁边那列「搜过的节点 0」直接打架。
  const neverSearched = pruned === spec.extraSteps.length
  let reason = '没搜到解'
  if (neverSearched) reason = '现有库存的片数差得太远，算术上就盖不住，这级不用搜'
  else if (best) reason = '有解但没过这级的覆盖率/溢出闸门'

  return {
    best,
    accepted: false,
    summary: {
      level,
      label: spec.label,
      pieces: best?.tiles.length ?? 0,
      extra: lastExtra,
      // 没有解的时候不填缺口数：那会写成「整个轮廓都是缺口」，
      // 看上去像搜出来一个很差的方案，实际上是压根没成方案
      gaps: best ? best.metrics.fullTotal - best.metrics.fullCovered : null,
      noCandidateAtoms: forcedGaps.length,
      nodes: lastNodes,
      ms: Date.now() - t0,
      accepted: false,
      reason,
    },
  }
}

/**
 * 某个形状的片数上限 = 库存 − 锁定片已占用的 + 这一档的额外额度。
 *
 * L0–L2 的额度阶梯只有 0 这一档，所以上限就是库存（硬约束）；
 * L3 起阶梯是 0,1,2,4,8,…，第一个搜得出解的档就是最小补料量。
 * 两种级别共用这一个公式 —— 早先按 `stockLimited` 分了两支，
 * 结果 L3 是「不限制」那支，额度直接被忽略，报出「补 24 片长方形」。
 *
 * 减 `used` 不能省：锁定片已经把库存占掉了，不减的话求解器会照着「满库存」
 * 再放同样数量的片，报出来的 shortfall 也是错的（明明够用却说要补料）。
 */
function stockCap(stock, shape, extra, used = 0) {
  return Math.max(0, atomBudget(stock[shape]) - used + (extra ?? 0))
}

/**
 * 在给定额度下搜一轮：先按原样试几次（换种子），还是不行就把「最难覆盖的原子」
 * 逐个摘出必须列 —— 留白预算卡着，所以重试次数有界。
 */
function searchThisExtra(ctx) {
  const { list, fullAtoms, counts, budgetAtoms, shapeOfRow, caps, rowRank, spec, seedBase, grid, raster, stock, locked } = ctx

  const slack = new Set(fullAtoms.filter((t) => (counts.get(t) ?? 0) === 0))
  let best = null
  let bestScore = Infinity
  let nodes = 0

  for (let attempt = 0; attempt < SOLVER_ATTEMPTS; attempt += 1) {
    const required = new Uint8Array(raster.state.length)
    for (const t of fullAtoms) if (!slack.has(t)) required[t] = 1

    const res = solveExactCover({
      nCols: raster.state.length,
      rows: list.map((c) => c.atoms),
      required,
      shapeOfRow,
      shapeLimit: caps,
      rowRank,
      limit: SOLVER_TOP_K,
      maxNodes: SOLVER_MAX_NODES,
      seed: (seedBase + attempt * 2654435761) >>> 0,
    })

    nodes += res.nodes

    let acceptedOne = null
    for (const rows of res.solutions) {
      const cand = buildCandidate(rows, list, grid, raster, stock, locked)
      // 两条硬约束不需要在这儿再查一遍：
      //   重叠 —— DLX 解的是精确覆盖，结构上不可能重叠
      //   整片出界 —— candidates.js 枚举时就滤掉了 outsideHits === atoms.length 的放置
      // 真正独立的复核在测试台：analyzeWork 拿原子集合从头重算一遍重叠与越界。
      const sc = scoreSolution(cand.metrics)
      if (sc < bestScore) {
        bestScore = sc
        best = cand
      }
      if (!acceptedOne && acceptSolution(cand.metrics, spec)) acceptedOne = cand
    }
    if (acceptedOne) return { best: acceptedOne, accepted: true, nodes }

    // 没拿到可接受的解。把「最难覆盖的那个原子」也摘出去，再来一次。
    // 摘一个就重跑一趟，看起来浪费，但 DLX 失败得极快（多数是几十个节点就撞死），
    // 而这是让「只差一两个原子」的轮廓不该被整级判死的关键。
    if (slack.size >= budgetAtoms) break
    const next = hardestRemaining(fullAtoms, counts, slack)
    if (next === null) break
    slack.add(next)
  }

  return { best, accepted: false, nodes }
}

/**
 * 一个形状占几个原子。面积单位是 a²，一格是 1 a²，一格有 4 个原子，
 * 所以原子数 = 面积 × 4。SQ 4 个、TRI-R 2 个、RECT 8 个 —— 跟 T 数的关系是
 * 原子数 = T 数 × 2（一个 T 就是一个象限）。
 */
function shapeAtomCount(shape) {
  const area = SHAPES[shape]?.area ?? 0
  return Math.round(area * 4)
}

/** 库存里这个形状总共几片（不分颜色） */
function atomBudget(colors) {
  return Object.values(colors ?? {}).reduce((a, b) => a + b, 0)
}

/** 还没被摘出去、且候选最少的那个原子 —— 「最难盖的地方」 */
function hardestRemaining(fullAtoms, counts, slack) {
  let best = null
  let bestN = Infinity
  for (const t of fullAtoms) {
    if (slack.has(t)) continue
    const n = counts.get(t) ?? 0
    if (n < bestN) {
      bestN = n
      best = t
    }
  }
  return best
}

/* ------------------------------------------------------------------ */
/* 解 → 结果                                                            */
/* ------------------------------------------------------------------ */

function buildCandidate(rows, list, grid, raster, stock, locked) {
  // 锁定片排在前面，且**原样**透传（id/shape/rot/i/j/color/source 都是用户的）。
  // `lockedTiles: []` 时这一整段是空的，输出与不传锁定时逐字节相同 —— 那是 P1，
  // 也是「锁定没有走分叉」这件事唯一能被机器证明的地方。
  const tiles = [
    ...locked.tiles.map((t) => ({
      id: t.id,
      shape: t.shape,
      rot: t.rot,
      i: t.i,
      j: t.j,
      color: t.color,
      locked: true,
      source: t.source,
    })),
    ...rows.map((r) => {
      const c = list[r]
      return {
        // id 由位置决定，不由序号决定 —— 同一处放置重解后 id 不变，
        // M6 的「锁定片重解」才能拿 id 对得上
        id: `${c.shape}-${c.rot}-${c.i}-${c.j}`,
        shape: c.shape,
        rot: c.rot,
        i: c.i,
        j: c.j,
        color: null,
        locked: false,
        source: 'solver',
      }
    }),
  ]

  const covered = []
  const claimed = new Set()
  // 锁定片占的原子先进 covered —— 覆盖率要把它们算作「已经盖住的」，
  // scoreAgainstTarget 内部按 Set 去重，所以直接并进来就行。
  // 锁定片若压在 OUTSIDE 原子上，会如实计进 overflow，这正是 P10 要的行为。
  for (const lockedAtoms of locked.atoms) {
    if (!lockedAtoms) continue
    for (const t of lockedAtoms) {
      if (!claimed.has(t)) {
        claimed.add(t)
        covered.push(t)
      }
    }
  }
  for (const r of rows) {
    for (const t of list[r].atoms) {
      if (!claimed.has(t)) {
        claimed.add(t)
        covered.push(t)
      }
    }
  }

  const base = scoreAgainstTarget(raster.state, raster.weight, covered)

  // 是否超库存
  const used = {}
  for (const t of tiles) used[t.shape] = (used[t.shape] ?? 0) + 1
  const shortfall = []
  let overStock = false
  for (const [shape, n] of Object.entries(used)) {
    const have = Object.values(stock[shape] ?? {}).reduce((a, b) => a + b, 0)
    if (n > have) {
      overStock = true
      shortfall.push({ shape, need: n, have })
    }
  }

  return {
    tiles,
    shortfall,
    overStock,
    metrics: {
      ...base,
      pieceCount: tiles.length,
      shapeKinds: Object.keys(used).length,
      gapAtoms: base.fullTotal - base.fullCovered,
      overStock,
    },
  }
}

/** 分越低越好。覆盖率的权重远大于其他项：宁可多几片，也不能有洞。 */
function scoreSolution(m) {
  return (
    SCORE_WEIGHTS.gap * (1 - m.coverage) +
    SCORE_WEIGHTS.overflow * m.overflow +
    SCORE_WEIGHTS.pieces * Math.min(1, m.pieceCount / 48) +
    SCORE_WEIGHTS.variety * Math.min(1, m.shapeKinds / 3)
  )
}

/* ------------------------------------------------------------------ */
/* 杂项                                                                */
/* ------------------------------------------------------------------ */

/**
 * 画布尺寸：默认贴着轮廓的包围盒留一格边，这样小轮廓不会丢进一张 12×10 的大画布
 * 里（DLX 的列数跟画布面积成正比）。调用方给了就用调用方的。
 */
function resolveCanvas(poly, given) {
  if (given?.cols && given?.rows) {
    return { unit: given.unit ?? DEFAULT_CANVAS.unit, cols: given.cols, rows: given.rows, background: given.background ?? DEFAULT_CANVAS.background }
  }
  let maxX = 0
  let maxY = 0
  for (const [x, y] of poly) {
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return {
    unit: given?.unit ?? DEFAULT_CANVAS.unit,
    cols: Math.min(DEFAULT_CANVAS.cols, Math.ceil(maxX) + 1),
    rows: Math.min(DEFAULT_CANVAS.rows, Math.ceil(maxY) + 1),
    background: given?.background ?? DEFAULT_CANVAS.background,
  }
}

function summarizeRaster(r) {
  return {
    fullAtoms: r.full.length,
    partialAtoms: r.partial.length,
    partialWeight: Number(r.partialWeight.toFixed(3)),
    polyArea: Number(r.polyArea.toFixed(3)),
    samples: RASTER_SAMPLES,
  }
}

function buildWarnings(cand, colored) {
  const w = []
  if (cand.overStock) {
    w.push(`库存不够，需要补：${cand.shortfall.map((s) => `${s.shape} ${s.need - s.have} 片`).join('、')}`)
  }
  if (colored.exhausted.length) {
    w.push(`这几类颜色也不够：${colored.exhausted.join('、')}`)
  }
  return w
}

function failure(reason, extra = {}) {
  return {
    ok: false,
    reason,
    tiles: [],
    ladder: [],
    elapsedMs: 0,
    ...extra,
  }
}
