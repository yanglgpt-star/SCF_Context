/**
 * 形状表 —— 轮廓（画图用）与足迹（求解用）。
 *
 * 坐标系：单位是基准边长 a，**锚点固定在包围盒左下角**（即最小 i、最小 j 那个角），
 * y 轴向下（跟网格 (i,j) 一致）。这个约定保证 work.json 里 (i,j) 的语义唯一 ——
 * 同一份数据换个人实现也是同一个位置。
 *
 * 代价要说清楚：旋转是「绕自身包围盒左下角重新摆放」，不是原地转。
 * 一个 2a×1a 的长方形 rot 0→90 会变成 1a×2a 且锚点不动，
 * 在网格上就是「贴着原格子竖起来」。对拼贴app 来说这才是对的，
 * 原地转会转出格点之外。
 */
import { ATOMS_PER_CELL } from '../config.js'
import { Q_N, Q_E, Q_S, Q_W } from './grid.js'

/* ------------------------------------------------------------------ *
 * 半格三角形（TRI-R 的四种朝向）
 * ------------------------------------------------------------------ */

/**
 * k → 它占据的两个象限。k 同时就是 work.json 里 TRI-R 的朝向编码。
 *
 * k=0 「/」左上，直角在格左下   = N ∪ W
 * k=1 「/」右下，直角在格右上   = S ∪ E
 * k=2 「\」右上，直角在格右下   = N ∪ E
 * k=3 「\」左下，直角在格左上   = S ∪ W
 *
 * 注意 k=0 与 k=2 都占 N，k=0 与 k=3 都占 W —— 同格混用两条对角线
 * 必然撞车，精确覆盖直接判冲突，不需要额外的互斥约束。
 */
export const TRI_QUADRANTS = {
  0: [Q_N, Q_W],
  1: [Q_S, Q_E],
  2: [Q_N, Q_E],
  3: [Q_S, Q_W],
}

/** 逆时针旋转 90° 的次数 → 半格编号 k */
export const TRI_ROT_TO_K = { 0: 0, 90: 2, 180: 1, 270: 3 }

/** k → 反查 rot，给序列化用 */
export const TRI_K_TO_ROT = { 0: 0, 1: 180, 2: 90, 3: 270 }

/* ------------------------------------------------------------------ *
 * 轮廓（单位坐标，锚点 = 包围盒左下角）
 * ------------------------------------------------------------------ */

const ALL_Q = [Q_N, Q_E, Q_S, Q_W]

export const OUTLINES = {
  SQ: {
    0: [[0, 0], [1, 0], [1, 1], [0, 1]],
  },
  'TRI-R': {
    0: [[0, 0], [1, 0], [0, 1]], // k=0，直角在左下
    90: [[0, 0], [1, 0], [1, 1]], // k=2，直角在右下
    180: [[1, 0], [1, 1], [0, 1]], // k=1，直角在右上
    270: [[0, 0], [0, 1], [1, 1]], // k=3，直角在左上
  },
  RECT: {
    0: [[0, 0], [2, 0], [2, 1], [0, 1]], // 横放 2a×1a
    90: [[0, 0], [1, 0], [1, 2], [0, 2]], // 竖放 1a×2a
  },
}

/* ------------------------------------------------------------------ *
 * 足迹（求解用）
 * ------------------------------------------------------------------ */

/**
 * 每种形状每个旋转占据哪些格子。
 * 全格形状（SQ / RECT）占满格子的 4 个象限；TRI-R 由 k 决定象限对。
 */
const FOOTPRINT_CELLS = {
  // 正方形四个旋转的轮廓和足迹完全一样 —— 转它没有意义，但仍然列全，
  // 这样「rot 是 90 的倍数」这条规则对所有形状一致，不用特判。
  SQ: { 0: [[0, 0]], 90: [[0, 0]], 180: [[0, 0]], 270: [[0, 0]] },
  'TRI-R': { 0: [[0, 0]], 90: [[0, 0]], 180: [[0, 0]], 270: [[0, 0]] },
  RECT: {
    0: [[0, 0], [1, 0]],
    90: [[0, 0], [0, 1]],
  },
}

/** 形状元数据。area 是相对 a² 的面积，也是占用原子数的换算基准。 */
export const SHAPES = {
  SQ: { id: 'SQ', name: '正方形', area: 1, planar: true },
  'TRI-R': { id: 'TRI-R', name: '等腰直角三角形', area: 0.5, planar: true },
  RECT: { id: 'RECT', name: '长方形', area: 2, planar: true },
}

export const PLANAR_SHAPES = Object.values(SHAPES).filter((s) => s.planar).map((s) => s.id)

/**
 * 求解器要枚举的旋转。
 * SQ 只列 0：四个旋转给出同一份足迹，列全会让 DLX 里出现 4 倍重复行。
 * 渲染不受影响 —— 正方形的轮廓本来就跟旋转无关。
 */
export const ROTATIONS = {
  SQ: [0],
  'TRI-R': [0, 90, 180, 270],
  RECT: [0, 90],
}

/** 把任意 rot 归一化到该形状支持的取值。正方形的 90/180/270 等价于 0。 */
export function normalizeRot(shape, rot) {
  const allowed = ROTATIONS[shape]
  if (!allowed) throw new Error(`未知形状：${shape}`)
  const r = (((Math.round((Number(rot) || 0) / 90) * 90) % 360) + 360) % 360
  return allowed.includes(r) ? r : allowed[0]
}

/** 轮廓多边形。返回 [[x, y], ...]，单位坐标 */
export function outline(shape, rot) {
  const table = OUTLINES[shape]
  if (!table) throw new Error(`未知形状：${shape}`)
  return table[normalizeRot(shape, rot)]
}

/** 包围盒尺寸（单位坐标），渲染和越界检查都要用 */
export function bbox(shape, rot) {
  const pts = outline(shape, rot)
  let w = 0
  let h = 0
  for (const [x, y] of pts) {
    if (x > w) w = x
    if (y > h) h = y
  }
  return { w, h }
}

/**
 * 足迹：相对锚点的 [di, dj, q] 三元组。
 * 用相对偏移而不是绝对原子索引，因为 cols 随画布变，绝对索引没法预计算。
 */
export function footprint(shape, rot) {
  const cells = FOOTPRINT_CELLS[shape]
  if (!cells) throw new Error(`未知形状：${shape}`)
  const r = normalizeRot(shape, rot)
  const cellList = cells[r]
  if (!cellList) throw new Error(`形状 ${shape} 没有 rot=${r} 的足迹`)

  const quads = shape === 'TRI-R' ? TRI_QUADRANTS[TRI_ROT_TO_K[r]] : ALL_Q
  const out = []
  for (const [di, dj] of cellList) {
    for (const q of quads) out.push([di, dj, q])
  }
  return out
}

/** 该形状该旋转占几个原子 */
export function atomCount(shape, rot) {
  return footprint(shape, rot).length
}

/** 该形状该旋转占几个 T（T = 单位直角三角形面积 = 0.5 a²）—— 页面上的「占格」 */
export function tCount(shape) {
  const def = SHAPES[shape]
  return def ? def.area * 2 : null
}

/**
 * 把足迹展开成具体网格上的原子索引。**放不下就返回 null，不抛异常。**
 *
 * 越界和不认识的形状都归为「放不下」—— 这两种都是用户手改 JSON 能造出来的
 * 数据问题，必须变成一条校验错误，而不是让整页白屏。要区分原因由调用方按
 * tiles[k].shape 判断，别靠异常类型。
 */
export function atomsAt(grid, shape, rot, i, j) {
  if (!FOOTPRINT_CELLS[shape] || !outline(shape, rot)) return null
  const out = []
  for (const [di, dj, q] of footprint(shape, rot)) {
    const ci = i + di
    const cj = j + dj
    if (!grid.inBounds(ci, cj)) return null
    out.push(grid.idx(ci, cj, q))
  }
  return out
}

/* ------------------------------------------------------------------ *
 * 加载时自检
 * ------------------------------------------------------------------ */

/**
 * 表写错了就在这里炸掉，不要等到求解器给出一个错方案、用户照着搭才发现。
 * 三个不变量：
 *   1. 同一形状同一旋转内，没有重复的原子
 *   2. 原子数 == 面积 × 每格原子数
 *   3. 正方形的四个旋转必须给出完全相同的足迹（否则是表里手误）
 */
function selfCheck() {
  for (const shape of Object.keys(SHAPES)) {
    for (const [rotKey, cells] of Object.entries(FOOTPRINT_CELLS[shape] ?? {})) {
      const rot = Number(rotKey)
      const fp = footprint(shape, rot)
      const seen = new Set()
      for (const [di, dj, q] of fp) {
        const key = `${di},${dj},${q}`
        if (seen.has(key)) {
          throw new Error(`足迹表有重复原子：${shape} rot=${rot} → ${key}`)
        }
        seen.add(key)
      }
      const want = SHAPES[shape].area * ATOMS_PER_CELL
      if (fp.length !== want) {
        throw new Error(
          `足迹原子数不对：${shape} rot=${rot} 占 ${fp.length}，应为 ${want}（面积 ${SHAPES[shape].area} × ${ATOMS_PER_CELL}）`,
        )
      }
      if (cells.length * ATOMS_PER_CELL < fp.length) {
        throw new Error(`足迹跨度不足：${shape} rot=${rot}`)
      }
    }
  }

  // 正方形的旋转不变性
  const sq0 = JSON.stringify(footprint('SQ', 0).sort())
  for (const rot of [90, 180, 270]) {
    if (JSON.stringify(footprint('SQ', rot).sort()) !== sq0) {
      throw new Error(`正方形的 rot=${rot} 足迹与 rot=0 不一致，足迹表写错了`)
    }
  }

  // ROTATIONS 里列出的旋转必须都有足迹
  for (const [shape, rots] of Object.entries(ROTATIONS)) {
    for (const rot of rots) {
      if (!FOOTPRINT_CELLS[shape]?.[rot]) {
        throw new Error(`ROTATIONS 列了 ${shape} rot=${rot}，但足迹表里没有`)
      }
    }
  }
}

selfCheck()
