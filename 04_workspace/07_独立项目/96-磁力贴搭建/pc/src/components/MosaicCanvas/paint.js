import { QUADRANT_OUTLINE, colorHex, outline } from '../../core/api.js'

/**
 * 渲染用的坐标换算与路径生成。
 *
 * 网格坐标 → SVG 用户单位：一格 = S。viewBox 用的是用户单位，
 * SVG 自己负责缩放到容器；缩放/平移只作用在内层 <g> 上。
 * 线宽一律配 vector-effect="non-scaling-stroke"，这样放大到 4 倍
 * 描边也不会跟着变粗。
 */
export const S = 64

/** 画布四周留的余量（用户单位），让贴边的格子不至于顶着视口边框 */
export const PAD = 28

/** 颜色变暗，给磁力片描边用。白片尤其需要 —— 不然在米白底上看不见边界 */
export function shade(hex, amount) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#8A857A'
  const n = parseInt(m[1], 16)
  const r = Math.round(((n >> 16) & 255) * amount)
  const g = Math.round(((n >> 8) & 255) * amount)
  const b = Math.round((n & 255) * amount)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** 一片磁力片的轮廓路径 */
export function tilePath(shape, rot, i, j) {
  const pts = outline(shape, rot).map(([x, y]) => `${(i + x) * S} ${(j + y) * S}`)
  return `M${pts.join('L')}Z`
}

/**
 * 格坐标 → 整格序号。**只按整格算，不判象限。**
 *
 * 这是这套几何一个便宜的性质：所有形状的锚点都在包围盒左下角，而那个角**永远落在
 * 整格上**（SQ 1×1、TRI-R 1×1 且两个象限同格、RECT 2×1 或 1×2）。所以「点哪个格 +
 * 当前朝向」唯一确定一次放置，象限由 `footprint()` 推出来。判象限要多一次点击、
 * 还要处理一个含糊的命中目标，换不来任何表达力。
 *
 * ★ 传进来的必须是 `clientToContent()` 给的那种**格坐标** —— 就是 `tilePath` 直接乘
 * `S` 的那套。这里除的 `S` 和那里乘的 `S` 是同一个。
 *
 * 别顺手喂 `clientToView()` 的结果：那是 viewBox 坐标，只在视口为恒等变换时与格坐标
 * 相等。平移或缩放之后两者分家，喂错了的表现是**幽灵预览飘到隔壁格、点下去被拒**，
 * 而默认视口下完全看不出来（这条真出现过）。
 *
 * 返回值可能落在画布外（负数或超出行列）。**不在这儿夹紧** —— 合不合法由
 * `core/model/edit.js` 的 `canPlace` 一处说了算，视图层不该有第二套边界规则。
 */
export const cellAtContentPoint = (x, y) => ({ i: Math.floor(x / S), j: Math.floor(y / S) })

/**
 * 一片磁力片在用户坐标里的中心，锁角标挂在这儿。
 *
 * 用**顶点平均**而不是包围盒中心：三角形的包围盒中心正好落在斜边上，角标会有一半
 * 悬在片外。凸多边形的顶点平均必定落在内部，而本项目三种形状的顶点平均恰好既是
 * 三角形的心也是四边形的心。导出的成品图**不画**这个角标（锁定是编辑态的事，
 * 不是作品的样子），所以它不进 `tileSvgAttrs`。
 */
export function tileCenter(shape, rot, i, j) {
  const pts = outline(shape, rot)
  let sx = 0
  let sy = 0
  for (const [x, y] of pts) {
    sx += x
    sy += y
  }
  return { x: (i + sx / pts.length) * S, y: (j + sy / pts.length) * S }
}

/**
 * 目标轮廓的路径（格子坐标，一格 = 1）。
 *
 * 叠在磁力片**上面**：降级到 L1/L4 时缺口、L2 时压出界的部分，都得靠这条线
 * 才看得出来 —— 只看一片片磁力片，"差在哪儿"是读不出来的。
 */
export function contourPath(poly) {
  if (!poly || poly.length < 3) return null
  const pts = poly.map(([x, y]) => `${x * S} ${y * S}`)
  return `M${pts.join('L')}Z`
}

/** 磁铁点：每条边的中点，实物上每片边中间都有一颗磁铁 */
export function tileMagnets(shape, rot, i, j) {
  const poly = outline(shape, rot)
  return poly.map((p, k) => {
    const q = poly[(k + 1) % poly.length]
    return { x: (i + (p[0] + q[0]) / 2) * S, y: (j + (p[1] + q[1]) / 2) * S }
  })
}

/** 整张网格线，拼成一条 path —— 几十条线只用一个 DOM 节点 */
export function gridPath(cols, rows) {
  const segs = []
  for (let i = 0; i <= cols; i += 1) segs.push(`M${i * S} 0V${rows * S}`)
  for (let j = 0; j <= rows; j += 1) segs.push(`M0 ${j * S}H${cols * S}`)
  return segs.join('')
}

/**
 * 原子细分线：每个「有片占用的格子」画两条对角线。
 * 这两条对角线正是把方格切成 4 个象限的那两条，所以看到的就是原子结构本身。
 */
export function atomOverlayPath(ijList) {
  const segs = []
  for (const [i, j] of ijList) {
    const x0 = i * S
    const y0 = j * S
    const x1 = (i + 1) * S
    const y1 = (j + 1) * S
    segs.push(`M${x0} ${y0}L${x1} ${y1}`)
    segs.push(`M${x1} ${y0}L${x0} ${y1}`)
  }
  return segs.join('')
}

/** 单个象限的路径，原子视图里给每个象限上色用 */
export function quadrantPath(i, j, q) {
  const pts = QUADRANT_OUTLINE[q].map(([x, y]) => `${(i + x) * S} ${(j + y) * S}`)
  return `M${pts.join('L')}Z`
}

/**
 * 一片磁力片的全部绘制属性。**画布和导出共用这一份** ——
 * `Tile.jsx` 拿它渲染 React 元素，`exportSvg.js` 拿它拼 SVG 字符串。
 *
 * 这是「导出图与画布所见一致」的唯一保证。视觉规则写两遍，就一定会有一遍先改，
 * 而那时两张图会**悄悄**不一样：片数、位置、颜色全对，只有描边的虚实或磁铁点的
 * 透明度差一点 —— 这种差异没人会去逐像素比，只会觉得「导出的图好像不太对」。
 *
 * `nonScalingStroke` 是两者**必须不同**的唯一一处：
 *   画布上缩放靠 <g transform>，描边要配 vector-effect 才不跟着变粗；
 *   导出是把它栅格化成固定像素，没有变换，描边该跟着一起缩放（否则放大两倍出图，
 *   填色粗了一倍而描边还是 1.3 像素，细得像头发丝）。
 */
export function tileSvgAttrs(tile, { nonScalingStroke = true } = {}) {
  const fill = colorHex(tile.color)
  const isWhite = tile.color === '白'
  const vectorEffect = nonScalingStroke ? { vectorEffect: 'non-scaling-stroke' } : {}

  return {
    path: {
      d: tilePath(tile.shape, tile.rot, tile.i, tile.j),
      fill,
      fillOpacity: isWhite ? 1 : 0.87,
      stroke: shade(fill, 0.68),
      strokeWidth: 1.3,
      strokeLinejoin: 'round',
      ...vectorEffect,
    },
    magnets: tileMagnets(tile.shape, tile.rot, tile.i, tile.j).map((m) => ({
      cx: m.x,
      cy: m.y,
      r: 3.4,
      fill: '#FFFFFF',
      fillOpacity: isWhite ? 0.9 : 0.52,
      stroke: shade(fill, 0.78),
      strokeWidth: 0.8,
      ...vectorEffect,
    })),
  }
}
