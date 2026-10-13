/**
 * 吸附用例。`scripts/bench-snap.mjs` 跑它们出验收数字，草稿页也拿它当「吸附自检」的
 * 例子列表 —— 一处写、两处用，避免页面上显示的样例跟测试台验的不是同一批。
 *
 * **用例全是顶点数组，不是掩码。** M3 的 `contours.js` 反过来（用掩码写），因为那边
 * 测的是「求解器能不能拼」；这边测的是「给一个顶点序列，吸附器认不认」，输入本来就
 * 是 AI 会吐的那种小数顶点数组 —— 用掩码反而绕开了要验的东西。
 *
 * `expect` 里能出现的键：
 *   ok / reasonCode              结果状态
 *   reasonIncludes               这句话必须出现在 reason 里（证明报错带上了有用的数字）
 *   verticesOut / areaAfter      成功时的顶点数与面积
 *   roundMove / maxMove          取整位移 / 放松位移，都精确到 1e-6
 *   warnCodes                    期望的 warnings（顺序无关）
 *   polyEquals                   期望的最终顶点（顺序敏感，左起第一个顶点）
 */
import { snapToGrid } from './snap.js'

/** 顶点的坐标全部是整数 —— 三个全局断言里的第一条要用 */
export const CASES = [
  /* ---------------- 能吸附的 ---------------- */

  {
    id: 'cleanHouse',
    name: '干净房子（45° 屋顶）',
    why: '顶点本来就在格点上、边本来就对齐。吸附必须**什么都不改** —— 这是「有损」与「无损」的分水岭，也是页面默认样例。',
    poly: [[0, 2], [2, 0], [4, 2], [4, 5], [0, 5]],
    expect: { ok: true, verticesOut: 5, areaAfter: 16, roundMove: 0, maxMove: 0, warnCodes: [] },
  },
  {
    id: 'stairs',
    name: '五级台阶',
    why: '每一级只有一格。DP 简化容差 0.35 格，而一个台阶的垂距约 0.7 格 —— 台阶必须**一级不少地活下来**，被削平就等于把轮廓改错了。',
    poly: [
      [4, 0], [5, 0], [5, 5], [0, 5], [0, 4], [1, 4],
      [1, 3], [2, 3], [2, 2], [3, 2], [3, 1], [4, 1],
    ],
    expect: { ok: true, verticesOut: 12, areaAfter: 15, roundMove: 0, maxMove: 0, warnCodes: [] },
  },
  {
    id: 'floatSquare',
    name: '小数顶点正方形',
    why: 'AI 描出来必然带小数。取整就能吸附，一个顶点都不用放松 —— 此时 maxMove 必须是 0，位移全记在 roundMove 上。',
    poly: [[0.2, 0.3], [4.4, 0.1], [4.2, 3.9], [0, 3.8]],
    expect: { ok: true, verticesOut: 4, areaAfter: 16, roundMove: 0.412, maxMove: 0, warnCodes: [] },
  },
  {
    id: 'near45',
    name: '近斜边三角形（放松到 45°）',
    why:
      '斜边 141.3°，要掰到 135°。关键在于掰哪个格点：挪到 (1,4) 斜边正了但竖直边歪了，' +
      '挪到 (4,0) 两条边同时正 —— 两个距离都是 1.0，只取「最近的一个」会判错。',
    poly: [[0, 0], [5, 0], [0, 4.4]],
    expect: {
      ok: true,
      verticesOut: 3,
      areaAfter: 8,
      maxMove: 1,
      polyEquals: [[0, 0], [4, 0], [0, 4]],
      warnCodes: ['BUDGET_SPENT'],
    },
  },

  /* ---------------- 该失败的 ---------------- */

  {
    id: 'deg30',
    name: '30° 斜边的三角形',
    why: '斜边差 14°，要掰正得把顶点挪 2.83 格 —— 远超声明的 1.0 格预算。这就是「不是吸附，是重画」，必须诚实失败。',
    poly: [[0, 0], [10, 0], [0, 5.77]],
    expect: { ok: false, reasonCode: 'EDGE_NOT_SNAPPABLE', reasonIncludes: '2.83' },
  },
  {
    id: 'flatSlope',
    name: '8:1 极缓坡三角',
    why:
      '与上一条同样是 EDGE_NOT_SNAPPABLE，但**原因不同**：掰正它只要挪 1.00 格、正好在预算上，' +
      '可是挪过去会把邻边弄歪 —— 不是「太远」而是「没有两全的落点」。报错话术要是混了，' +
      '用户会朝错的方向改图。这条就是 M3 里那个 L5 用例的轮廓。',
    poly: [[0, 0], [8, 0], [0, 1]],
    expect: { ok: false, reasonCode: 'EDGE_NOT_SNAPPABLE', reasonIncludes: '同时归位' },
  },
  {
    id: 'wall225',
    name: '22.5° 骑墙边的三角形',
    why: '斜度卡在 0° 与 45° 正中间，往哪边掰都是同样大的挪动。这种情况连目标方向都选不出来，报的码必须与「掰不动」区分开。',
    poly: [[0, 0], [5, 0], [0, 2]],
    expect: { ok: false, reasonCode: 'AMBIGUOUS_EDGE' },
  },
  {
    id: 'selfX',
    name: '自交多边形',
    why:
      '边与边交叉，围不出一个合法的目标区域。**必须关掉 DP 简化才测得到** —— ' +
      '容差 0.35 会把交叉的那个顶点当噪声删掉，于是还没走到自交检查，输入就已经不是自交的了。',
    poly: [[0, 0], [4, 0], [4, 4], [6, 2], [0, 4]],
    options: { dpTolerances: [0] },
    expect: { ok: false, reasonCode: 'SELF_INTERSECT' },
  },
  {
    id: 'shrinkQuad',
    name: '取整缩水 21% 的方块',
    why:
      '真实阈值（保留 40% 面积）几乎摸不到，所以这里把 collapseRatio 调到 0.9 来验**守卫接线对不对**。' +
      '不这么测的话，「形状被压塌」这条分支永远没人走过，写错了也发现不了。',
    poly: [[0.6, 0.6], [4.4, 0.6], [4.4, 3.6], [0.6, 3.6]],
    options: { collapseRatio: 0.9 },
    expect: { ok: false, reasonCode: 'AREA_COLLAPSE' },
  },

  /* ---------------- 边界 ---------------- */

  {
    id: 'twoVerts',
    name: '只有两个顶点',
    why: '两个点围不成面。AI 偶尔会把「一片空白」的图描成一条线。',
    poly: [[0, 0], [3, 0]],
    expect: { ok: false, reasonCode: 'TOO_FEW_VERTICES' },
  },
  {
    id: 'degenerateLine',
    name: '四个共线顶点',
    why: '顶点数够，但简化后连 3 个都剩不下 —— 面积哨兵拦住，理由应指向「太细」而不是「太碎」。',
    poly: [[0, 0], [1, 0], [2, 0], [3, 0]],
    expect: { ok: false, reasonCode: 'AREA_TOO_SMALL' },
  },
  {
    id: 'sliver',
    name: '比一个格还窄的三角',
    why: '取整前是个细长三角，取整后三个顶点压成一条线。这是 AREA_TOO_SMALL 的另一条来路（取整后塌掉，不是简化后塌掉）。',
    poly: [[0, 0], [6, 0], [6, 0.4]],
    expect: { ok: false, reasonCode: 'AREA_TOO_SMALL' },
  },
  {
    id: 'tooMany',
    name: '500 个顶点的圆',
    why: 'AI 有时把边缘上每个像素都算一个顶点。isSimple 是 O(n²)，不先卡住上限就会在简化之前先卡住页面。',
    poly: Array.from({ length: 500 }, (_, k) => {
      const a = (k / 500) * Math.PI * 2
      return [Number((8 + 6 * Math.cos(a)).toFixed(3)), Number((8 + 6 * Math.sin(a)).toFixed(3))]
    }),
    expect: { ok: false, reasonCode: 'TOO_MANY_VERTICES' },
  },
]

/**
 * 三条全局断言，对**每一条**用例都跑（不只是成功的那几条）：
 *
 *   1. 结果坐标全是整数 —— 既然要放到格点上，就不该出现 3.0000000001
 *   2. `ok: true` 时 `isGridFriendly(poly, 0.5)` 必真 —— 「吸附成功」与
 *      「栅格化可信」必须是同一件事，否则求解器会拿到一个没对齐的轮廓
 *   3. `ok: false` 时 `poly` 必是空数组 —— 半成品放 `bestEffort`，
 *      绝不能让它从 `poly` 这条路上溜进求解器
 */
export function checkInvariants(poly, result, isGridFriendly) {
  const bad = []

  for (const [x, y] of result.poly) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      bad.push(`结果里有非格点坐标 (${x}, ${y})`)
      break
    }
  }

  if (result.ok && !isGridFriendly(result.poly, 0.5)) {
    bad.push('ok 为真，但 poly 不是网格友好的')
  }

  if (!result.ok && result.poly.length !== 0) {
    bad.push(`ok 为假，但 poly 里有 ${result.poly.length} 个顶点`)
  }

  return bad
}

/** 给页面和 bench 共用的入口：跑一条用例，返回结果 */
export function runCase(c) {
  return snapToGrid(c.poly, c.options)
}
