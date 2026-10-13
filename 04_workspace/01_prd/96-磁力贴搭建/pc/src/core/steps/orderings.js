/**
 * 四个排序策略 —— **只是优先级函数，不是序列生成器**。
 *
 * 这是 M7 最重要的一个范围决定：四个策略都只回答「先想要哪一片」，至于
 * 「这一片现在搭不搭得上」「多少片并成一步」「这一步的文案怎么写」全都只有一份实现，
 * 在 `sequence.js` 里。做成四个独立的序列生成器就意味着四份合并逻辑、
 * 四份「其中一个吐出搭不起来的步骤」的机会。
 *
 * ## 这里没有任何随机数
 *
 * `mulberry32`/`hashSeed` 是为了让**求解器**的重试可复现。排序是个排序，
 * 引入种子只会让同一份 work 有机会产出不同的步骤 —— 那是最让人不放心的一类不确定性
 * （同样的输入、同样的按钮，出来两张不一样的图）。
 *
 * 确定性的做法是**字典序全序**：每个策略给每片算一个键数组，逐项比较。
 * 兜底项是锚点 `(j, i)`，而同一份 work 里两片的锚点**不可能相同**
 * （锚点格一定是被这片占住的格之一，同格必重叠），所以全序成立。
 * 于是「结果与输入数组的顺序无关」是结构性质，`bench:steps` 只是去确认它。
 */
import { COLOR_NAMES } from '../model/palette.js'

export const STRATEGIES = ['center-out', 'bottom-up', 'by-color', 'by-region']

const META = {
  'center-out': {
    label: '中心向外',
    hint: '从造型中心往外扩，先立主心骨。孩子最容易上手的一种搭法。',
  },
  'bottom-up': {
    label: '从下往上',
    hint: '先铺最底下一排，逐层往上垒。像砌墙，底盘最稳。',
  },
  'by-color': {
    label: '按颜色分组',
    hint: '同一种颜色连着搭完再换色。适合手上要按颜色分拣的场合。',
  },
  'by-region': {
    label: '按区域分块',
    hint: '把造型切成四块，一块一块搭完。适合片数多的作品。',
  },
}

export function strategiesMeta() {
  return STRATEGIES.map((id) => ({ id, ...META[id] }))
}

export function isStrategy(id) {
  return STRATEGIES.includes(id)
}

/* ---------------- 键的比较 ---------------- */

/** 字典序比较两个键数组。键里只放数字和字符串，且逐项同类型。 */
function cmpKey(a, b) {
  for (let k = 0; k < a.length; k += 1) {
    if (a[k] < b[k]) return -1
    if (a[k] > b[k]) return 1
  }
  return 0
}

/** 锚点全序 —— 所有策略的最后一项兜底 */
const anchor = (t) => [t.j, t.i]

/* ---------------- 各策略的键 ---------------- */

/**
 * 片集质心，单位是锚点坐标（格）。
 * **四套策略共用同一个质心**（不是各组各算一个）：「中心」在这份 work 里只有一个意思，
 * 各组各算一个的话，换成 by-color 之后「中心向外」指的就不是同一个点了，
 * 四张步骤图会围绕四个不同的中心展开，反而更难对照。
 */
function centroidOf(tiles) {
  let sx = 0
  let sy = 0
  for (const t of tiles) {
    sx += t.i + 0.5
    sy += t.j + 0.5
  }
  return [sx / tiles.length, sy / tiles.length]
}

const dist2 = (t, [cx, cy]) => (t.i + 0.5 - cx) ** 2 + (t.j + 0.5 - cy) ** 2

/**
 * 颜色分组的名次：**组按片数降序**（片多的先搭，一色用完再换手），
 * 同数量按调色板序（色板里的先后是有意的，不是随机的），再同则按色名。
 * 没上色的片自成一档，排在最后 —— 它们通常在等人工定色，最后搭不挡事。
 */
function colorRanks(tiles) {
  const count = new Map()
  for (const t of tiles) {
    const key = t.color ?? ''
    count.set(key, (count.get(key) ?? 0) + 1)
  }
  const keys = [...count.keys()].sort((a, b) => {
    const d = count.get(b) - count.get(a)
    if (d) return d
    const pa = a === '' ? COLOR_NAMES.length : COLOR_NAMES.indexOf(a)
    const pb = b === '' ? COLOR_NAMES.length : COLOR_NAMES.indexOf(b)
    const na = pa < 0 ? COLOR_NAMES.length + 1 : pa
    const nb = pb < 0 ? COLOR_NAMES.length + 1 : pb
    if (na !== nb) return na - nb
    return a < b ? -1 : a > b ? 1 : 0
  })
  const rank = new Map()
  keys.forEach((k, r) => rank.set(k, r))
  return (t) => rank.get(t.color ?? '') ?? keys.length
}

/**
 * 包围盒切 2×2 块，块按片数降序，同数按行主序（先下面的行）。
 *
 * 切块用的是**锚点包围盒**，不是画布 —— 用画布切的话，一个只占右上角的小造型
 * 会被切成「右下空块 / 右上满块」，四块里三块是空的，等于没分块。
 */
function regionRanks(tiles) {
  const iMin = Math.min(...tiles.map((t) => t.i))
  const iMax = Math.max(...tiles.map((t) => t.i))
  const jMin = Math.min(...tiles.map((t) => t.j))
  const jMax = Math.max(...tiles.map((t) => t.j))
  const midI = (iMin + iMax + 1) / 2
  const midJ = (jMin + jMax + 1) / 2

  const blockOf = (t) => (t.j < midJ ? 0 : 1) * 2 + (t.i < midI ? 0 : 1)

  const count = new Map()
  for (const t of tiles) {
    const b = blockOf(t)
    count.set(b, (count.get(b) ?? 0) + 1)
  }
  // 行主序：j 小的块排前面（y 轴向下，j 小的是上面）
  const blocks = [0, 1, 2, 3].filter((b) => count.has(b))
  blocks.sort((a, b) => {
    const d = count.get(b) - count.get(a)
    if (d) return d
    return a - b
  })
  const rank = new Map()
  blocks.forEach((b, r) => rank.set(b, r))
  return { blockOf, rankOf: (t) => rank.get(blockOf(t)) ?? blocks.length }
}

/* ---------------- 入口 ---------------- */

/**
 * 按策略给出**优先级排列**（不是最终搭建序 —— 那个要过连通性，见 `growOrder`）。
 *
 * @param {object[]} tiles  已归一化的片（`work.tiles`）
 * @param {object} _grid    留着是为了和 `growOrder` 同签名。排序不看网格：`i`/`j` 就是格。
 * @param {string} strategy
 * @param {{centroid?: number[]}} [ctx]
 * @returns {number[]} 片的**下标**排列，优先级从高到低
 */
export function orderTiles(tiles, _grid, strategy, ctx = {}) {
  const n = tiles.length
  if (!n) return []
  const c = ctx.centroid ?? centroidOf(tiles)
  const idx = tiles.map((_, k) => k)

  let keyOf
  if (strategy === 'bottom-up') {
    // y 轴向下 ⇒ j 大的是下面。同排按 i 从左到右。锚点本身就是全序，不用再兜底
    keyOf = (t) => [-t.j, t.i]
  } else if (strategy === 'by-color') {
    const cr = colorRanks(tiles)
    keyOf = (t) => [cr(t), dist2(t, c), ...anchor(t)]
  } else if (strategy === 'by-region') {
    const { rankOf } = regionRanks(tiles)
    keyOf = (t) => [rankOf(t), dist2(t, c), ...anchor(t)]
  } else {
    // center-out 也是未知策略的兜底：它只依赖几何，任何一份 work 都算得出来
    keyOf = (t) => [dist2(t, c), ...anchor(t)]
  }

  return idx.sort((x, y) => cmpKey(keyOf(tiles[x]), keyOf(tiles[y])))
}
