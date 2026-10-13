/**
 * 候选放置枚举 —— DLX 矩阵的行就是从这儿来的。
 *
 * 直接对全画布每个格子试每种形状每种旋转是最省事的写法，但候选里绝大多数
 * 都离轮廓很远，白占矩阵。这里改成**从目标格子反推锚点**：先拿到「被轮廓碰到
 * 的格子」清单，再由足迹的 [di,dj] 偏移反推锚点该落在哪。候选数量直接跟轮廓
 * 大小成正比，跟画布大小无关。
 */
import { quadrantNeighbors } from '../geometry/adjacency.js'
import { ROTATIONS, SHAPES, atomsAt, footprint } from '../geometry/shapes.js'
import { ATOM_PARTIAL } from '../contour/rasterize.js'

/**
 * 被轮廓碰到的格子清单（有任何一个象限不是 OUTSIDE 就算）。
 * 同时给出每格非空的象限掩码，用来判断某个形状能不能压在这一格上。
 */
export function targetCells(state, grid) {
  const cells = []
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    let mask = 0
    const base = cell * 4
    for (let q = 0; q < 4; q += 1) {
      if (state[base + q] !== 0) mask |= 1 << q
    }
    if (mask) cells.push({ i: cell % grid.cols, j: Math.floor(cell / grid.cols), mask })
  }
  return cells
}

/**
 * 把允许覆盖的原子往外扩一圈。L2 的「允许溢出」就是这么实现的：
 * 不是全局给一个溢出的数量额度（那在 DLX 里是基数约束，很贵），
 * 而是空间上只放开紧贴轮廓的那一圈 —— 效果一样，代价几乎为零。
 */
export function dilateAllow(allow, grid) {
  const out = Uint8Array.from(allow)
  for (let t = 0; t < allow.length; t += 1) {
    if (allow[t]) continue
    for (const nb of quadrantNeighbors(t, grid)) {
      if (allow[nb]) {
        out[t] = 1
        break
      }
    }
  }
  return out
}

/**
 * 枚举所有可行放置。
 *
 * @param {object} spec
 * @param {object} spec.grid
 * @param {Uint8Array} spec.state      原子分类（rasterize 的结果）
 * @param {Uint8Array} spec.allow      哪些原子允许被覆盖
 * @param {string[]} spec.shapes       允许使用的形状
 * @param {number[]} [spec.shapeCaps]  每个形状最多用几片（跟 shapes 一一对应），用来砍掉没库存的形状
 * @param {Uint8Array} [spec.blocked]  被锁定片占住的原子，任何候选都不许碰
 * @returns {{ list: object[], byAtom: Map<number, number[]> }}
 */
export function enumerateCandidates(spec) {
  const { grid, state, allow, shapes, shapeCaps = null, blocked = null } = spec
  const cells = targetCells(state, grid)
  const list = []
  const byAtom = new Map()
  const seen = new Set()

  shapes.forEach((shape, shapeIndex) => {
    if (shapeCaps && shapeCaps[shapeIndex] === 0) return
    if (!SHAPES[shape]) return

    for (const rot of ROTATIONS[shape] ?? []) {
      const fp = footprint(shape, rot)
      // 锚点 = 足迹里每一格减去自己的偏移。同一个锚点会被多个足迹格推出来，去重。
      for (const [di, dj] of fp) {
        for (const c of cells) {
          const i = c.i - di
          const j = c.j - dj
          const key = `${shape}|${rot}|${i}|${j}`
          if (seen.has(key)) continue
          seen.add(key)

          const atoms = atomsAt(grid, shape, rot, i, j)
          if (!atoms) continue

          let ok = true
          let outsideHits = 0
          for (const t of atoms) {
            // blocked 与 allow 是两张各管各的掩码，不能合并成一个：
            // ① dilateAllow（L2 溢出档）会按邻近关系把 allow 往轮廓外扩一圈，
            //    折进去的锁定原子会被它顶掉；② allow=0 会让候选的 outsideHits
            //    把锁定原子统计成「出界」，而那个数参与候选排序。
            if (!allow[t] || (blocked && blocked[t])) {
              ok = false
              break
            }
            if (state[t] === 0) outsideHits += 1
          }
          if (!ok) continue

          // 一片都碰不到目标原子的候选是纯溢出，不要
          if (outsideHits === atoms.length) continue

          const idx = list.length
          list.push({
            shape,
            rot,
            i,
            j,
            atoms,
            size: atoms.length,
            outsideHits,
            // 落在被轮廓切过的原子上是要扣分的：那片磁力片有一半悬在轮廓外
            partialHits: atoms.filter((t) => state[t] === ATOM_PARTIAL).length,
          })
          for (const t of atoms) {
            const arr = byAtom.get(t)
            if (arr) arr.push(idx)
            else byAtom.set(t, [idx])
          }
        }
      }
    }
  })

  return { list, byAtom, cells }
}

/**
 * 每个必须覆盖的原子能被几个候选盖住。
 * 数量为 0 的是**注定补不上的洞**，是判断该降到哪一级的第一手依据。
 */
export function coverCounts(fullAtoms, byAtom) {
  const out = new Map()
  let zero = 0
  for (const t of fullAtoms) {
    const n = byAtom.get(t)?.length ?? 0
    out.set(t, n)
    if (n === 0) zero += 1
  }
  return { counts: out, uncoveredAtoms: zero }
}
