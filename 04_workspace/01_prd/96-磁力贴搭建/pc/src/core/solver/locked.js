/**
 * 锁定片的强制放置 —— 「改几片、其余围绕它重解」的地基。
 *
 * 这个文件存在的理由：**锁定不能做成求解器里的一处分叉**。
 * 锁定只表达为三件事，三件都是数据：
 *   1. 这些原子不许被别的候选碰        → blocked 掩码，沿管线一路传下去
 *   2. 这些形状的库存已被占掉一部分    → usage，扣库存用
 *   3. 这些原子在 fullAtoms 里已经被盖住 → atoms，并进候选的 covered
 *
 * 于是 `lockedTiles: []` 时 blocked 全是 0、usage 是空的、atoms 是空数组，
 * 整条管线走的是**同一条路**。这件事由 bench 的 P1 钉住（空锁定与不传锁定
 * 逐字节相同），而不是靠「记得不要写分叉」这种自觉 —— 分叉是可以被无意间
 * 写出来的，逐字节比较不会撒谎。
 *
 * 调用方只给数据，**原子由这里自己对着传进来的 grid 推**。让调用方算好再传，
 * 就得把 grid 漏过边界，或者埋一个「两边 grid 不一致」的雷 —— 原子索引
 * `t = (j*cols + i)*4 + q` 依赖 cols，网格差一格，锁定片就全体错位。
 *
 * 用户数据不可信，所以这里**绝不抛异常**：不认识的形状、越界、互相重叠
 * 都变成 ok:false + reason，交给页面显示成一条能看懂的话。
 */
import { SHAPES, atomsAt } from '../geometry/shapes.js'
import { TILE_INVALID, TILE_SOURCE } from '../model/work.js'

/**
 * 就是 `work.js` 里那一套码，不另立一份 —— 页面拿到 `analyzeWork` 的报错和拿到
 * 锁定失败的报错时，该认的是同一批码。保留这个别名是因为「锁定失败」在调用方
 * 读起来比「片非法」更贴题，而 `bench-lock` 的 P9 也按它断言。
 */
export const LOCK_INVALID = TILE_INVALID

/**
 * @param {object} spec
 * @param {object[]} spec.tiles  锁定的片（work.json 里那种形态：shape/rot/i/j/color）
 * @param {object} spec.grid     与本次求解**同一个** grid
 * @returns {{ ok, reason, tiles, blocked: Uint8Array, atoms: (number[]|null)[],
 *             usage: object, ids: string[], invalid: object[] }}
 */
export function buildLocked({ tiles = [], grid }) {
  const src = Array.isArray(tiles) ? tiles : []
  const blocked = new Uint8Array(grid.atomCount)
  const atoms = []
  const usage = {}
  const ids = []
  const invalid = []

  // 归一化成一份**带 id 的副本**：不动调用方的对象，也不要求调用方先过一遍
  // normalizeWork。id 沿用求解器那套「位置派生」的规则 —— 缺 id 时能推出来，
  // 而重解之后同一处的 id 不变，锁定片的选中态和步骤引用才连得上。
  const out = src.map((tile) => ({
    id: typeof tile?.id === 'string' && tile.id ? tile.id : `${tile?.shape}-${tile?.rot}-${tile?.i}-${tile?.j}`,
    shape: tile?.shape,
    // i/j 转成整数：work.json 是用户能直接改的，字符串 "3" 会让 `i + di` 变成
    // 字符串拼接，然后被当成越界 —— 报出来的原因跟真实原因差十万八千里。
    // 转不动的会成 NaN，老老实实落到下面的 OUT_OF_BOUNDS。
    rot: Number(tile?.rot) || 0,
    i: Math.trunc(Number(tile?.i)),
    j: Math.trunc(Number(tile?.j)),
    color: typeof tile?.color === 'string' && tile.color ? tile.color : null,
    locked: true,
    source: tile?.source === TILE_SOURCE.MANUAL ? TILE_SOURCE.MANUAL : TILE_SOURCE.SOLVER,
  }))

  // 原子 → 先占它的片序号。跟 analyzeWork 里那份重叠判定同一个手法：
  // 按**原子集合**判，不按包围盒 —— 两个三角形的包围盒必然相交，却能严丝合缝。
  const owner = new Map()

  out.forEach((tile, k) => {
    ids.push(tile.id)

    const cells = atomsAt(grid, tile.shape, tile.rot, tile.i, tile.j)
    if (!cells) {
      // null 有两种原因，分开说 —— 一个手滑的形状名同时报出「不认识」和「越界」
      // 会把排查方向带偏。判断顺序跟 analyzeWork 保持一致。
      invalid.push(
        SHAPES[tile.shape]
          ? {
              index: k,
              id: tile.id,
              code: LOCK_INVALID.OUT_OF_BOUNDS,
              message: `锁定的 ${tile.id} 整个或部分落在画布 ${grid.cols}×${grid.rows} 之外`,
            }
          : {
              index: k,
              id: tile.id,
              code: LOCK_INVALID.UNKNOWN_SHAPE,
              message: `锁定的 ${tile.id} 用了不认识的形状「${tile.shape}」`,
            },
      )
      atoms.push(null)
      return
    }

    for (const t of cells) {
      const prev = owner.get(t)
      if (prev !== undefined) {
        invalid.push({
          index: k,
          id: tile.id,
          code: LOCK_INVALID.OVERLAP,
          message: `锁定的 ${ids[prev]} 与 ${tile.id} 互相压住了，两者不可能同时成立`,
        })
        atoms.push(null)
        return
      }
      owner.set(t, k)
    }

    for (const t of cells) blocked[t] = 1
    atoms.push(cells)
    usage[tile.shape] = (usage[tile.shape] ?? 0) + 1
  })

  if (invalid.length) {
    return { ok: false, reason: invalid[0].message, tiles: out, blocked, atoms, usage, ids, invalid }
  }
  return { ok: true, reason: null, tiles: out, blocked, atoms, usage, ids, invalid }
}

/**
 * full 里没被锁掉的原子。
 *
 * **顺序必须原样保留。** P1 要求空锁定时与今天逐字节相同，而 fullAtoms 的顺序
 * 会一路影响到 DLX 的 required 列与 slack 的摘取顺序 —— 任何重排（排序、
 * Set 去重、按格号重编）都会让同一份输入产出不同的方案，而且是那种「跑得通、
 * 但结果跟以前不一样」的静默变化。
 */
export function remainingFull(full, blocked) {
  if (!blocked) return full
  return full.filter((t) => !blocked[t])
}
