/**
 * 轮廓提取：把 AI 给的两套表示（多边形 + 掩码）变成**一个**能交给求解器的多边形。
 *
 * 多边形优先，掩码兜底。理由是它们擅长的东西不一样：多边形能表达 45° 斜边
 * （房子屋顶、菱形），但完全依赖 AI 数坐标的精度；掩码最稳，但斜边只能变成台阶。
 * 近一半的真实造型带斜边，所以先试多边形；它一旦被吸附器拒掉（边掰不直），
 * 说明这次 AI 的坐标数得离谱，退回掩码至少还能出一个台阶版的形状。
 *
 * 这个文件同时是 `outlineFromMask` 的**缓冲层**。那个函数对不连通掩码是抛异常的
 * （contours.js:59「宁可在这儿炸掉」），而 AI 给的掩码带孤立噪点是常态。
 * 那行 throw 不能动 —— `bench-solve` 的 20 个用例依赖它守住「用例必须是一整块」，
 * 所以接住异常、清噪点、把做过的事记下来的责任落在这儿。
 */
import { DEFAULT_CANVAS } from '../config.js'
import { outlineFromMask, maskComponents } from '../contour/mask.js'
import { bboxOf, isGridFriendly } from '../contour/polygon.js'
import { snapToGrid } from '../contour/snap.js'

/** 终检门槛：凹角 180° 以内、边偏差 ≤0.5° 才算「贴上了网格」。 */
const GRID_TOL = 0.5

/**
 * @param {{ polygon?: number[][], mask?: string[]|null, note?: string }} payload
 *        `parse.js` 的 `parseOutlinePayload` 产物
 * @param {{ canvas?: {cols:number, rows:number}, snapOptions?: object }} options
 * @returns {{
 *   ok: boolean, path: 'polygon'|'mask'|null, poly: number[][],
 *   snap: object|null, attempts: object, notes: string[], problems: string[], reason: string,
 * }}
 */
export function extractOutline(payload, { canvas, snapOptions } = {}) {
  const notes = []
  const problems = []
  const attempts = {
    polygon: { tried: false, ok: false, reasonCode: null, reason: '' },
    mask: { tried: false, ok: false, reasonCode: null, reason: '' },
  }

  const board = canvas ?? DEFAULT_CANVAS
  const fromPolygon = tryPolygon(payload?.polygon, { snapOptions, notes, problems, attempts })
  if (fromPolygon) return finish('polygon', fromPolygon, { board, notes, problems, attempts })

  const fromMask = tryMask(payload?.mask, { snapOptions, notes, problems, attempts })
  if (fromMask) return finish('mask', fromMask, { board, notes, problems, attempts })

  // 两条路都没走通。reason 要把**两条路各自的原因**都说出来 —— 只说第二条
  // 会让人以为是掩码的问题，而掩码常常根本没给。
  const parts = []
  if (attempts.polygon.tried) parts.push(`多边形：${attempts.polygon.reason}`)
  if (attempts.mask.tried) parts.push(`掩码：${attempts.mask.reason}`)
  const reason = parts.length ? parts.join('；') : 'AI 两套表示都没有给：既没有多边形，也没有掩码'

  return { ok: false, path: null, poly: [], snap: null, attempts, notes, problems, reason }
}

function finish(path, result, { board, notes, problems, attempts }) {
  const { poly, snap } = result
  const bb = bboxOf(poly)
  if (bb.maxX > board.cols + 1e-6 || bb.maxY > board.rows + 1e-6) {
    problems.push(
      `轮廓的包围盒是 ${bb.w}×${bb.h} 格、右下角到 (${bb.maxX}, ${bb.maxY})，超出画布 ${board.cols}×${board.rows}。` +
        '求解器只在画布范围内铺，超出的部分不会被铺到。',
    )
  }
  if (path === 'mask' && attempts.polygon.tried) {
    notes.push(`多边形这条路没走通（${attempts.polygon.reason}），已改用掩码。掩码的斜边是台阶状的。`)
  }
  return { ok: true, path, poly, snap, attempts, notes, problems, reason: '' }
}

function tryPolygon(rawPoly, { snapOptions, notes, problems, attempts }) {
  if (!Array.isArray(rawPoly) || rawPoly.length < 3) {
    if (Array.isArray(rawPoly) && rawPoly.length > 0) {
      problems.push(`多边形只有 ${rawPoly.length} 个顶点，至少需要 3 个`)
    }
    return null
  }

  attempts.polygon.tried = true
  const snap = snapToGrid(rawPoly, snapOptions)
  attempts.polygon.ok = snap.ok
  attempts.polygon.reasonCode = snap.reasonCode
  attempts.polygon.reason = snap.reason

  if (!snap.ok) {
    // 半成品只用来「给你看」，绝不往下走 —— 与 solve.js 的 bestEffort 同名同义。
    if (Array.isArray(snap.bestEffort) && snap.bestEffort.length >= 3) {
      attempts.polygon.bestEffort = snap.bestEffort
    }
    return null
  }

  const stats = snap.stats ?? {}
  if (stats.maxMove > 0) {
    notes.push(
      `多边形吸附时把顶点挪动了，最远 ${stats.maxMove.toFixed(2)} 格；` +
        `形状面积从 ${fmt(stats.areaBefore)} 变成 ${fmt(stats.areaAfter)}`,
    )
  }
  return { poly: snap.poly, snap: { ok: true, stats, warnings: snap.warnings ?? [] } }
}

function tryMask(rawMask, { snapOptions, notes, problems, attempts }) {
  if (!Array.isArray(rawMask) || rawMask.length === 0) return null
  attempts.mask.tried = true

  const parts = maskComponents(rawMask)
  if (parts.length === 0) {
    attempts.mask.reasonCode = 'MASK_EMPTY'
    attempts.mask.reason = '掩码里没有连成一片的填充格'
    problems.push(attempts.mask.reason)
    return null
  }

  // 只留最大的连通块，其余当噪点丢掉 —— **记在 notes 里，不悄悄干**。
  // 「这张图少了块东西」和「这张图很干净」是两件不同的事，用户得能分辨。
  const chosen = parts[0]
  if (parts.length > 1) {
    const strayCells = parts.slice(1).reduce((sum, p) => sum + p.size, 0)
    notes.push(
      `掩码里有 ${parts.length - 1} 块和主体断开的小区域（共 ${strayCells} 格），已丢掉，` +
        `轮廓按最大的那一块（${chosen.size} 格）取`,
    )
  }

  let raw
  try {
    raw = outlineFromMask(chosen.rows)
  } catch (err) {
    attempts.mask.reasonCode = 'MASK_OUTLINE_FAILED'
    attempts.mask.reason = `掩码取不出单一轮廓：${err.message}`
    problems.push(attempts.mask.reason)
    return null
  }

  if (raw.length < 3) {
    attempts.mask.reasonCode = 'TOO_FEW_VERTICES'
    attempts.mask.reason = `掩码推出的轮廓只有 ${raw.length} 个顶点`
    problems.push(attempts.mask.reason)
    return null
  }

  // 掩码推出来的边界只有 0°/90°、顶点全在格点上，**本该不需要吸附**。
  // 还是跑一遍：一是拿到与多边形路径同构的 stats 供页面显示，
  // 二是万一它竟然不通过，说明吸附器或 isGridFriendly 有 bug，得让它出声。
  const snap = snapToGrid(raw, snapOptions)
  if (snap.ok) {
    attempts.mask.ok = true
    attempts.mask.reasonCode = null
    attempts.mask.reason = ''
    return { poly: snap.poly, snap: { ok: true, stats: snap.stats ?? {}, warnings: snap.warnings ?? [] } }
  }

  // 兜底中的兜底：吸附器拒了，但轮廓本身是网格友好的。真实契约是与求解器之间的
  // `isGridFriendly`，吸附只是达到它的手段 —— 手段失效但契约满足时，认契约，
  // 同时把这件事说清楚。
  if (isGridFriendly(raw, GRID_TOL)) {
    notes.push(`掩码推出来的轮廓没过吸附器（${snap.reason}），但它本身是网格友好的，直接用了。这是个不该发生的情况。`)
    problems.push(`掩码轮廓绕过了吸附器，原因：${snap.reason}`)
    attempts.mask.ok = true
    attempts.mask.reason = ''
    return { poly: raw, snap: null }
  }

  attempts.mask.reasonCode = snap.reasonCode
  attempts.mask.reason = `掩码推出来的轮廓不网格友好，这不该发生：${snap.reason}`
  problems.push(attempts.mask.reason)
  return null
}

const fmt = (n) => (typeof n === 'number' ? Number(n.toFixed(2)) : n)
