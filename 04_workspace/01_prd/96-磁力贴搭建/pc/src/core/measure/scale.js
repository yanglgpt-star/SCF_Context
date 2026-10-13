/**
 * 实测尺寸换算：一张俯拍照片 + 一条已知长度的边 → 全套形状的边长比例。
 *
 * **这里有个让整个做法成立的性质：卡尺那一次测量会自己约掉。**
 * 同一张照片里的所有东西都在同一个比例尺下，所以
 *     斜边/a = 斜边像素长 / a的像素长
 * —— 分子分母里的 cm-per-px 是同一个数，直接消掉。于是：
 *   · **比例**只靠像素就能定，跟卡尺读数无关（卡尺量歪了也不影响比例）
 *   · **绝对尺寸**只需要那一次卡尺读数，它同时就是 shapes.json 里的 unit
 * 这条性质由 bench 里「把所有点等比放大 3 倍，比例不变」那条断言钉住。
 *
 * 代价是它对**透视**没有免疫力：照片必须正对俯拍，斜着拍会近大远小，
 * 离镜头远的那块形状会被算小。模块没法检测这件事，只能靠 summarizeMarks
 * 报的「同一形状同一条边的多个采样散了多少」来提示 —— 散得大往往就是拍歪了
 * 或手抖了，而不是这套积木真的不方。
 *
 * **坐标一律是照片的原始像素**（naturalWidth/naturalHeight 那套），不是屏幕上的
 * 显示坐标。页面把点击换算成原始像素再进来；core 不知道照片显示成了多大。
 *
 * 跨边界只用 JSON 原生类型 —— 不返回 Map / Set / Date，这个文件以后要能整体搬去后端。
 */

/**
 * 参考边的绝对下限（原始像素）。参考边是一切比较的分母，得能可靠地点出来 ——
 * 一条 3 像素的参考边，1 个像素的点击误差就是 33%。这个阈值只能绝对，
 * 因为建立比例尺的时候还没有任何东西可以拿来当相对基准。
 */
export const MIN_REF_PX = 8

/**
 * 一条标注短于参考边的这个比例，就当成误点。
 *
 * **这里必须是相对值，不能是绝对像素数。** 同一个标注动作在同一套积木上，
 * 拍成 4000px 和拍成 600px 的照片，像素长差 6.7 倍 —— 用绝对阈值的话，
 * 一张照片里被判为误点的标注，在另一张里就成了合法样本，然后拉低平均值
 * 得到一个看起来很正常但错的 ratio。bench 里「把所有点放大 3 倍」那条
 * 全局性质就是冲着这个来的，它最初抓到的正是这个 bug。
 *
 * 取 3% 极其保守：这套积木里最短的边就是 1.0a（三角形的直角边），
 * 也就是参考边的 100%，所以它绝不可能误伤一条真边，只负责拦误点。
 */
export const MIN_MARK_FRACTION = 0.03

/** 参考边短于这个厘米数，换算出来的比例尺会被 1 像素的误差放大得没法用 */
export const MIN_REF_CM = 0.5

/**
 * 同一条边的多个采样散到这个百分比以上就值得看一眼 —— 可能是拍歪了、手抖了，
 * 也可能是这块积木真的不标准（那就该以实测为准，散着也只是提示）。
 */
export const SPREAD_WARN_PCT = 6

const EMPTY = { ok: false, reasonCode: 'EMPTY', reason: '还没标这条边。' }

function point(p) {
  return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null
}

/** 两点距离（原始像素）。任一端点不是合法点就返回 null。 */
export function distPx(a, b) {
  const p1 = point(a)
  const p2 = point(b)
  if (!p1 || !p2) return null
  return Math.hypot(p2.x - p1.x, p2.y - p1.y)
}

/**
 * 用参考边建立比例尺。参考边**就是**基准单位 a（正方形的一条边），
 * 所以 `cm` 既是比例尺的锚，也是 shapes.json 里要写进去的 unit —— 一次测量两用。
 */
export function makeScale(ref) {
  const p1 = point(ref?.a)
  const p2 = point(ref?.b)
  if (!p1 || !p2) return { ok: false, reasonCode: 'NO_REF', reason: '先把参考边（正方形的一条边）标出来。' }

  const px = distPx(p1, p2)
  if (px < MIN_REF_PX) {
    return {
      ok: false,
      reasonCode: 'REF_TOO_SHORT',
      reason: `参考边只有 ${px.toFixed(1)} 像素，太短了 —— 在照片上放大一点、把这条边标长一些再试。`,
    }
  }

  const cm = Number(ref.cm)
  if (!Number.isFinite(cm) || cm < MIN_REF_CM) {
    return {
      ok: false,
      reasonCode: 'BAD_CM',
      reason: `参考边的实测长度要填一个 ≥ ${MIN_REF_CM} 的数（现在是 ${ref.cm}）。`,
    }
  }

  return { ok: true, px, cm, cmPerPx: cm / px, pxPerCm: px / cm }
}

/**
 * 量一条边。返回原始像素长、换算出的厘米、以及相对基准单位的倍数。
 *
 * `ratio` 走的是像素比（`px / refPx`），和走厘米算出来的是同一个数 ——
 * 这正是文件头说的「卡尺读数会约掉」。这里显式写成像素比，省掉一次
 * 除法相乘，也让「比例不受卡尺影响」在代码里看得见。
 */
export function measureSegment(scale, a, b) {
  if (!scale?.ok) return { ...EMPTY, reasonCode: scale?.reasonCode ?? 'NO_SCALE', reason: scale?.reason ?? '还没有比例尺。' }
  const px = distPx(a, b)
  if (px === null) return { ...EMPTY, reasonCode: 'INCOMPLETE', reason: '这条边还没标完（要两个点）。' }
  // 相对参考边判误点，不跟绝对像素数比 —— 理由见 MIN_MARK_FRACTION
  if (px < scale.px * MIN_MARK_FRACTION) {
    return {
      ok: false,
      reasonCode: 'TOO_SHORT',
      px,
      reason: `这条边只有参考边的 ${((px / scale.px) * 100).toFixed(1)}%，短得不像在标一条边 —— 重点一次。`,
    }
  }
  return { ok: true, px, cm: px * scale.cmPerPx, ratio: px / scale.px }
}

/**
 * 把一组标注归纳成「每个形状、每条边名，抽到了哪些样本」。
 *
 * 同一条边名标了多次（正方形有四条边，随便标两条）就取**平均**，
 * 同时报出**离散度** —— 一个数骗人的时候，散度是唯一能提醒你的东西。
 */
export function summarizeMarks({ scale, marks = [] }) {
  const byShape = {}
  const problems = []

  for (const [idx, mark] of marks.entries()) {
    const m = measureSegment(scale, mark?.a, mark?.b)
    if (!m.ok) {
      problems.push({ index: idx, shapeId: mark?.shapeId ?? null, edgeLabel: mark?.edgeLabel ?? null, ...m })
      continue
    }
    const sid = mark.shapeId
    const label = mark.edgeLabel
    byShape[sid] ??= {}
    byShape[sid][label] ??= { samples: [] }
    byShape[sid][label].samples.push({ px: m.px, cm: m.cm, ratio: m.ratio })
  }

  for (const byLabel of Object.values(byShape)) {
    for (const entry of Object.values(byLabel)) {
      const ratios = entry.samples.map((s) => s.ratio)
      const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length
      const lo = Math.min(...ratios)
      const hi = Math.max(...ratios)
      entry.ratio = mean
      entry.n = ratios.length
      entry.min = lo
      entry.max = hi
      // 只有一个样本时散度无从谈起，是 0 而不是「很准」—— 页面上要分开说
      entry.spreadPct = ratios.length > 1 && mean > 0 ? ((hi - lo) / mean) * 100 : 0
      entry.consistent = ratios.length < 2 || entry.spreadPct <= SPREAD_WARN_PCT
    }
  }

  return { ok: problems.length === 0, byShape, problems, sampledLabels: countLabels(byShape) }
}

function countLabels(byShape) {
  let n = 0
  for (const byLabel of Object.values(byShape)) n += Object.keys(byLabel).length
  return n
}

/**
 * 把测量结果写回形状定义。
 *
 * **只改 `edges[].ratio` 和 `unit`，不碰 `areaRatio` / `tCount`。**
 * 面积没法从几条边长反推出来（同样的三条边可以是完全不同的三角形），
 * 而这两个字段说的是「这个形状占几格」，属于形状定义本身，不是量出来的尺寸。
 * 硬凑一个数出来，等于用一个猜的数字覆盖一个已知的数字。
 *
 * 没有标到的边名保持原样，并在 `untouched` 里列出来 —— 悄悄留一半默认值
 * 是最坏的结果：shapes.json 看起来是实测过的，其实一半是占位数据。
 */
export function applyMeasurements({ shapes, unit, summary }) {
  const next = []
  const applied = []
  const untouched = []

  for (const shape of shapes) {
    const measured = summary.byShape?.[shape.id]
    if (!measured) {
      untouched.push({ shapeId: shape.id, name: shape.name, labels: shape.edges.map((e) => e.label) })
      next.push(shape)
      continue
    }

    const edges = shape.edges.map((edge) => {
      const hit = measured[edge.label]
      if (!hit) return edge
      return { ...edge, ratio: round(hit.ratio, 4) }
    })

    // 「写进去的是哪些边」—— 判据是**标到没有**，不是**值变了没有**。
    // 量出来正好等于默认值（正方形就是 1.0）太常见了，按「变了没有」判会
    // 让确认框里出现「正方形：」后面空空如也 —— 用户以为这条没被算，其实
    // 算了，只是结果跟原值一样。要报的是「这次要盖哪几个字段」，不是 diff。
    const done = shape.edges.filter((e) => measured[e.label]).map((e) => e.label)
    const missing = shape.edges.filter((e) => !measured[e.label]).map((e) => e.label)
    if (done.length) applied.push({ shapeId: shape.id, name: shape.name, labels: done, samples: labelStats(measured, done) })
    if (missing.length) untouched.push({ shapeId: shape.id, name: shape.name, labels: missing })

    next.push({ ...shape, edges })
  }

  return { shapes: next, unit: Number(unit), applied, untouched }
}

function labelStats(measured, labels) {
  const out = {}
  for (const label of labels) {
    const hit = measured[label]
    out[label] = { ratio: round(hit.ratio, 4), n: hit.n, spreadPct: round(hit.spreadPct, 2) }
  }
  return out
}

function round(n, digits) {
  const f = 10 ** digits
  return Math.round(n * f) / f
}
