/**
 * 轮廓提取的用例。`scripts/bench-extract.mjs` 跑它们出验收数字。
 *
 * 这里测的**不是几何**（几何在 `snapCases.js` 和求解器那边测过了），是**决策**：
 * 两条路都在的时候走哪条、一条走不通时是不是真的退到了另一条、退的时候有没有
 * 把「我退过了」说出来。这条链路上最容易悄悄坏掉的就是这些判断 ——
 * 它坏掉的表现不是报错，而是**安静地用错了轮廓**，然后求解器给出一张
 * 形状不对但看起来挺合理的图。
 */
import { isGridFriendly } from '../contour/polygon.js'
import { extractOutline } from './extract.js'

const COLS = 12
const ROWS = 10

/** 用「第几行放什么」写掩码，省得手数 12 个点。`board([0,'####'])` 是第一行四个填充格。 */
function board(...lines) {
  const rows = Array.from({ length: ROWS }, () => '.'.repeat(COLS))
  for (const [j, s] of lines) rows[j] = s.padEnd(COLS, '.')
  return rows
}

export const CASES = [
  /* ---------------- 多边形走得通 ---------------- */
  {
    id: 'polyOnly',
    name: '只有多边形（干净房子）',
    why: '没有掩码可退，多边形必须独立走通。',
    payload: { polygon: [[0, 2], [2, 0], [4, 2], [4, 5], [0, 5]] },
    expect: { ok: true, path: 'polygon', area: 16 },
  },
  {
    id: 'polyWins',
    name: '两条路都在，多边形无损',
    why:
      '**这条是「多边形优先」的守门人。** 同一栋房子，掩码那版是台阶屋顶、面积 23，' +
      '多边形这版是干净的 45°、面积 16。判断写反了，`area: 16` 立刻就红 ——' +
      '光断言 path 不够，万一哪天 path 字段自己写错了，面积是第二道锁。',
    payload: {
      polygon: [[0, 2], [2, 0], [4, 2], [4, 5], [0, 5]],
      // 同一栋房子的台阶版：格子只能整格取，斜屋顶必然盖多了
      mask: board([0, '.###'], [1, '#####'], [2, '#####'], [3, '#####'], [4, '#####']),
    },
    expect: { ok: true, path: 'polygon', area: 16 },
  },
  {
    id: 'polyOutOfCanvas',
    name: '多边形比画布宽',
    why:
      'AI 数错格子、把形状画到画布外是常见的。这**不是**失败 —— 形状本身是合法的，' +
      '只是求解器铺不到外面那截。要给用户一句能看懂的话，而不是让他对着' +
      '「覆盖率 78%」自己猜为什么。',
    payload: { polygon: [[0, 0], [14, 0], [14, 3], [0, 3]] },
    expect: { ok: true, path: 'polygon', area: 42, problemsInclude: '超出画布' },
  },

  /* ---------------- 多边形被拒，退到掩码 ---------------- */
  {
    id: 'fallbackToMask',
    name: '多边形边掰不直 → 掩码兜底',
    why:
      '1:6 的缓坡（这条正是 M3 的 `wedge`）。多边形这条路必须**明确失败**并说明原因，' +
      '然后用掩码给出一个能照搭的台阶版。用户看到的是「屋顶变成了台阶」，' +
      '而不是「求解失败」。',
    payload: {
      polygon: [[0, 0], [6, 0], [6, 1], [0, 4]],
      mask: board([0, '####'], [1, '####'], [2, '####']),
    },
    expect: { ok: true, path: 'mask', area: 12, notesInclude: '多边形', attempts: { polygon: 'EDGE_NOT_SNAPPABLE' } },
  },
  {
    id: 'maskOnly',
    name: '只有掩码',
    why: 'AI 可能只给掩码（或者多边形字段被 parse 丢干净了）。此时不该因为「多边形是空的」就报错。',
    payload: { mask: board([0, '#####'], [1, '#####'], [2, '##...'], [3, '##...'], [4, '##...']) },
    expect: { ok: true, path: 'mask', area: 16 },
  },
  {
    id: 'noisyMask',
    name: '掩码带孤立噪点',
    why:
      '孤立的一个填充格会让 `outlineFromMask` 抛异常（它只肯围一条环）。' +
      '必须丢掉噪点、按最大的连通块取轮廓，**并且把丢掉这件事记进 notes** ——' +
      '「这张图少了个东西」和「这张图很干净」是两件不同的事。',
    payload: {
      mask: board([0, '####'], [1, '####'], [2, '####'], [9, '.'.repeat(11) + '#']),
    },
    expect: { ok: true, path: 'mask', area: 12, notesInclude: '断开' },
  },

  /* ---------------- 两条都不行 ---------------- */
  {
    id: 'bothBad',
    name: '多边形掰不直 + 掩码全空',
    why:
      '**报错必须把两条路各自的原因都说出来。** 只说掩码那句会让人以为是掩码的问题，' +
      '而掩码常常根本没给 —— 用户会往完全错误的方向查。',
    payload: { polygon: [[0, 0], [8, 0], [0, 1]], mask: board() },
    expect: { ok: false, reasonIncludes: ['多边形', '掩码'] },
  },
  {
    id: 'maskHole',
    name: '掩码带洞',
    why:
      '回字形掩码围出两条环，`outlineFromMask` 抛异常。没有多边形可以退，只能失败，' +
      '但错误信息要说清是「掩码取不出单一轮廓」，不能是那句原始的「只走出了 N 条边」。',
    payload: { mask: board([0, '####'], [1, '#..#'], [2, '####']) },
    expect: { ok: false, reasonIncludes: '掩码取不出单一轮廓', attempts: { mask: 'MASK_OUTLINE_FAILED' } },
  },
  {
    id: 'nothing',
    name: '两套表示都没有',
    why: 'AI 返回了一个格式合法但内容为空的 JSON。页面不能白屏，得有一句人话。',
    payload: {},
    expect: { ok: false, reasonIncludes: '都没有' },
  },
  {
    id: 'onlyTwoVerts',
    name: '多边形只有两个顶点',
    why:
      '两个点围不出面积。这条钉的是「多边形这条路**压根没试过**」和「试了但失败」的区别 —— ' +
      '两者都要落进 `attempts.polygon.tried`，页面才能说清到底发生了什么。',
    payload: { polygon: [[0, 0], [4, 4]], mask: board([0, '####'], [1, '####'], [2, '####']) },
    expect: { ok: true, path: 'mask', area: 12, attempts: { polygon: 'not-tried' } },
  },
]

/**
 * 三条全局断言。对**每一条**用例都跑，管的是「结果能不能喂给求解器」这件事本身：
 * 成功即网格友好且走了某条路，失败即空数组且有话说。
 */
export function checkExtractInvariants(result) {
  const bad = []

  if (result.ok) {
    if (!Array.isArray(result.poly) || result.poly.length < 3) {
      bad.push(`ok 为真但 poly 只有 ${result.poly?.length ?? 0} 个顶点`)
    } else if (!isGridFriendly(result.poly, 0.5)) {
      bad.push(`ok 为真但 poly 不是网格友好的：${JSON.stringify(result.poly)}`)
    }
    if (result.path !== 'polygon' && result.path !== 'mask') {
      bad.push(`ok 为真但 path 是 ${JSON.stringify(result.path)}`)
    }
  } else {
    if (!Array.isArray(result.poly) || result.poly.length !== 0) {
      bad.push(`失败时 poly 必须是空数组，实际是 ${JSON.stringify(result.poly)}`)
    }
    if (!result.reason) bad.push('失败时 reason 是空的')
  }

  return bad
}

export function runCase(c) {
  return extractOutline(c.payload, { canvas: { cols: COLS, rows: ROWS } })
}
