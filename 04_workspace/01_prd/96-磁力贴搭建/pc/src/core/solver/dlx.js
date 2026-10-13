/**
 * DLX —— Knuth 的 Algorithm X（Dancing Links）。**通用的精确覆盖内核，
 * 跟磁力片没有任何关系**，换任何组合问题都能用。
 *
 * 与教科书版本的三处差别，都是这个项目真的需要的：
 *
 * 1. **列分「必须」和「可选」**。轮廓栅格化之后，完全落在轮廓里的原子必须覆盖，
 *    被轮廓切过一半的原子盖不盖都行。后者做成可选列（最多被覆盖一次），
 *    于是「必须精确覆盖」和「可有可无」能写在同一个矩阵里。
 *
 * 2. **每个候选行带一个形状编号，形状有数量上限**。库存限制是「至多 n 片」这种
 *    基数约束，DLX 里没有便宜的编码方式（要拆成 n 份列 + 行复制，矩阵会炸）。
 *    做成搜索时的剪枝反而既简单又准：用量到顶就跳过这一行。
 *
 * 3. **一次能取多个解**。DLX 给出的解通常不止一个，而「片数最少」这类偏好
 *    靠搜索顺序只是撞运气，靠多取几个解再打分才稳。方案文档里这一层本来要交给
 *    CP-SAT，但 DLX 多解 + 打分能覆盖掉其中一大半，还不用把 CP-SAT 拖进前端。
 */
import { mulberry32 } from '../util/rng.js'

/**
 * @param {object} spec
 * @param {number} spec.nCols            列数
 * @param {number[][]} spec.rows         每行覆盖哪些列
 * @param {Uint8Array} spec.required     1 = 该列必须被恰好覆盖一次
 * @param {Int32Array} [spec.shapeOfRow] 每行的形状编号，-1 表示不限
 * @param {Int32Array} [spec.shapeLimit] 每个形状的数量上限
 * @param {Float64Array} [spec.rowRank]  行优先级（小的先试）。不给就按插入顺序。
 * @param {number} [spec.limit]          最多取几个解，默认 1
 * @param {number} [spec.maxNodes]       搜索节点上限，防跑飞
 * @param {number} [spec.seed]           打乱行顺序的种子，保证可复现
 */
export function solveExactCover(spec) {
  const {
    nCols,
    rows,
    required,
    shapeOfRow = null,
    shapeLimit = null,
    rowRank = null,
    limit = 1,
    maxNodes = 400000,
    seed = 0,
  } = spec

  const nRows = rows.length
  const nShapes = shapeLimit ? shapeLimit.length : 0

  /* ---------- 建十字链表 ---------- */
  let nNodes = nCols + 1
  for (const r of rows) nNodes += r.length

  const L = new Int32Array(nNodes)
  const R = new Int32Array(nNodes)
  const U = new Int32Array(nNodes)
  const D = new Int32Array(nNodes)
  const colOf = new Int32Array(nNodes)
  const size = new Int32Array(nCols + 1)
  const rowOf = new Int32Array(nNodes).fill(-1)

  const root = 0

  // 列头 1..nCols，横向串成环
  for (let c = 0; c <= nCols; c += 1) {
    L[c] = c === 0 ? nCols : c - 1
    R[c] = c === nCols ? 0 : c + 1
    U[c] = c
    D[c] = c
    colOf[c] = c
  }
  for (let c = 1; c <= nCols; c += 1) size[c] = 0

  // 插入顺序会影响搜索顺序，用种子打乱之后仍然完全可复现
  const order = new Int32Array(nRows)
  for (let k = 0; k < nRows; k += 1) order[k] = k
  if (seed) {
    const rand = mulberry32(seed)
    for (let k = nRows - 1; k > 0; k -= 1) {
      const m = Math.floor(rand() * (k + 1))
      const tmp = order[k]
      order[k] = order[m]
      order[m] = tmp
    }
  }

  let node = nCols
  const tail = new Int32Array(nCols + 1)
  for (let c = 0; c <= nCols; c += 1) tail[c] = c

  for (let ok = 0; ok < nRows; ok += 1) {
    const r = order[ok]
    const cols = rows[r]
    if (!cols || cols.length === 0) continue
    const first = node + 1
    for (let k = 0; k < cols.length; k += 1) {
      const c = cols[k]
      node += 1
      const h = c + 1 // 列头节点编号

      colOf[node] = h
      rowOf[node] = r

      // 纵向：挂到列尾
      const t = tail[h]
      D[t] = node
      U[node] = t
      D[node] = h
      U[h] = node
      tail[h] = node

      // 横向：行内环
      if (k === 0) {
        L[node] = node
        R[node] = node
      } else {
        const p = node - 1
        R[p] = node
        L[node] = p
        R[node] = first
        L[first] = node
      }
      size[h] += 1
    }
  }

  /* ---------- 搜索 ---------- */
  const solutions = []
  const partial = []
  const used = new Int32Array(nShapes)
  let nodes = 0
  let aborted = false

  const cover = (h) => {
    L[R[h]] = L[h]
    R[L[h]] = R[h]
    for (let i = D[h]; i !== h; i = D[i]) {
      for (let j = R[i]; j !== i; j = R[j]) {
        U[D[j]] = U[j]
        D[U[j]] = D[j]
        size[colOf[j]] -= 1
      }
    }
  }

  const uncover = (h) => {
    for (let i = U[h]; i !== h; i = U[i]) {
      for (let j = L[i]; j !== i; j = L[j]) {
        size[colOf[j]] += 1
        U[D[j]] = j
        D[U[j]] = j
      }
    }
    L[R[h]] = h
    R[L[h]] = h
  }

  const search = () => {
    if (aborted || solutions.length >= limit) return
    nodes += 1
    if (nodes > maxNodes) {
      aborted = true
      return
    }

    // 只在「还没被覆盖的必须列」里挑行数最少的那个。
    // 被覆盖的列已经摘出横向环，所以这个遍历天然只看到未覆盖的列。
    let best = -1
    for (let c = R[root]; c !== root; c = R[c]) {
      if (!required[c - 1]) continue
      if (size[c] === 0) return // 这一列谁也盖不住，死路
      if (best === -1 || size[c] < size[best]) best = c
    }

    // 没有剩下的必须列 = 必须覆盖的都盖上了 → 一个解
    if (best === -1) {
      solutions.push(partial.slice())
      return
    }

    cover(best)

    // 收集这一列的所有候选行，按优先级排一下
    const cand = []
    for (let r = D[best]; r !== best; r = D[r]) cand.push(r)
    if (rowRank) {
      cand.sort((a, b) => rowRank[rowOf[a]] - rowRank[rowOf[b]] || rowOf[a] - rowOf[b])
    }

    for (const r of cand) {
      const row = rowOf[r]
      const sh = shapeOfRow ? shapeOfRow[row] : -1
      if (shapeLimit && sh >= 0 && used[sh] >= shapeLimit[sh]) continue

      partial.push(row)
      if (sh >= 0) used[sh] += 1
      for (let j = R[r]; j !== r; j = R[j]) cover(colOf[j])

      search()

      for (let j = L[r]; j !== r; j = L[j]) uncover(colOf[j])
      if (sh >= 0) used[sh] -= 1
      partial.pop()

      if (aborted || solutions.length >= limit) break
    }

    uncover(best)
  }

  search()

  return {
    solutions,
    nodes,
    aborted,
    /** 搜索是否被截断（节点上限或解数上限），调用方据此判断「没解」和「没找完」 */
    truncated: aborted || solutions.length >= limit,
  }
}

/**
 * 便利入口：只要一个解。找不到返回 null。
 */
export function exactCoverOnce(spec) {
  const r = solveExactCover({ ...spec, limit: 1 })
  return r.solutions.length ? r.solutions[0] : null
}
