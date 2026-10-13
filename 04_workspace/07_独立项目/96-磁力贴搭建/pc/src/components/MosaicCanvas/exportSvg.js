/**
 * 把一张 work.json 拼成**自包含**的 SVG 字符串，用来出图。
 *
 * 和 `MosaicCanvas` 的关系：那套是给屏幕看的，靠 `global.css` 的 class 上色；
 * 这套是给文件和栅格化看的，颜色必须**内联成 hex**。原因很实在 ——
 * `exportSvg` 的输出会被塞进 Blob 交给 `<img>`，而 `<img>` 里的 SVG 是
 * 独立文档：读不到页面的 CSS 变量、也读不到外部样式表。带 `var(--canvas)` 出去，
 * 出来就是一张透明或全黑的图。
 *
 * 所以这个文件里**不许出现 `class=`、不许出现 `var(`** —— bench 会对导出的字符串
 * 直接断言这两条。视觉规则本身从 `paint.js` 的 `tileSvgAttrs()` 和 `theme.js`
 * 的 `tokens` 取，一处定义、两处使用。
 *
 * 一个例外要写清楚：**字体**。SVG 里没法内联字体文件，只能给字体栈。
 * 详情见 `FAMILY`。
 */
import { SHAPES } from '../../core/api.js'
import { fontStack, tokens } from '../../theme.js'
import { S, contourPath, gridPath, tileSvgAttrs } from './paint.js'

/** 画布四周留的余量（用户单位）。不留的话，贴边格子的描边会被裁掉一半。 */
export const EXPORT_PAD = 10

/** 步骤图顶部那条标题带的高度（用户单位 = viewBox 的像素） */
export const STEP_BAND = 72

const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

/**
 * XML 转义。
 *
 * 片 id、颜色、路径数字都是自己算出来的，本来不含特殊字符 —— 但 `caption` 和
 * `meta.title` 是**用户可见的自由文本**，里面出现一个 `&` 就能让整张图变成
 * 「SVG 解析失败」。栅格化那条路（`svgToPng`）只报一句「SVG 解析失败（多半是
 * 字符串里有没转义的字符）」，根本指不到是哪张图、哪个字段。
 */
export function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => {
    if (c === '&') return '&amp;'
    if (c === '<') return '&lt;'
    if (c === '>') return '&gt;'
    if (c === '"') return '&quot;'
    return '&apos;'
  })
}

const attrs = (obj) =>
  Object.entries(obj)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${kebab(k)}="${escapeXml(v)}"`)
    .join(' ')

/**
 * 字体栈。`theme.js` 的 `fontStack` 里带着双引号（`"PingFang SC"`），
 * 直接塞进双引号属性的值里会把属性截断，所以先把双引号换成单引号，
 * 剩下的引号交给 `escapeXml` 转成 `&apos;`（XML 预定义实体，解析回来还是单引号）。
 *
 * **这里只用系统字体，不加载 webfont。** 于是 `svgToPng` 那条 `<img>` 路径
 * 没有字体加载竞态 —— 图不会时而带上字体、时而退回默认字体。代价是**换一台机器
 * 渲染，标题的字形可能略有差异**，这是步骤 PNG 唯一一处做不到跨机逐字节可复现的
 * 地方（片的位置、颜色仍然逐字节可复现）。
 */
const FAMILY = fontStack.replace(/"/g, "'")

/* ---------------- 骨架 ---------------- */

/**
 * 文档骨架：底色、画布、网格、边框。两种导出共用，所以抽在这里一处。
 * `buildExportSvg` 传 `topExtra: 0`，于是输出与抽出来之前逐字节相同。
 */
function svgScaffold({ w, h, cols, rows, background, showGrid, scale, topExtra = 0, title = null }) {
  const pad = EXPORT_PAD
  const pxW = Math.round((w + pad * 2) * scale)
  const pxH = Math.round((h + pad * 2 + topExtra) * scale)
  const top = -pad - topExtra
  const fullH = h + pad * 2 + topExtra

  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pxW}" height="${pxH}"`,
    `     viewBox="${-pad} ${top} ${w + pad * 2} ${fullH}">`,
  ]
  if (title) lines.push(`  <title>${escapeXml(title)}</title>`)
  lines.push(
    `  <rect ${attrs({ x: -pad, y: top, width: w + pad * 2, height: fullH, fill: tokens.ground })} />`,
    `  <rect ${attrs({ x: 0, y: 0, width: w, height: h, fill: background ?? tokens.canvas })} />`,
  )
  if (showGrid) {
    lines.push(
      `  <path ${attrs({ d: gridPath(cols, rows), fill: 'none', stroke: tokens.grid, strokeWidth: 1 })} />`,
    )
  }
  lines.push(
    `  <rect ${attrs({ x: 0, y: 0, width: w, height: h, fill: 'none', stroke: tokens.rule, strokeWidth: 1 })} />`,
  )
  return { lines, top }
}

/** 一片磁力片 → 一个 `<g>`（片身 + 磁铁点）。`opacity` 给「已经搭好」的淡一档。 */
function tileGroup(t, { stroke = null, strokeWidth = null, opacity = null } = {}) {
  const { path, magnets } = tileSvgAttrs(t, { nonScalingStroke: false })
  const p = stroke ? { ...path, stroke, strokeWidth: strokeWidth ?? path.strokeWidth } : path
  const dots = magnets.map((m) => `    <circle ${attrs(m)} />`).join('\n')
  const gAttrs = opacity == null ? '' : ` ${attrs({ opacity })}`
  return `  <g${gAttrs}>\n    <path ${attrs(p)} />\n${dots}\n  </g>`
}

/* ---------------- 成品图 ---------------- */

/**
 * @param {object} spec
 * @param {object} spec.work      **已经过 analyzeWork 归一化的** work（`analysis.work`）
 * @param {number[][]} [spec.contour]  目标轮廓，给了就叠一条虚线，和画布一致
 * @param {boolean} [spec.showGrid]    默认 true
 * @param {number} [spec.scale]        输出像素倍数，默认 2（给社媒封面留点余量）
 * @returns {string} 完整 SVG 文档
 */
export function buildExportSvg({ work, contour = null, showGrid = true, scale = 2 }) {
  const { cols, rows } = work.canvas
  const w = cols * S
  const h = rows * S

  const { lines } = svgScaffold({
    w,
    h,
    cols,
    rows,
    background: work.canvas.background,
    showGrid,
    scale,
  })

  // 和 MosaicCanvas 一样：形状不认识的片不画。那是数据写错了，该由校验横幅解释。
  const tiles = (work.tiles ?? []).filter((t) => SHAPES[t.shape])
  const body = tiles.map((t) => tileGroup(t)).join('\n')

  const contourD = contourPath(contour)

  return [
    ...lines,
    body,
    contourD
      ? `  <path ${attrs({
          d: contourD,
          fill: 'none',
          stroke: tokens.ink,
          strokeWidth: 1.5,
          strokeDasharray: '7 5',
          strokeLinejoin: 'round',
        })} />`
      : null,
    '</svg>',
    '',
  ]
    .filter((line) => line !== null)
    .join('\n')
}

/* ---------------- 步骤图 ---------------- */

/**
 * 第 `index` 步的步骤图（从 0 数）。
 *
 * 三档：**本步的片**全不透明 + 品牌色描边，**更早的片**淡一档（0.7）无品牌描边，
 * **更晚的片根本不画**。
 *
 * 之所以要淡一档而不是只画本步：孩子拿着这张图要能在**整块板**上找到位置，
 * 只有本步那几片的话，图跟上一张几乎一样、又没有参照物。之所以后一步的片不画：
 * 画了就等于把答案提前给了。
 *
 * **取 `index` 而不是收一个 `step` 对象**：早先的签名打算收 `step`，那就得同时收
 * `index`（要算「更早的片」），于是两个参数有机会对不上（传了第 3 步的对象、第 2 步的
 * 下标），而那种错**画出来是一张完全合理的图**，只是内容是错的。从 work 里按下标取，
 * 结构上就没有对不上的可能。
 *
 * **绝不按 `step.camera` 裁切** —— 一裁切，孩子在整块板上找位置就没法用了，
 * 而「照着图搭」正是这些图的全部用途。camera 是给二期的视频推镜头用的。
 *
 * @param {object} spec
 * @param {object} spec.work   **已经过 analyzeWork 归一化的** work
 * @param {number} spec.index  第几步，从 0 数
 * @returns {string} 完整 SVG 文档
 */
export function buildStepSvg({ work, index, showGrid = true, scale = 2 }) {
  const steps = work.steps ?? []
  const step = steps[index]
  if (!step) throw new Error(`work.json 里没有第 ${index + 1} 步（共 ${steps.length} 步）`)

  const inStep = new Set(step.tileIds ?? [])
  const earlier = new Set()
  for (let k = 0; k < index; k += 1) {
    for (const id of steps[k].tileIds ?? []) earlier.add(id)
  }

  const { cols, rows } = work.canvas
  const w = cols * S
  const h = rows * S
  const head = step.caption || `第 ${step.no} 步`

  const { lines, top } = svgScaffold({
    w,
    h,
    cols,
    rows,
    background: work.canvas.background,
    showGrid,
    scale,
    topExtra: STEP_BAND,
    title: head,
  })

  const drawable = (work.tiles ?? []).filter((t) => SHAPES[t.shape] && (inStep.has(t.id) || earlier.has(t.id)))
  const body = drawable
    .map((t) =>
      inStep.has(t.id)
        ? tileGroup(t, { stroke: tokens.brand, strokeWidth: 2.6 })
        : tileGroup(t, { opacity: 0.7 }),
    )
    .join('\n')

  const band = [
    `  <text ${attrs({
      x: 0,
      y: top + 44,
      fontFamily: FAMILY,
      fontSize: 26,
      fontWeight: 600,
      fill: tokens.ink,
    })}>${escapeXml(head)}</text>`,
    `  <text ${attrs({
      x: 0,
      y: top + 66,
      fontFamily: FAMILY,
      fontSize: 16,
      fill: tokens.ink2,
    })}>${escapeXml(
      `本步 ${step.tileIds.length} 片 · 累计 ${step.progress.done} / ${step.progress.total} 片`,
    )}</text>`,
  ].join('\n')

  return [...lines, band, body, '</svg>', ''].join('\n')
}
