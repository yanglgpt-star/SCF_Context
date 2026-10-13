/**
 * 可复现的伪随机数。**求解器必须确定性** —— 同一份输入两次跑出不同的图，
 * 用户改一个颜色就看到布局全变，那是灾难。
 *
 * 所以不用 Math.random()：那是不可复现的。用固定种子，每次尝试换一个种子，
 * 既有「多试几种顺序」的收益，又保证同样的输入永远给同样的结果。
 */

/** mulberry32：32 位状态，够快够随机，实现只有几行 */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 字符串 → 32 位种子。给「同一份 work_id 永远同样的尝试顺序」用 */
export function hashSeed(str) {
  let h = 2166136261
  for (let k = 0; k < str.length; k += 1) {
    h ^= str.charCodeAt(k)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
