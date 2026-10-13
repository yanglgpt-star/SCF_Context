/**
 * 整数原子索引 —— 整个求解器的地基。
 *
 * 每个方格被两条对角线切成 4 个以格心为顶点的三角形，叫「象限」：
 *
 *        A───────B        象限      顶点        底边
 *        │╲  N  ╱│        N(0)   O,B,A      上边 A-B
 *        │ ╲   ╱ │        E(1)   O,C,B      右边 B-C
 *        │W ╲ ╱ E│        S(2)   O,D,C      下边 C-D
 *        │  ╱ ╲  │        W(3)   O,A,D      左边 D-A
 *        │╱  S  ╲│
 *        D───────C        O = 格心
 *
 * 为什么是象限而不是「半格」：原方案把格子分成 4 个半格 k∈{0,1,2,3}，
 * 再额外加一条「同格不能混用两条对角线」的互斥约束。改成象限之后，
 * 「/」的左上三角 = N∪W、「\」的右上三角 = N∪E，两者都想要 N，
 * **精确覆盖天然判定冲突** —— 约束不用写，也就不会漏。
 *
 * 原子是整数 t = (j * cols + i) * 4 + q。
 * Set / Map / 邻接表 / DLX 的列全走整数；(i, j, q) 只是给人看的序列化形式。
 */
import { ATOMS_PER_CELL } from '../config.js'

export const Q_N = 0
export const Q_E = 1
export const Q_S = 2
export const Q_W = 3

/** 象限的四个名字，给调试面板显示用 */
export const QUADRANT_LABEL = { 0: 'N', 1: 'E', 2: 'S', 3: 'W' }

/** 象限在格内的四个顶点（单位坐标，y 轴向下），用于画原子视图 */
export const QUADRANT_OUTLINE = {
  [Q_N]: [[0.5, 0.5], [1, 0], [0, 0]],
  [Q_E]: [[0.5, 0.5], [1, 1], [1, 0]],
  [Q_S]: [[0.5, 0.5], [0, 1], [1, 1]],
  [Q_W]: [[0.5, 0.5], [0, 0], [0, 1]],
}

/**
 * 建一个绑定到具体画布尺寸的网格。
 * cols/rows 每次求解都可能不同，所以索引函数必须带着尺寸走，
 * 不能让调用方到处传 cols —— 那是 bug 的温床。
 */
export function createGrid(cols, rows) {
  const c = Math.max(1, Math.floor(cols))
  const r = Math.max(1, Math.floor(rows))
  const cellCount = c * r

  return {
    cols: c,
    rows: r,
    cellCount,
    atomCount: cellCount * ATOMS_PER_CELL,

    /** 格 (i,j) 的第 q 个象限 → 原子索引 */
    idx(i, j, q) {
      return (j * c + i) * ATOMS_PER_CELL + q
    },

    /** 原子索引 → { i, j, q } */
    toIJQ(t) {
      const cell = Math.floor(t / ATOMS_PER_CELL)
      return { i: cell % c, j: Math.floor(cell / c), q: t % ATOMS_PER_CELL }
    },

    /** 原子索引 → 所属格号（格号 = j * cols + i） */
    cellOf(t) {
      return Math.floor(t / ATOMS_PER_CELL)
    },

    cellIJ(cell) {
      return { i: cell % c, j: Math.floor(cell / c) }
    },

    inBounds(i, j) {
      return i >= 0 && j >= 0 && i < c && j < r
    },

    isAtom(t) {
      return Number.isInteger(t) && t >= 0 && t < cellCount * ATOMS_PER_CELL
    },

    /** 把一串 [i, j, q] 转成原子索引；越界返回 null */
    atomsOf(list) {
      const out = []
      for (const [di, dj, q] of list) {
        if (!this.inBounds(di, dj)) return null
        out.push(this.idx(di, dj, q))
      }
      return out
    },
  }
}

/** 预置一个够大的网格，给不关心尺寸的纯函数当默认坐标系用 */
export const DEFAULT_GRID = createGrid(64, 64)
