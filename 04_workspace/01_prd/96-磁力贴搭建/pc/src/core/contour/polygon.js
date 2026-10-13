/**
 * 多边形工具。**只管已经变成顶点数组的轮廓**——core 层不碰图像，
 * 去背景、findContours 那几步属于 M4 的轮廓管线。
 *
 * 坐标一律是「单位坐标」：1 = 一个基准边长 a，y 轴向下（跟网格 (i,j) 一致）。
 */
import { ATOM_EPS } from '../config.js'

/** 有向面积。y 轴向下时，顺时针为正。 */
export function signedArea(poly) {
  let s = 0
  for (let k = 0; k < poly.length; k += 1) {
    const [x1, y1] = poly[k]
    const [x2, y2] = poly[(k + 1) % poly.length]
    s += x1 * y2 - x2 * y1
  }
  return s / 2
}

export function polygonArea(poly) {
  return Math.abs(signedArea(poly))
}

export function bboxOf(poly) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of poly) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
}

export function perimeter(poly) {
  let p = 0
  for (let k = 0; k < poly.length; k += 1) {
    const [x1, y1] = poly[k]
    const [x2, y2] = poly[(k + 1) % poly.length]
    p += Math.hypot(x2 - x1, y2 - y1)
  }
  return p
}

/**
 * 点是否在多边形内部（射线法）。**边界上的点算在内部** ——
 * 采样点正好压在多边形边上时，算内比算外更符合直觉：
 * 那条边就是轮廓本身，边上的面积当然属于轮廓。
 */
export function pointInPolygon(x, y, poly) {
  const n = poly.length
  if (n < 3) return false

  // 先查是否落在某条边上
  for (let k = 0; k < n; k += 1) {
    const [x1, y1] = poly[k]
    const [x2, y2] = poly[(k + 1) % n]
    if (pointOnSegment(x, y, x1, y1, x2, y2)) return true
  }

  let inside = false
  for (let k = 0, m = n - 1; k < n; m = k, k += 1) {
    const [xk, yk] = poly[k]
    const [xm, ym] = poly[m]
    // 半开区间 [min, max) 避免顶点被数两次
    if (yk > y !== ym > y) {
      const tx = xk + ((y - yk) * (xm - xk)) / (ym - yk)
      if (x < tx) inside = !inside
    }
  }
  return inside
}

function pointOnSegment(px, py, x1, y1, x2, y2) {
  const cross = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)
  if (Math.abs(cross) > ATOM_EPS) return false
  const dot = (px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)
  if (dot < -ATOM_EPS) return false
  const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2
  return dot <= len2 + ATOM_EPS
}

const cross2 = (ox, oy, ax, ay, bx, by) => (ax - ox) * (by - oy) - (ay - oy) * (bx - ox)

/** 两条线段是否真正相交（共线重叠也算） */
export function segmentsIntersect(a1, a2, b1, b2) {
  const [ax1, ay1] = a1
  const [ax2, ay2] = a2
  const [bx1, by1] = b1
  const [bx2, by2] = b2

  const d1 = cross2(ax1, ay1, ax2, ay2, bx1, by1)
  const d2 = cross2(ax1, ay1, ax2, ay2, bx2, by2)
  const d3 = cross2(bx1, by1, bx2, by2, ax1, ay1)
  const d4 = cross2(bx1, by1, bx2, by2, ax2, ay2)

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }
  if (Math.abs(d1) <= ATOM_EPS && pointOnSegment(bx1, by1, ax1, ay1, ax2, ay2)) return true
  if (Math.abs(d2) <= ATOM_EPS && pointOnSegment(bx2, by2, ax1, ay1, ax2, ay2)) return true
  if (Math.abs(d3) <= ATOM_EPS && pointOnSegment(ax1, ay1, bx1, by1, bx2, by2)) return true
  if (Math.abs(d4) <= ATOM_EPS && pointOnSegment(ax2, ay2, bx1, by1, bx2, by2)) return true
  return false
}

/**
 * 简单多边形检查（无自交）。O(n²)，但轮廓简化后只有 20-40 个顶点，够用。
 * 相邻边共享顶点是正常的，不检查它们。
 */
export function isSimple(poly) {
  const n = poly.length
  if (n < 3) return false
  for (let a = 0; a < n; a += 1) {
    const a1 = poly[a]
    const a2 = poly[(a + 1) % n]
    for (let b = a + 1; b < n; b += 1) {
      // 跳过相邻边（共享顶点）和首尾相邻
      if (b === a || (b + 1) % n === a || (a + 1) % n === b) continue
      if (segmentsIntersect(a1, a2, poly[b], poly[(b + 1) % n])) return false
    }
  }
  return true
}

/**
 * 每条边的方向。吸附之后，轮廓的边应该只有 0/45/90/135 四种方向
 * （也就是「网格友好」）。返回每条边的角度与偏差，供可行性报告用。
 */
export function edgeAngles(poly) {
  const out = []
  for (let k = 0; k < poly.length; k += 1) {
    const [x1, y1] = poly[k]
    const [x2, y2] = poly[(k + 1) % poly.length]
    const deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
    const norm = ((deg % 180) + 180) % 180 // 边方向无向，折到 [0,180)
    const targets = [0, 45, 90, 135]
    let best = targets[0]
    let dev = Infinity
    for (const t of targets) {
      const d = Math.min(Math.abs(norm - t), 180 - Math.abs(norm - t))
      if (d < dev) {
        dev = d
        best = t
      }
    }
    out.push({ index: k, angle: norm, snapped: best, deviation: dev, length: Math.hypot(x2 - x1, y2 - y1) })
  }
  return out
}

/** 所有边都贴合 0/45/90/135 且偏差小于容差 —— 栅格化结果才可信 */
export function isGridFriendly(poly, tol = 1) {
  return edgeAngles(poly).every((e) => e.deviation <= tol)
}

/**
 * Douglas-Peucker 简化。M4 的轮廓管线要用；这里先实现，
 * 因为「轮廓简化」在文档里是降级阶梯的一环，得能独立测。
 */
export function simplify(poly, tolerance) {
  if (poly.length <= 3 || tolerance <= 0) return poly.slice()

  const keep = new Uint8Array(poly.length)
  keep[0] = 1
  keep[poly.length - 1] = 1
  const stack = [[0, poly.length - 1]]
  while (stack.length) {
    const [lo, hi] = stack.pop()
    let maxDev = -1
    let maxAt = -1
    for (let k = lo + 1; k < hi; k += 1) {
      const d = perpendicularDistance(poly[k], poly[lo], poly[hi])
      if (d > maxDev) {
        maxDev = d
        maxAt = k
      }
    }
    if (maxDev > tolerance && maxAt > 0) {
      keep[maxAt] = 1
      stack.push([lo, maxAt], [maxAt, hi])
    }
  }

  const out = []
  for (let k = 0; k < poly.length; k += 1) if (keep[k]) out.push(poly[k])
  // 首尾重合就去掉一个，闭合多边形的第一个顶点不重复存
  if (out.length > 1 && Math.abs(out[0][0] - out[out.length - 1][0]) < ATOM_EPS && Math.abs(out[0][1] - out[out.length - 1][1]) < ATOM_EPS) {
    out.pop()
  }
  return out
}

function perpendicularDistance(p, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (len < ATOM_EPS) return Math.hypot(p[0] - a[0], p[1] - a[1])
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len
}

/**
 * 去掉三点共线的中间点。**叉积判等用的是精确 0，不是容差**——
 * 这个函数只服务于坐标已经是整数的多边形（掩码推出的边界、吸附后的格点），
 * 那种输入下「共线」就是精确共线。用容差反而会把「差一点点才共线」的真顶点删掉，
 * 而那些点正是形状的特征。
 */
export function dropCollinear(pts) {
  if (pts.length < 3) return pts
  const out = []
  for (let k = 0; k < pts.length; k += 1) {
    const a = pts[(k + pts.length - 1) % pts.length]
    const b = pts[k]
    const c = pts[(k + 1) % pts.length]
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    if (cross !== 0) out.push(b)
  }
  return out
}

/** 去掉相邻重合点（取整之后必然会出现）。零长度边不清理，后面每条边都要单独特判。 */
export function dedupeAdjacent(pts) {
  const out = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && Math.abs(last[0] - p[0]) < ATOM_EPS && Math.abs(last[1] - p[1]) < ATOM_EPS) continue
    out.push(p)
  }
  // 首尾绕一圈也可能重合
  while (
    out.length > 1 &&
    Math.abs(out[0][0] - out[out.length - 1][0]) < ATOM_EPS &&
    Math.abs(out[0][1] - out[out.length - 1][1]) < ATOM_EPS
  ) {
    out.pop()
  }
  return out
}

/**
 * 把多边形整体平移到「左下角贴 (0,0)」。
 * 求解前统一做这一步，目标区域的坐标才跟画布对齐。
 */
export function translateToOrigin(poly) {
  const { minX, minY } = bboxOf(poly)
  return poly.map(([x, y]) => [x - minX, y - minY])
}

/** 整体平移 */
export function translate(poly, dx, dy) {
  return poly.map(([x, y]) => [x + dx, y + dy])
}

/** 左右镜像（关于竖直轴 x = axis 翻转）。对称性评分要用。 */
export function mirrorX(poly, axis) {
  return poly.map(([x, y]) => [2 * axis - x, y])
}
