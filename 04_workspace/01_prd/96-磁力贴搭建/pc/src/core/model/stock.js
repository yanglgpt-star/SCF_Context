/**
 * 库存的两种形态之间的转换。
 *
 * `library/stock.json` 里存的是**每个形状一个总数 + 一份颜色清单**
 * （`{ shapeId: 'SQ', count: 24, colors: ['红','橙',...] }`）——
 * 因为用户拿卡尺数的是「我这儿有几片正方形」，不会去数「有几片红色的正方形」。
 *
 * 但求解器要的是「这个形状的每种颜色还剩几片」，才好在配色时把颜色用匀。
 * 所以这里把总数按颜色清单**尽量均分**（除不尽的余数给前面的颜色），
 * 保证加起来仍然等于总数 —— 不然 shapeCaps 会比实际库存少几片，
 * 求解器会在明明够用的时候报「库存不够」。
 */
import { COLOR_NAMES } from './palette.js'

/**
 * @param {Array<{shapeId: string, count: number, colors?: string[]}>} items
 * @returns {Record<string, Record<string, number>>} { SQ: { 红: 5, 橙: 5, ... } }
 */
export function stockToShapeMap(items) {
  const out = {}
  for (const it of items ?? []) {
    if (!it || typeof it.shapeId !== 'string') continue
    const count = Math.max(0, Math.floor(Number(it.count) || 0))
    // 没写颜色就用整个色板 —— 缺省比空着好，空着会让配色直接没颜色可选
    const colors = Array.isArray(it.colors) && it.colors.length ? it.colors.filter((c) => COLOR_NAMES.includes(c)) : COLOR_NAMES
    if (!colors.length) continue

    const per = Math.floor(count / colors.length)
    let rest = count - per * colors.length
    const map = {}
    for (const c of colors) {
      map[c] = per + (rest > 0 ? 1 : 0)
      if (rest > 0) rest -= 1
    }
    out[it.shapeId] = map
  }
  return out
}

/** 形状总片数：{ SQ: 24, ... }。求解器的库存上限用这个 */
export function stockTotals(shapeMap) {
  const out = {}
  for (const [shape, colors] of Object.entries(shapeMap ?? {})) {
    out[shape] = Object.values(colors).reduce((a, b) => a + b, 0)
  }
  return out
}
