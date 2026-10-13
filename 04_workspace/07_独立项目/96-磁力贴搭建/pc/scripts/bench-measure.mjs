/**
 * M5 验收台：实测换算。管的是「标一条已知边能不能把其余尺寸推对」。
 *
 * 这里最要紧的不是某一条用例的具体数字，而是三条**全局性质**，它们对每条用例都跑：
 *
 *   1. 比例与卡尺读数无关 —— 同一个参考边填 7.5 还是填 6.0，推出来的 ratio 必须一模一样。
 *      这条就是整个做法成立的原因（见 src/core/measure/scale.js 文件头）。
 *   2. 比例与照片缩放无关 —— 把所有点等比放大，ratio 不能变。页面把 4000px 的照片
 *      显示成 600px 宽，点击坐标要换回原始像素，这条性质就是那件事的护栏。
 *   3. 失败的样本必须进 problems、不进 byShape —— 半条边混进平均值里，
 *      会得到一个看起来很正常但错的 ratio，比整条失败难查得多。
 *
 *   node scripts/bench-measure.mjs
 *   node scripts/bench-measure.mjs --verbose
 */
import {
  SPREAD_WARN_PCT,
  applyMeasurements,
  distPx,
  makeScale,
  measureSegment,
  summarizeMarks,
} from '../src/core/measure/scale.js'

const argv = process.argv.slice(2)
const verbose = argv.includes('--verbose')

let pass = 0
let fail = 0
const failures = []

function check(name, ok, detail = '') {
  if (ok) {
    pass += 1
    console.log(`  过  ${name}${detail ? `   ${detail}` : ''}`)
  } else {
    fail += 1
    failures.push(name)
    console.log(`  **不过** ${name}${detail ? `   ${detail}` : ''}`)
  }
}

const near = (a, b, tol = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol

/** 一条水平边：从左端点往右 len 像素 */
const seg = (x, y, len) => ({ a: { x, y }, b: { x: x + len, y } })

const SQRT2 = Math.SQRT2

/* -------------------------------------------------------- 全局性质 ------- */

/**
 * 对一组 marks 在「参考边填不同厘米」下比对 ratio。
 * 卡尺读数只该影响 cm 和 unit，绝不该影响 ratio。
 */
function ratiosOf(summary) {
  const out = {}
  for (const [sid, byLabel] of Object.entries(summary.byShape)) {
    for (const [label, entry] of Object.entries(byLabel)) out[`${sid}/${label}`] = entry.ratio
  }
  return out
}

function invariantCaliperIndependence(marks, refPx, cmA, cmB, bad) {
  const sA = summarizeMarks({ scale: makeScale({ ...seg(0, 0, refPx), cm: cmA }), marks })
  const sB = summarizeMarks({ scale: makeScale({ ...seg(0, 0, refPx), cm: cmB }), marks })
  const a = ratiosOf(sA)
  const b = ratiosOf(sB)
  for (const k of Object.keys(a)) {
    if (!near(a[k], b[k], 1e-12)) {
      bad.push(`参考边填 ${cmA}cm 与 ${cmB}cm 时 ${k} 的 ratio 不同：${a[k]} vs ${b[k]}（比例本该与卡尺无关）`)
    }
  }
  // cm 则必须**跟着**变，否则说明卡尺读数根本没起作用
  const cmKey = Object.keys(a)[0]
  if (cmKey) {
    const cm1 = Object.values(sA.byShape)[0]
    const cm2 = Object.values(sB.byShape)[0]
    const l1 = Object.keys(cm1)[0]
    const v1 = cm1[l1].samples[0].cm
    const v2 = cm2[l1].samples[0].cm
    if (near(v1, v2, 1e-12)) bad.push(`参考边从 ${cmA}cm 改到 ${cmB}cm，推出来的厘米数没变（${v1}）—— 卡尺读数被丢了`)
  }
}

/** 把所有坐标等比放大 k 倍，ratio 必须一模一样 */
function invariantScaleIndependence(marks, refPx, k, bad) {
  const ref = { ...seg(10, 20, refPx), cm: 7.5 }
  const base = summarizeMarks({ scale: makeScale(ref), marks })
  const zoom = (p) => ({ x: p.x * k, y: p.y * k })
  const zoomMarks = marks.map((m) => ({
    ...m,
    a: zoom(m.a),
    b: m.b === null ? null : zoom(m.b),
  }))
  const big = summarizeMarks({
    scale: makeScale({ a: zoom(ref.a), b: zoom(ref.b), cm: 7.5 }),
    marks: zoomMarks,
  })
  const a = ratiosOf(base)
  const b = ratiosOf(big)
  for (const key of Object.keys(a)) {
    if (!near(a[key], b[key], 1e-9)) {
      bad.push(`照片放大 ${k} 倍后 ${key} 的 ratio 变了：${a[key]} → ${b[key]}`)
    }
  }
}

function invariantProblemsExcluded(marks, scale, bad) {
  const s = summarizeMarks({ scale, marks })
  // problems 里的下标不能出现在任何样本计数里
  const totalSamples = Object.values(s.byShape)
    .flatMap((byLabel) => Object.values(byLabel))
    .reduce((n, e) => n + e.samples.length, 0)
  const okMarks = marks.filter((m) => measureSegment(scale, m?.a, m?.b).ok).length
  if (totalSamples !== okMarks) {
    bad.push(`样本数 ${totalSamples} 与被接受的标注数 ${okMarks} 不符 —— 有失败样本混进了平均值`)
  }
  for (const p of s.problems) {
    if (!p.reasonCode) bad.push(`problems[${p.index}] 没有 reasonCode`)
  }
}

/* ------------------------------------------------------------ 用例 ------- */

/** 参考边 = 正方形边长 a，200 像素 ↔ 7.5cm（每像素 0.0375cm） */
const REF = { ...seg(100, 100, 200), cm: 7.5 }
const SCALE = makeScale(REF)

const CASES = [
  {
    id: 'square',
    desc: '正方形四条边都标了 → 四条都是 1.0 a',
    marks: [
      { shapeId: 'SQ', edgeLabel: '边长', ...seg(100, 100, 200) },
      { shapeId: 'SQ', edgeLabel: '边长', ...seg(100, 300, 200) },
      { shapeId: 'SQ', edgeLabel: '边长', ...seg(500, 500, 200) },
      { shapeId: 'SQ', edgeLabel: '边长', ...seg(900, 900, 200) },
    ],
    expect: { SQ: { 边长: { ratio: 1, n: 4, consistent: true } } },
  },
  {
    id: 'triangle',
    desc: '等腰直角三角形的直角边 200px、斜边 282.84px → 1.0 与 1.4142 a',
    marks: [
      { shapeId: 'TRI-R', edgeLabel: '直角边', ...seg(0, 0, 200) },
      { shapeId: 'TRI-R', edgeLabel: '斜边', a: { x: 0, y: 0 }, b: { x: 200, y: 200 } },
    ],
    expect: { 'TRI-R': { 直角边: { ratio: 1 }, 斜边: { ratio: SQRT2 } } },
  },
  {
    id: 'rect',
    desc: '长方形长边 400px、短边 200px → 2.0 与 1.0 a',
    marks: [
      { shapeId: 'RECT', edgeLabel: '长边', ...seg(0, 0, 400) },
      { shapeId: 'RECT', edgeLabel: '短边', ...seg(0, 0, 200) },
    ],
    expect: { RECT: { 长边: { ratio: 2 }, 短边: { ratio: 1 } } },
  },
  {
    id: 'cm',
    desc: '换算成厘米：200px 参考边 = 7.5cm 时，300px 的边是 11.25cm',
    marks: [{ shapeId: 'SQ', edgeLabel: '边长', ...seg(0, 0, 300) }],
    expect: { SQ: { 边长: { cm: 11.25, ratio: 1.5 } } },
  },
  {
    id: 'average',
    desc: '同一条边标了四次（200/202/198/201px）→ 取平均，散度小、判为一致',
    marks: [
      { shapeId: 'SQ', edgeLabel: '边长', ...seg(0, 0, 200) },
      { shapeId: 'SQ', edgeLabel: '边长', ...seg(0, 0, 202) },
      { shapeId: 'SQ', edgeLabel: '边长', ...seg(0, 0, 198) },
      { shapeId: 'SQ', edgeLabel: '边长', ...seg(0, 0, 201) },
    ],
    expect: { SQ: { 边长: { ratio: 200.25 / 200, n: 4, consistent: true, min: 0.99, max: 1.01 } } },
  },
  {
    id: 'spread',
    desc: '同一条边标出 200px 与 240px（差 18%）→ 仍然给平均值，但判为不一致',
    marks: [
      { shapeId: 'SQ', edgeLabel: '边长', ...seg(0, 0, 200) },
      { shapeId: 'SQ', edgeLabel: '边长', ...seg(0, 0, 240) },
    ],
    expect: { SQ: { 边长: { ratio: 1.1, n: 2, consistent: false } } },
  },
  {
    id: 'single-sample',
    desc: '只标一次时散度是 0，但那是「没得比」而不是「很准」',
    marks: [{ shapeId: 'SQ', edgeLabel: '边长', ...seg(0, 0, 200) }],
    expect: { SQ: { 边长: { ratio: 1, n: 1, spreadPct: 0, consistent: true } } },
  },
  {
    id: 'bad-mark',
    desc: '一条 4px 的标注落进 problems，不进平均值（否则 1.0 会变成 0.51）',
    marks: [
      { shapeId: 'SQ', edgeLabel: '边长', ...seg(0, 0, 200) },
      { shapeId: 'SQ', edgeLabel: '边长', ...seg(0, 0, 4) },
    ],
    expect: { SQ: { 边长: { ratio: 1, n: 1 } } },
    expectProblem: 'TOO_SHORT',
  },
  {
    id: 'half-mark',
    desc: '只点了一个点的标注报 INCOMPLETE，不参与计算',
    marks: [
      { shapeId: 'SQ', edgeLabel: '边长', ...seg(0, 0, 200) },
      { shapeId: 'SQ', edgeLabel: '边长', a: { x: 5, y: 5 }, b: null },
    ],
    expect: { SQ: { 边长: { ratio: 1, n: 1 } } },
    expectProblem: 'INCOMPLETE',
  },
  {
    // 回归护栏：误点判据曾经是绝对的 8px，于是同一个标注动作在高分辨率照片里
    // 合法、在低分辨率里非法。这里用一条只有 60px 的参考边把相对判据钉住 ——
    // 4px 是它的 6.7%，超过 3%，必须接受（绝对判据会误杀）。
    id: 'small-ref',
    refPx: 60,
    desc: '参考边只有 60px 时，4px 的标注占它 6.7% → 接受（绝对阈值会误杀这条）',
    marks: [
      { shapeId: 'SQ', edgeLabel: '边长', ...seg(0, 0, 60) },
      { shapeId: 'SQ', edgeLabel: '边长', ...seg(0, 0, 4) },
    ],
    expect: { SQ: { 边长: { n: 2 } } },
  },
]

/* ------------------------------------------------------- 参考边本身 ------- */

const REF_CASES = [
  {
    id: 'ref-empty',
    ref: { a: null, b: null, cm: 7.5 },
    reasonCode: 'NO_REF',
  },
  {
    id: 'ref-too-short',
    desc: '参考边只有 3 像素 —— 1 像素的误差会被放大到没法用',
    ref: { ...seg(0, 0, 3), cm: 7.5 },
    reasonCode: 'REF_TOO_SHORT',
  },
  {
    id: 'ref-zero-cm',
    desc: '参考边填 0cm，会算出 Infinity 的比例尺',
    ref: { ...seg(0, 0, 200), cm: 0 },
    reasonCode: 'BAD_CM',
  },
  {
    id: 'ref-nan-cm',
    desc: '参考边填了非数字',
    ref: { ...seg(0, 0, 200), cm: '七点五' },
    reasonCode: 'BAD_CM',
  },
  {
    id: 'ref-ok',
    desc: '200px ↔ 7.5cm → 每像素 0.0375cm',
    ref: { ...seg(0, 0, 200), cm: 7.5 },
    ok: true,
    cmPerPx: 0.0375,
  },
]

/* ----------------------------------------------------------- 入库 --------- */

const SHAPES = [
  {
    id: 'SQ',
    name: '正方形',
    family: 'right',
    planar: true,
    areaRatio: 1,
    tCount: 2,
    edges: [{ label: '边长', ratio: 1, count: 4 }],
  },
  {
    id: 'TRI-R',
    name: '等腰直角三角形',
    family: 'right',
    planar: true,
    areaRatio: 0.5,
    tCount: 1,
    edges: [
      { label: '直角边', ratio: 1, count: 2 },
      { label: '斜边', ratio: 1.4142135623730951, count: 1 },
    ],
  },
  {
    id: 'RECT',
    name: '长方形',
    family: 'right',
    planar: true,
    areaRatio: 2,
    tCount: 4,
    edges: [
      { label: '长边', ratio: 2, count: 2 },
      { label: '短边', ratio: 1, count: 2 },
    ],
  },
]

console.log('='.repeat(74))
console.log('M5 实测换算  参考边 200px ↔ 7.5cm（每像素 0.0375cm）\n')

/* ---- 参考边 ---- */
console.log('参考边建立比例尺')
for (const c of REF_CASES) {
  const s = makeScale(c.ref)
  const bad = []
  if (c.ok) {
    if (!s.ok) bad.push(`期望成功，实际失败：${s.reason}`)
    else if (!near(s.cmPerPx, c.cmPerPx, 1e-12)) bad.push(`cmPerPx 期望 ${c.cmPerPx}，实际 ${s.cmPerPx}`)
  } else {
    if (s.ok) bad.push(`期望失败（${c.reasonCode}），实际成功了`)
    else if (s.reasonCode !== c.reasonCode) bad.push(`reasonCode 期望 ${c.reasonCode}，实际 ${s.reasonCode}`)
    else if (!s.reason || s.reason.length < 8) bad.push('失败理由太短，页面上没法看')
  }
  check(`${c.id}${c.desc ? ` —— ${c.desc}` : ''}`, bad.length === 0, bad.join('；'))
}

/* ---- 每条用例：具体预期 + 三条全局性质 ---- */
console.log('\n标注归纳')
for (const c of CASES) {
  const refPx = c.refPx ?? 200
  const scale = refPx === 200 ? SCALE : makeScale({ ...seg(0, 0, refPx), cm: 7.5 })
  const s = summarizeMarks({ scale, marks: c.marks })
  const bad = []

  for (const [sid, byLabel] of Object.entries(c.expect)) {
    const got = s.byShape[sid]
    if (!got) {
      bad.push(`没抽到形状 ${sid}`)
      continue
    }
    for (const [label, want] of Object.entries(byLabel)) {
      const entry = got[label]
      if (!entry) {
        bad.push(`没抽到 ${sid}/${label}`)
        continue
      }
      if (want.ratio != null && !near(entry.ratio, want.ratio, 1e-6)) {
        bad.push(`${sid}/${label} ratio 期望 ${want.ratio}，实际 ${entry.ratio}`)
      }
      if (want.cm != null && !near(entry.samples[0].cm, want.cm, 1e-9)) {
        bad.push(`${sid}/${label} cm 期望 ${want.cm}，实际 ${entry.samples[0].cm}`)
      }
      if (want.n != null && entry.n !== want.n) bad.push(`${sid}/${label} 样本数期望 ${want.n}，实际 ${entry.n}`)
      if (want.consistent != null && entry.consistent !== want.consistent) {
        bad.push(`${sid}/${label} 一致性期望 ${want.consistent}，实际 ${entry.consistent}（散度 ${entry.spreadPct.toFixed(2)}%，阈值 ${SPREAD_WARN_PCT}%）`)
      }
      if (want.spreadPct != null && !near(entry.spreadPct, want.spreadPct, 1e-9)) {
        bad.push(`${sid}/${label} 散度期望 ${want.spreadPct}，实际 ${entry.spreadPct}`)
      }
      if (want.min != null && !near(entry.min, want.min, 1e-9)) bad.push(`${sid}/${label} min 期望 ${want.min}，实际 ${entry.min}`)
      if (want.max != null && !near(entry.max, want.max, 1e-9)) bad.push(`${sid}/${label} max 期望 ${want.max}，实际 ${entry.max}`)
    }
  }

  if (c.expectProblem) {
    const codes = s.problems.map((p) => p.reasonCode)
    if (!codes.includes(c.expectProblem)) {
      bad.push(`problems 里期望出现 ${c.expectProblem}，实际 [${codes.join(',') || '空'}]`)
    }
  }

  invariantCaliperIndependence(c.marks, refPx, 7.5, 6, bad)
  invariantScaleIndependence(c.marks, refPx, 3, bad)
  invariantProblemsExcluded(c.marks, scale, bad)

  check(`${c.id}${c.desc ? ` —— ${c.desc}` : ''}`, bad.length === 0, bad.join('；'))
  if (verbose) console.log(`        ${JSON.stringify(s.byShape)}`)
}

/* ---- 入库 ---- */
console.log('\n写回形状定义')
{
  const marks = [
    { shapeId: 'SQ', edgeLabel: '边长', ...seg(0, 0, 200) },
    { shapeId: 'SQ', edgeLabel: '边长', ...seg(0, 0, 202) },
    { shapeId: 'TRI-R', edgeLabel: '直角边', ...seg(0, 0, 200) },
    { shapeId: 'TRI-R', edgeLabel: '斜边', a: { x: 0, y: 0 }, b: { x: 200, y: 200 } },
    // RECT 一条都没标
  ]
  const summary = summarizeMarks({ scale: SCALE, marks })
  const res = applyMeasurements({ shapes: SHAPES, unit: 7.5, summary })
  const byId = Object.fromEntries(res.shapes.map((s) => [s.id, s]))
  const bad = []

  if (!near(byId.SQ.edges[0].ratio, 1.005, 1e-6)) bad.push(`SQ 边长 期望 1.005（200/202 的平均），实际 ${byId.SQ.edges[0].ratio}`)
  if (!near(byId['TRI-R'].edges[0].ratio, 1, 1e-9)) bad.push(`TRI-R 直角边 期望 1，实际 ${byId['TRI-R'].edges[0].ratio}`)
  if (!near(byId['TRI-R'].edges[1].ratio, SQRT2, 1e-4)) bad.push(`TRI-R 斜边 期望 ${SQRT2}，实际 ${byId['TRI-R'].edges[1].ratio}`)

  // 面积与占格数说的是「这个形状占几格」，不是量出来的，必须原样不动
  for (const s of res.shapes) {
    const orig = SHAPES.find((x) => x.id === s.id)
    if (s.areaRatio !== orig.areaRatio) bad.push(`${s.id} 的 areaRatio 被改了：${orig.areaRatio} → ${s.areaRatio}`)
    if (s.tCount !== orig.tCount) bad.push(`${s.id} 的 tCount 被改了：${orig.tCount} → ${s.tCount}`)
    if (s.planar !== orig.planar || s.family !== orig.family) bad.push(`${s.id} 的形状定义被改了`)
  }

  // 一条边都没标的形状必须原样返回，并且出现在 untouched 里
  const untouchedIds = res.untouched.map((u) => u.shapeId)
  if (!untouchedIds.includes('RECT')) bad.push('RECT 一条边都没标，却没进 untouched 列表')
  if (byId.RECT.edges[0].ratio !== 2) bad.push(`RECT 没标却被改成了 ${byId.RECT.edges[0].ratio}`)

  // 部分覆盖也要报：只标到了哪些边名
  if (!res.applied.some((a) => a.shapeId === 'SQ' && a.labels.includes('边长'))) bad.push('applied 里没有 SQ/边长')
  if (res.applied.some((a) => a.shapeId === 'RECT')) bad.push('RECT 没标却在 applied 里')
  if (res.unit !== 7.5) bad.push(`unit 期望 7.5，实际 ${res.unit}`)

  check('标到的边写进 ratio，没标的原样保留并列出', bad.length === 0, bad.join('；'))
  if (verbose) console.log(`        ${JSON.stringify({ applied: res.applied, untouched: res.untouched }, null, 2)}`)
}

{
  // 只标到一条边名时，另一条边名必须出现在 untouched 里 ——
  // 「shapes.json 看起来是实测过的，其实一半还是占位数据」是最坏的结果
  const marks = [{ shapeId: 'TRI-R', edgeLabel: '直角边', ...seg(0, 0, 200) }]
  const summary = summarizeMarks({ scale: SCALE, marks })
  const res = applyMeasurements({ shapes: SHAPES, unit: 7.5, summary })
  const tri = res.untouched.find((u) => u.shapeId === 'TRI-R')
  const bad = []
  if (!tri) bad.push('TRI-R 只标了直角边，斜边没标却没进 untouched')
  else if (!tri.labels.includes('斜边')) bad.push(`untouched 里没列出「斜边」：${JSON.stringify(tri.labels)}`)
  // 斜边的旧值（默认的 √2）必须留着，不能被清成 null 或 1
  const after = res.shapes.find((s) => s.id === 'TRI-R')
  if (!near(after.edges[1].ratio, SQRT2, 1e-9)) bad.push(`没标到的斜边被改了：${after.edges[1].ratio}`)
  check('一条边名没标到时，该边名被明确列出来（不留一半默认值还不吭声）', bad.length === 0, bad.join('；'))
}

{
  // 「写进去的是哪些边」的判据是**标到没有**，不是**值变了没有**。
  //
  // 量出来正好落在默认值上太常见了（正方形就是 1.0），所以按 diff 判会漏报：
  // 确认框里出现「正方形：」后面空空如也，用户以为这条边没被算 —— 其实算了，
  // 只是结果跟原值一样。要报的是「这次要盖哪几个字段」，不是 diff。
  const marks = [{ shapeId: 'SQ', edgeLabel: '边长', ...seg(0, 0, 200) }]
  const summary = summarizeMarks({ scale: SCALE, marks })
  const res = applyMeasurements({ shapes: SHAPES, unit: 7.5, summary })
  const sq = res.shapes.find((s) => s.id === 'SQ')
  const applied = res.applied.find((a) => a.shapeId === 'SQ')
  const bad = []

  if (!near(sq.edges[0].ratio, 1, 1e-9)) bad.push(`SQ 边长量出来该是 1，实际 ${sq.edges[0].ratio}`)
  if (sq.edges[0].ratio !== SHAPES.find((s) => s.id === 'SQ').edges[0].ratio) {
    bad.push('用例前提不成立：这条边量出来跟默认值不一样，验不到「值没变也要报」')
  }
  if (!applied) bad.push('SQ 量出来正好等于默认值 1.0，却没进 applied —— 确认框里会显示成「正方形：」空一条')
  else if (!applied.labels.includes('边长')) bad.push(`applied 里没列出「边长」：${JSON.stringify(applied.labels)}`)
  else if (applied.samples['边长'].ratio !== 1) bad.push(`samples 里的 ratio 该是 1，实际 ${applied.samples['边长'].ratio}`)

  check('量出来正好等于默认值时，那条边照样出现在 applied 里（不是按 diff 判的）', bad.length === 0, bad.join('；'))
}

{
  // 标注里的边名在这套形状定义里根本不存在（换了形状定义、旧标注没清干净）。
  // 这种标注一条都不该被写进去，而且形状必须整个进 untouched —— 不能既不
  // 出现在 applied、又不出现在 untouched，那样它就凭空消失了。
  const marks = [{ shapeId: 'SQ', edgeLabel: '不存在的边名', ...seg(0, 0, 200) }]
  const summary = summarizeMarks({ scale: SCALE, marks })
  const res = applyMeasurements({ shapes: SHAPES, unit: 7.5, summary })
  const sq = res.shapes.find((s) => s.id === 'SQ')
  const bad = []

  if (res.applied.some((a) => a.shapeId === 'SQ' && a.labels.length === 0)) bad.push('SQ 进了 applied 但 labels 是空的')
  if (sq.edges[0].ratio !== SHAPES.find((s) => s.id === 'SQ').edges[0].ratio) bad.push(`SQ 边长被改了：${sq.edges[0].ratio}`)
  const u = res.untouched.find((x) => x.shapeId === 'SQ')
  if (!u) bad.push('SQ 的标注全是无效边名，却既不在 applied 也不在 untouched —— 它从两个列表里消失了')
  else if (!u.labels.includes('边长')) bad.push(`untouched 里没列出「边长」：${JSON.stringify(u.labels)}`)

  check('标注的边名对不上任何一条边时，形状进 untouched 而不是凭空消失', bad.length === 0, bad.join('；'))
}

/* ---- distPx 的退化输入 ---- */
console.log('\n工具函数')
{
  const bad = []
  if (distPx({ x: 0, y: 0 }, { x: 3, y: 4 }) !== 5) bad.push('3-4-5 直角三角形算错了')
  if (distPx(null, { x: 0, y: 0 }) !== null) bad.push('null 端点该返回 null')
  if (distPx({ x: 0, y: 0 }, { x: NaN, y: 0 }) !== null) bad.push('NaN 端点该返回 null')
  if (distPx({ x: 0, y: 0 }, { x: 0, y: 0 }) !== 0) bad.push('同一个点该是 0')
  check('distPx 对退化输入返回 null 而不是 NaN', bad.length === 0, bad.join('；'))
}

console.log('\n' + '─'.repeat(74))
console.log(`${pass} 过 / ${fail} 不过`)
if (fail) {
  console.log('不过的：')
  failures.forEach((f) => console.log(`  ${f}`))
}
process.exit(fail ? 1 : 0)
