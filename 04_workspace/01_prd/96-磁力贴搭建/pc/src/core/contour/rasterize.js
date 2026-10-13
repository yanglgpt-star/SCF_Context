/**
 * 多边形 → 原子分类。这是「轮廓」和「求解器」之间的那道门。
 *
 * 每个原子（象限三角形）跟轮廓的关系只有三种：
 *   FULL     整个原子都在轮廓里  → 求解器**必须**盖住它
 *   PARTIAL  被轮廓切过          → 盖不盖都行（盖了算覆盖，不盖不算错）
 *   OUTSIDE  完全在轮廓外        → 不许碰（碰了算溢出）
 *
 * 为什么不自己写多边形裁剪：轮廓是凹的，Sutherland–Hodgman 只对凸裁剪窗口成立，
 * 拿它算出来的面积是错的。而象限三角形本身就小，用重心网格采样既够准又不会绕进
 * 退化情形。采样点取的是**子三角形重心**，天然不会落在子三角形自己的边上。
 */
import { ATOM_EPS, RASTER_SAMPLES } from '../config.js'
import { QUADRANT_OUTLINE } from '../geometry/grid.js'
import { bboxOf, pointInPolygon, polygonArea } from './polygon.js'

export const ATOM_OUTSIDE = 0
export const ATOM_PARTIAL = 1
export const ATOM_FULL = 2

/**
 * 重心网格采样：把三角形切成 k² 个子三角形，取每个子三角形的重心。
 * k=5 → 15 个采样点，边界分辨率 1/15，对「一个象限被轮廓切掉多少」足够。
 */
function barycentricSamples(k) {
  const pts = []
  for (let u = 0; u < k; u += 1) {
    for (let v = 0; v < k - u; v += 1) {
      pts.push([(u + 1 / 3) / k, (v + 1 / 3) / k])
    }
  }
  return pts
}

export const SAMPLE_POINTS = barycentricSamples(RASTER_SAMPLES)

/** 采样：返回落在多边形内的比例 0..1 */
function sampleRatio(tri, poly) {
  // tri = [[x,y],[x,y],[x,y]]，重心坐标 (u, v, w=1-u-v) → 点 = A*u + B*v + C*w
  const [[ax, ay], [bx, by], [cx, cy]] = tri
  let hit = 0
  for (const [u, v] of SAMPLE_POINTS) {
    const w = 1 - u - v
    const x = ax * u + bx * v + cx * w
    const y = ay * u + by * v + cy * w
    if (pointInPolygon(x, y, poly)) hit += 1
  }
  return hit / SAMPLE_POINTS.length
}

/**
 * 把多边形栅格化成原子分类。
 *
 * 只扫多边形包围盒覆盖到的格子 —— 全画布扫一遍是浪费，
 * 而且以后画布开到 40×40 时这个差别很可观。
 */
export function rasterize(poly, grid) {
  const n = grid.atomCount
  const state = new Uint8Array(n) // 默认 ATOM_OUTSIDE
  const weight = new Float32Array(n)

  if (!poly || poly.length < 3) {
    return {
      state,
      weight,
      full: [],
      partial: [],
      outside: [],
      targetAtoms: 0,
      partialWeight: 0,
      polyArea: 0,
      coverageCap: 0,
    }
  }

  const bb = bboxOf(poly)
  const i0 = Math.max(0, Math.floor(bb.minX) - 1)
  const j0 = Math.max(0, Math.floor(bb.minY) - 1)
  const i1 = Math.min(grid.cols - 1, Math.ceil(bb.maxX))
  const j1 = Math.min(grid.rows - 1, Math.ceil(bb.maxY))

  const full = []
  const partial = []
  let partialWeight = 0

  for (let j = j0; j <= j1; j += 1) {
    for (let i = i0; i <= i1; i += 1) {
      for (let q = 0; q < 4; q += 1) {
        const rel = QUADRANT_OUTLINE[q]
        const tri = [
          [i + rel[0][0], j + rel[0][1]],
          [i + rel[1][0], j + rel[1][1]],
          [i + rel[2][0], j + rel[2][1]],
        ]
        const ratio = sampleRatio(tri, poly)
        const t = grid.idx(i, j, q)
        weight[t] = ratio
        if (ratio >= 1 - ATOM_EPS) {
          state[t] = ATOM_FULL
          full.push(t)
        } else if (ratio > ATOM_EPS) {
          state[t] = ATOM_PARTIAL
          partial.push(t)
          partialWeight += ratio
        }
      }
    }
  }

  const polyArea = polygonArea(poly)
  return {
    state,
    weight,
    full,
    partial,
    outside: [], // 按需生成，全列出来是画布大小，没必要
    targetAtoms: full.length,
    partialWeight,
    polyArea,
    /**
     * 覆盖率的理论上限：把 full 和 partial 全盖上，能覆盖的面积占比。
     * 求解结果达不到这个值，缺口就在求解器这边，不在轮廓这边 ——
     * 这个数是排查「到底该怪谁」的第一手依据。
     */
    coverageCap: full.length + partialWeight > 0 ? 1 : 0,
  }
}

/** 某个原子是否可以被覆盖（FULL 和 PARTIAL 可以，OUTSIDE 不行） */
export function isTarget(state, t) {
  return state[t] !== ATOM_OUTSIDE
}

/**
 * 算覆盖率与溢出率。**分母是轮廓自己的面积**，不是画布面积 ——
 * 「盖住了轮廓的百分之多少」才是用户关心的那个数。
 *
 * covered: 被解覆盖的原子索引数组
 */
export function scoreAgainstTarget(state, weight, covered) {
  let fullCovered = 0
  let fullTotal = 0
  let overflow = 0
  for (let t = 0; t < state.length; t += 1) {
    const s = state[t]
    if (s === ATOM_FULL) fullTotal += 1
  }

  const seen = new Set()
  for (const t of covered) {
    if (seen.has(t)) continue
    seen.add(t)
    if (state[t] === ATOM_FULL) fullCovered += 1
  }

  // 轮廓的「应覆盖面积」= full 原子数 + partial 原子的权重和
  let targetArea = 0
  for (let t = 0; t < state.length; t += 1) {
    if (state[t] === ATOM_FULL) targetArea += 1
    else if (state[t] === ATOM_PARTIAL) targetArea += weight[t]
  }

  let coveredArea = 0
  for (const t of seen) {
    if (state[t] === ATOM_FULL) coveredArea += 1
    else if (state[t] === ATOM_PARTIAL) coveredArea += weight[t]
  }

  for (const t of seen) {
    if (state[t] === ATOM_OUTSIDE) overflow += 1
  }

  return {
    fullCovered,
    fullTotal,
    targetArea,
    coveredArea,
    coverage: targetArea > 0 ? Math.min(1, coveredArea / targetArea) : 0,
    // 溢出率的定义（方案 §5）：超出轮廓的原子 / 目标原子
    overflow: fullTotal > 0 ? overflow / fullTotal : 0,
    overflowAtoms: overflow,
  }
}
