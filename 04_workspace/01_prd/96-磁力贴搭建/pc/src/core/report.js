/**
 * 可行性报告 —— 「这个造型能不能拼、拼出来多难、要不要补料」这三个问题的答案。
 *
 * 报告是给**人**看的，所以每个数字都要能被追问「那又怎样」。覆盖率 87% 本身没有
 * 意义，配上「停在 L4」和「建议当示意图用」才有。所以这里的每个指标都带一句
 * 人话解释，UI 直接拿去显示，不用再拼字符串。
 *
 * 难度分用的是 config.js 里那套权重（片数/形状种类/颜色种类/步骤数），不是
 * 方案文档 §5 的公式 —— 两处公式不一致，取代码里这套，因为它已经归一化到 0..1
 * 且跟 AGE_BANDS 的阈值是配套设计的。
 */
import { AGE_BANDS, DIFFICULTY_NORMS, DIFFICULTY_WEIGHTS, SCHEMA_VERSION } from './config.js'
import { buildAdjacency, connectedComponents } from './geometry/adjacency.js'
import { createGrid } from './geometry/grid.js'
import { colorHex } from './model/palette.js'
import { atomsAt } from './geometry/shapes.js'

/**
 * @param {object} spec
 * @param {object} spec.solution  solveContour 的结果
 * @param {object[]} [spec.steps] 步骤数组，有的话计入难度分
 */
export function buildReport(spec) {
  const { solution, steps = [] } = spec
  const tiles = solution.tiles ?? []

  // 判为不可拼（L5）时也带一套尽力而为的片。**报告不能因为「不可拼」就把这些
  // 数抹掉** —— 「最好只盖住 57%」里的那个 57% 正是用户决定改不改草图的依据。
  // 所以只有连一片都没有的时候才走这条极简分支。
  if (tiles.length === 0) {
    return {
      schemaVersion: SCHEMA_VERSION,
      solvable: false,
      reason: solution.reason,
      ladder: solution.ladder ?? [],
      elapsedMs: solution.elapsedMs ?? 0,
    }
  }

  const canvas = solution.canvas
  const grid = createGrid(canvas.cols, canvas.rows)
  const atomLists = tiles.map((t) => atomsAt(grid, t.shape, t.rot, t.i, t.j) ?? [])

  const shapeUsage = {}
  const colorUsage = {}
  for (const t of tiles) {
    shapeUsage[t.shape] = (shapeUsage[t.shape] ?? 0) + 1
    const c = t.color ?? '未指定'
    colorUsage[c] = (colorUsage[c] ?? 0) + 1
  }

  const connected = connectivity(atomLists, grid)
  const m = solution.metrics ?? {}

  const difficulty = difficultyOf({
    pieces: tiles.length,
    shapeKinds: Object.keys(shapeUsage).length,
    colorKinds: Object.keys(colorUsage).filter((c) => c !== '未指定').length,
    steps: steps.length,
  })

  return {
    schemaVersion: SCHEMA_VERSION,
    /** 有片不等于能用：L5 会带一套尽力而为的片回来，但那不是可照搭的方案 */
    solvable: Boolean(solution.ok),
    reason: solution.reason ?? '',

    /** 停在了哪一级，以及人话解释 */
    level: solution.level,
    levelLabel: solution.spec?.label ?? '',
    levelNote: solution.note ?? '',

    coverage: round(m.coverage ?? 0, 4),
    coverageText: `${Math.round((m.coverage ?? 0) * 100)}%`,
    overflow: round(m.overflow ?? 0, 4),
    gapAtoms: m.gapAtoms ?? 0,

    pieceCount: tiles.length,
    shapeUsage,
    colorUsage,
    /** 色卡，UI 直接拿去上色，不用再查一遍 */
    colorSwatch: Object.fromEntries(Object.keys(colorUsage).map((c) => [c, colorHex(c)])),

    /** 结构是否连成一片。分成多块实物会散架，步骤也没法按共边顺序拆 */
    connected: connected.count === 1,
    componentCount: connected.count,
    componentSizes: connected.sizes,

    /** 左右对称度 0..1。对称的造型更好看，也更适合当封面 */
    symmetry: symmetryOf(tiles, atomLists, grid),

    /** 库存 */
    stockOk: !solution.overStock,
    shortfall: solution.shortfall ?? [],

    difficulty,
    ageBand: ageBandOf(difficulty, tiles.length),

    warnings: solution.warnings ?? [],
    elapsedMs: solution.elapsedMs ?? 0,
    ladder: solution.ladder ?? [],
  }
}

/**
 * 只从一份 work.json 的**构成**算难度，不碰原子级的东西。
 *
 * 资产库列表要对每一行算一遍，而 `buildReport` 那条路要建网格、算连通、算对称 ——
 * 几十行就是几十次求解器级别的开销，列表页滚动一下都嫌贵。所以这里单独开一条轻的路。
 *
 * 但**权重与归一化分母与 `buildReport` 共用同一套**（都走 `difficultyOf` / `ageBandOf`），
 * 两处不可能算出两个难度分 —— 那正是「一份数据三种输出」这件事的前提。
 *
 * 入参是**盘上那份 work.json**，不要求先 `normalizeWork`：列表页拿到的就是原始行，
 * 而这里对缺字段是全容错的（没有 `tiles` 就是 0 片、没有 `steps` 就是 0 步）。
 */
export function estimateDifficulty(work) {
  const tiles = work?.tiles ?? []
  const steps = work?.steps ?? []
  const shapes = new Set()
  const colors = new Set()
  for (const t of tiles) {
    if (t?.shape) shapes.add(t.shape)
    const c = t?.color ?? '未指定'
    if (c !== '未指定') colors.add(c)
  }

  const difficulty = difficultyOf({
    pieces: tiles.length,
    shapeKinds: shapes.size,
    colorKinds: colors.size,
    steps: steps.length,
  })
  // `ageBandOf` 吃的是**难度对象**（它自己取 `.score`），不是那个数 —— 传错的话
  // `number.score` 是 `undefined`，而 `undefined <= x` 恒假，于是每一个作品都会
  // 掉到最后一档（挑战）。不报错、值也像个正常的档名，是最难发现的那种错。
  const band = ageBandOf(difficulty, tiles.length)

  // Set 只在函数体里用，出去的是纯 JSON —— 那条约定管的是跨边界，不是内部实现
  return {
    score: difficulty.score,
    parts: difficulty.parts,
    ageBand: { key: band.key, label: band.label, pieceRangeOk: band.pieceRangeOk },
  }
}

/* ------------------------------------------------------------------ */

function connectivity(atomLists, grid) {
  const valid = atomLists.filter((a) => a.length > 0)
  if (valid.length === 0) return { count: 0, sizes: [] }
  const adj = buildAdjacency(valid, grid)
  const groups = connectedComponents(valid.length, adj)
  return {
    count: groups.length,
    sizes: groups.map((g) => g.length).sort((a, b) => b - a),
  }
}

/**
 * 左右对称度。关于**画布竖直中轴**镜像：格 i 镜像到 cols-1-i，
 * 象限 E↔W 互换、N/S 不变。返回镜像前后原子集合的 Jaccard 系数。
 *
 * 为什么用画布中轴而不是轮廓自己的中轴：原子索引挂在画布网格上，
 * 只有画布中轴才保证镜像后还是合法原子索引。轮廓自己偏在画布左边时这个数会偏低 ——
 * 所以调用方得先让求解器把轮廓贴到原点，`solve.js` 已经这么做了。
 */
function symmetryOf(tiles, atomLists, grid) {
  const set = new Set()
  atomLists.forEach((list) => list.forEach((t) => set.add(t)))
  if (set.size === 0) return 1

  let hit = 0
  const mirrored = new Set()
  for (const t of set) {
    const { i, j, q } = grid.toIJQ(t)
    // E(1) ↔ W(3)，N(0)/S(2) 不变
    const mq = q === 1 ? 3 : q === 3 ? 1 : q
    const m = grid.idx(grid.cols - 1 - i, j, mq)
    mirrored.add(m)
    if (set.has(m)) hit += 1
  }
  const union = set.size + mirrored.size - hit
  void tiles
  return union > 0 ? round(hit / union, 3) : 1
}

function difficultyOf({ pieces, shapeKinds, colorKinds, steps }) {
  const n = DIFFICULTY_NORMS
  const parts = {
    pieces: clamp01(pieces / n.pieces),
    shapeVariety: clamp01(shapeKinds / n.shapeKinds),
    colorVariety: clamp01(colorKinds / n.colorKinds),
    stepCount: clamp01(steps / n.steps),
  }
  const score =
    parts.pieces * DIFFICULTY_WEIGHTS.pieces +
    parts.shapeVariety * DIFFICULTY_WEIGHTS.shapeVariety +
    parts.colorVariety * DIFFICULTY_WEIGHTS.colorVariety +
    parts.stepCount * DIFFICULTY_WEIGHTS.stepCount

  return { score: round(score, 3), parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, round(v, 3)])) }
}

/**
 * 难度带：先按难度分上限卡，片数区间作为二次确认。
 *
 * 吃的是 `difficultyOf` 的**返回值**，不是它里面的 `score`。传一个裸数进来看起来
 * 一样合理，但 `.score` 会是 `undefined`、`undefined <= x` 恒假，于是**每一件作品
 * 都掉到最后一档**且不报任何错 —— 所以这里索性把契约写成断言。
 */
function ageBandOf(diff, pieces) {
  if (typeof diff?.score !== 'number') {
    throw new TypeError(`ageBandOf 要吃难度对象，收到 ${JSON.stringify(diff)}`)
  }
  const fit = AGE_BANDS.find((b) => diff.score <= b.maxDifficulty)
  const band = fit ?? AGE_BANDS[AGE_BANDS.length - 1]
  return {
    key: band.key,
    label: band.label,
    /** 片数超出这个带的区间时提一句，让用户知道是「难度分够但量大」还是真难 */
    pieceRangeOk: pieces >= band.minPieces && pieces <= band.maxPieces,
  }
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const round = (v, d) => Number(v.toFixed(d))
