/**
 * 方格掩码 → 边界多边形。
 *
 * 从 `solver/contours.js` 搬下来的：M3 用它写测试用例，M4 的轮廓管线用它当
 * 「多边形路径失败」时的兜底。两个上层模块都要用同一份实现，所以它得住在
 * 它们下面这层。
 */
import { dropCollinear } from './polygon.js'

/**
 * 对每个填充格，把朝向空格（或界外）的那条边按**顺时针**方向输出：
 * 上边向右、右边向下、下边向左、左边向上。方向必须一致，否则一个角上会同时
 * 冒出两条从该点出发的边，链就断了（第一版就是这么错的，面积恒为 0）。
 * 顺时针一圈下来每条边首尾相接，从任一条边起步都能走回原点。
 * 最后去掉共线的中间点 —— 不化简的话一个 8×8 正方形会有 32 个顶点。
 *
 * 只认 `'#'` 是填充格。调用方负责把 AI 给的各种形态归一化成 '#/.' 两字符，
 * 免得这里长出七八个分支去猜「1 是真还是 false 是真」。
 */
export function outlineFromMask(rows) {
  const h = rows.length
  const w = rows[0].length
  const filled = (i, j) => i >= 0 && j >= 0 && i < w && j < h && rows[j][i] === '#'

  const edges = new Map() // 起点 "x,y" → 终点 "x,y"
  const push = (x1, y1, x2, y2) => edges.set(`${x1},${y1}`, [x2, y2, x1, y1])

  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      if (!filled(i, j)) continue
      if (!filled(i, j - 1)) push(i, j, i + 1, j) // 上边，向右
      if (!filled(i + 1, j)) push(i + 1, j, i + 1, j + 1) // 右边，向下
      if (!filled(i, j + 1)) push(i + 1, j + 1, i, j + 1) // 下边，向左
      if (!filled(i - 1, j)) push(i, j + 1, i, j) // 左边，向上
    }
  }

  if (edges.size === 0) return []

  const startKey = edges.keys().next().value
  const pts = []
  let cur = startKey
  let walked = 0
  for (let guard = 0; guard <= edges.size; guard += 1) {
    const e = edges.get(cur)
    if (!e) break
    pts.push([e[2], e[3]])
    walked += 1
    cur = `${e[0]},${e[1]}`
    if (cur === startKey) break // 回到起点就收工。不能靠 guard 兜底 —— 那样会把起点
    // 重复加进末尾，而 dropCollinear 判断「上一点→本点→下一点」时，末尾那个重复点
    // 会让起点两侧都退化成零长度边，于是真顶点被当成共线点删掉，面积直接少一半。
  }

  // 一坨掩码只能围出一条边。走出多个环说明掩码不连通（中间有空隙）或者带洞，
  // 这时候拿到的多边形是错的 —— 宁可在这儿炸掉也别让它悄悄算出一个错的形状。
  // 调用方（`outline/extract.js`）负责接住这个异常并给出可读的说法。
  if (walked !== edges.size) {
    throw new Error(`掩码不连通：${edges.size} 条边只走出了 ${walked} 条。用例得是一整块。`)
  }

  return dropCollinear(pts)
}

/**
 * 掩码里的 4-连通分量，按面积从大到小。
 *
 * AI 给的掩码带孤立噪点是常态（描边外多涂一个像素）。把最大的那块留下、
 * 其余丢掉，能把「噪点毁掉整张图」变成「噪点被清掉」，而且这个动作会记在
 * `extract` 的 notes 里，不是悄悄干的。
 *
 * 返回 `[{ size, rows }]`，`rows` 是同样尺寸的掩码、只保留这一块。
 */
export function maskComponents(rows) {
  const h = rows.length
  const w = rows[0]?.length ?? 0
  const seen = Array.from({ length: h }, () => new Uint8Array(w))
  const found = []

  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      if (seen[j][i] || rows[j][i] !== '#') continue
      // 显式栈的洪水填充。递归版在 60×60 的掩码上会爆栈。
      const stack = [[i, j]]
      const cells = []
      seen[j][i] = 1
      while (stack.length) {
        const [x, y] = stack.pop()
        cells.push([x, y])
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          if (seen[ny][nx] || rows[ny][nx] !== '#') continue
          seen[ny][nx] = 1
          stack.push([nx, ny])
        }
      }
      const out = Array.from({ length: h }, () => '.'.repeat(w).split(''))
      for (const [x, y] of cells) out[y][x] = '#'
      found.push({ size: cells.length, rows: out.map((r) => r.join('')) })
    }
  }

  return found.sort((a, b) => b.size - a.size)
}
