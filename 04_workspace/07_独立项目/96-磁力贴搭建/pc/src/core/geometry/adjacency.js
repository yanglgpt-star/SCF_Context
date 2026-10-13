/**
 * 原子级共边邻接 —— 「每片新磁力片必须与已有结构共边」这条硬约束的地基。
 *
 * 为什么在象限层面算就够了：每片都是一整个象限的并集，所以两片之间
 * 任何一段公共边界，一定由整数个完整象限边拼成。不存在「只共半条边」的情况。
 *
 * 象限的共边关系：
 *   同格内 —— N↔E、N↔W、S↔E、S↔W 共边；N↮S、E↮W 只共一个点（格心），不算
 *   跨格   —— N↔上方格的 S、S↔下方格的 N、E↔右格的 W、W↔左格的 E
 */
import { Q_N, Q_E, Q_S, Q_W } from './grid.js'

/** 同格内的共边象限 */
const IN_CELL = {
  [Q_N]: [Q_E, Q_W],
  [Q_E]: [Q_N, Q_S],
  [Q_S]: [Q_E, Q_W],
  [Q_W]: [Q_N, Q_S],
}

/** 跨格的共边象限：[对面象限, di, dj] */
const CROSS_CELL = {
  [Q_N]: [Q_S, 0, -1],
  [Q_S]: [Q_N, 0, 1],
  [Q_E]: [Q_W, 1, 0],
  [Q_W]: [Q_E, -1, 0],
}

/** 与原子 t 共边的所有原子索引 */
export function quadrantNeighbors(t, grid) {
  const { i, j, q } = grid.toIJQ(t)
  const out = []

  for (const nq of IN_CELL[q]) out.push(grid.idx(i, j, nq))

  const [cq, di, dj] = CROSS_CELL[q]
  const ni = i + di
  const nj = j + dj
  if (grid.inBounds(ni, nj)) out.push(grid.idx(ni, nj, cq))

  return out
}

/** 两个原子是否共边 */
export function atomsAdjacent(a, b, grid) {
  const { i, j, q } = grid.toIJQ(a)
  const { i: bi, j: bj, q: bq } = grid.toIJQ(b)

  if (bi === i && bj === j) return IN_CELL[q].includes(bq)

  const [cq, di, dj] = CROSS_CELL[q]
  return bq === cq && bi === i + di && bj === j + dj
}

/**
 * 把一组片（每片一串原子索引）建成邻接表。
 * 返回 Array<Set<number>>，下标是片序号，值是与之共边的片序号集合。
 */
export function buildAdjacency(tileAtoms, grid) {
  const owner = new Map()
  tileAtoms.forEach((atoms, ti) => {
    for (const t of atoms) owner.set(t, ti)
  })

  const adj = tileAtoms.map(() => new Set())
  tileAtoms.forEach((atoms, ti) => {
    for (const t of atoms) {
      for (const n of quadrantNeighbors(t, grid)) {
        const other = owner.get(n)
        if (other !== undefined && other !== ti) {
          adj[ti].add(other)
          adj[other].add(ti)
        }
      }
    }
  })
  return adj
}

/**
 * 连通分量。返回 Array<number[]>，每个元素是一组片序号。
 * 按第一片的顺序输出，结果稳定。
 */
export function connectedComponents(tileCount, adj) {
  const seen = new Array(tileCount).fill(false)
  const groups = []

  for (let start = 0; start < tileCount; start += 1) {
    if (seen[start]) continue
    const group = []
    const queue = [start]
    seen[start] = true
    while (queue.length) {
      const cur = queue.shift()
      group.push(cur)
      for (const n of adj[cur]) {
        if (!seen[n]) {
          seen[n] = true
          queue.push(n)
        }
      }
    }
    groups.push(group)
  }
  return groups
}

/** 整组片是否连成一片 */
export function isConnected(tileAtoms, grid) {
  if (tileAtoms.length <= 1) return true
  const adj = buildAdjacency(tileAtoms, grid)
  return connectedComponents(tileAtoms.length, adj).length === 1
}

/**
 * 逐片检查「放上去的那一刻是否已经与已有结构相连」。
 * 这是步骤序列的硬约束：每一步的新片必须挨着上一步之前就存在的片。
 *
 * order 是片序号的排列；返回第一个违规的位置，全部合法则返回 -1。
 * 返回 -1 之外还返回违规片序号，方便 UI 直接高亮。
 */
export function firstDisconnectedStep(tileAtoms, order, grid) {
  if (order.length === 0) return { index: -1, tile: -1 }
  // 第一片没有可依附的对象，单独放行
  for (let k = 1; k < order.length; k += 1) {
    const ti = order[k]
    const built = order.slice(0, k)
    const attached = tileAtoms[ti].some((t) =>
      quadrantNeighbors(t, grid).some((n) => built.some((bi) => tileAtoms[bi].includes(n))),
    )
    if (!attached) return { index: k, tile: ti }
  }
  return { index: -1, tile: -1 }
}
