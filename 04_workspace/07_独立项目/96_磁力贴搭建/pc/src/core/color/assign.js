/**
 * 配色 —— 独立于铺贴的第二遍。
 *
 * 为什么不塞进求解器一起解：配色是软约束（好看就行），铺贴是硬约束（必须严丝合缝）。
 * 混在一起的直接后果是**用户改一个颜色就得重解整个布局** —— 布局会跳，这是灾难。
 * 分成两遍之后，改色只跑这一遍，几十微秒，布局纹丝不动。
 *
 * 偏好顺序（真搭过磁力片就知道为什么）：
 *   1. **延续邻片的颜色** —— 磁力片拼出来好看的是成块的色区，不是棋盘格。
 *      孩子照着搭的时候也是一片一片往外扩，同色连片最省事。
 *   2. 库存里剩得最多的颜色 —— 前几片最容易撞上，先把富余的颜色用掉。
 *   3. 色板里顺序最靠前的 —— 兜底，保证永远给得出一个颜色。
 *
 * 全部是确定性规则，没有任何随机：同一份布局两次配色结果完全一样。
 */
import { quadrantNeighbors } from '../geometry/adjacency.js'
import { atomsAt } from '../geometry/shapes.js'

/** 两个磁力片是否有公共边（只共一个顶点不算 —— 磁力片靠边吸附） */
function tilesAdjacent(t1, t2, grid) {
  for (const a of t1.atomSet) {
    for (const nb of quadrantNeighbors(a, grid)) {
      if (t2.atomSet.has(nb)) return true
    }
  }
  return false
}

/**
 * @param {object} spec
 * @param {object[]} spec.tiles    求解器给的片。只要 shape/rot/i/j ——
 *                                 原子集合这儿自己从 grid 算，不依赖调用方传进来，
 *                                 因为存进 work.json 的 tile 本来就不带 atoms
 *                                 （那玩意儿是求解器的中间量，不该进作品数据）
 * @param {object} spec.grid
 * @param {string[]} spec.palette  色板，顺序即优先级
 * @param {object} spec.stock      { 形状: { 颜色: 数量 } }
 * @param {string[]} [spec.keep]   这批片的颜色**已经定了**（锁定片），不重新挑色
 * @returns {{ tiles: object[], colorUsage: object, exhausted: string[] }}
 */
export function assignColors(spec) {
  const { tiles, grid, palette, stock, keep = [] } = spec
  const keepSet = new Set(keep)
  const out = tiles.map((t) => {
    const atoms = atomsAt(grid, t.shape, t.rot, t.i, t.j) ?? []
    return { ...t, atomSet: new Set(atoms) }
  })

  // 每个形状的每种颜色还剩几片
  const remaining = {}
  for (const t of out) {
    if (!remaining[t.shape]) {
      remaining[t.shape] = {}
      const have = stock[t.shape] ?? {}
      for (const c of palette) remaining[t.shape][c] = have[c] ?? 0
    }
    // 锁定片的颜色已经定了，先把它占的额度扣掉 —— 否则后面的片会照着
    // 「这份库存还没被动过」挑色，最后撞出超库存还不知道为什么
    if (keepSet.has(t.id) && t.color && Number.isFinite(remaining[t.shape][t.color])) {
      remaining[t.shape][t.color] = Math.max(0, remaining[t.shape][t.color] - 1)
    }
  }

  // 从下往上、从左往右 —— 跟实际搭建的顺序一致，色区会从底部往上长
  const order = out.map((_, k) => k).sort((a, b) => out[a].j - out[b].j || out[a].i - out[b].i)

  const neighbors = new Array(out.length)
  for (let a = 0; a < out.length; a += 1) neighbors[a] = []
  for (let a = 0; a < out.length; a += 1) {
    for (let b = a + 1; b < out.length; b += 1) {
      if (tilesAdjacent(out[a], out[b], grid)) {
        neighbors[a].push(b)
        neighbors[b].push(a)
      }
    }
  }

  const colorUsage = {}
  for (const c of palette) colorUsage[c] = 0
  // 锁定片的颜色也是用量的一部分 —— 「各颜色用了几片」那份报告得对得上实际
  for (const t of out) {
    if (keepSet.has(t.id) && t.color && colorUsage[t.color] !== undefined) colorUsage[t.color] += 1
  }
  const exhausted = new Set()

  for (const k of order) {
    const t = out[k]
    // 锁定片的颜色用户已经定了，重挑一遍等于白锁（额度上面也扣过了）
    if (keepSet.has(t.id)) continue
    const pool = remaining[t.shape]

    // 1. 邻片已经用过的颜色，取其中还剩得最多的那个 —— 色块连成片
    let picked = null
    let bestLeft = 0
    for (const nb of neighbors[k]) {
      const c = out[nb].color
      if (!c || !pool || pool[c] <= 0) continue
      if (pool[c] > bestLeft) {
        bestLeft = pool[c]
        picked = c
      }
    }

    // 2. 没有可延续的色块，就挑库存剩最多的（同剩量时按色板顺序，保证确定性）
    if (!picked && pool) {
      let most = 0
      for (const c of palette) {
        if (pool[c] > most) {
          most = pool[c]
          picked = c
        }
      }
    }

    // 3. 库存这个形状的色都用光了 —— 记一笔，报告里要告诉用户该补什么颜色的片
    if (!picked) {
      picked = palette[0] ?? null
      if (picked) exhausted.add(`${t.shape}:${picked}`)
    }

    t.color = picked
    if (picked) {
      colorUsage[picked] += 1
      if (pool) pool[picked] -= 1
    }
  }

  for (const t of out) delete t.atomSet

  return { tiles: out, colorUsage, exhausted: [...exhausted] }
}
