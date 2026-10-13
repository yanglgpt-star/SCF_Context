/**
 * work.json —— 一份作品的全部数据，也是画布、步骤图、小程序三者的共同输入。
 *
 * 校验在这里做，因为**手工编辑能造出求解器造不出的非法状态**：
 * 重叠、越界、用了不存在的形状。所有编辑在 commit 时过一遍这里，
 * 存下来的 JSON 就永远合法。
 *
 * 导出的一律是 JSON 原生类型（对象/数组/字符串/数字/布尔/null），
 * 不放 Map / Set / Date —— 这是以后能整体搬去 Python 的前提。
 */
import { DEFAULT_CANVAS, SCHEMA_VERSION } from '../config.js'
import { createGrid } from '../geometry/grid.js'
import { SHAPES, atomsAt, bbox, normalizeRot } from '../geometry/shapes.js'
import { buildAdjacency, connectedComponents } from '../geometry/adjacency.js'
import { isKnownColor } from './palette.js'

export const TILE_SOURCE = { SOLVER: 'solver', MANUAL: 'manual' }

/**
 * 一片放不下去的三种硬原因。`analyzeWork`、`solver/locked.js`、`model/edit.js`
 * **共用这一份** —— 三处各写一套字面量的话，页面就得认识三套码才能把同一件事
 * 说圆，而三套码的取值迟早会漂。
 *
 * 三处的粒度不同（这里按批报、locked 按片报、edit 按一次尝试报），但码是同一套。
 */
export const TILE_INVALID = {
  UNKNOWN_SHAPE: 'UNKNOWN_SHAPE',
  OUT_OF_BOUNDS: 'OUT_OF_BOUNDS',
  OVERLAP: 'OVERLAP',
}

/** 归一化时用，形状不认识也不能抛 —— 一份坏 JSON 不该让整页白屏 */
function safeRot(shape, rot) {
  try {
    return normalizeRot(shape, rot)
  } catch {
    return 0
  }
}

/**
 * 轮廓：吸附、`translateToOrigin` 之后的多边形，形如 `[[x, y], ...]`，单位是格。
 *
 * **校验不过就整个丢掉，不留半截数组。** 留半截的话，`solveContour` 会拿它去栅格化
 * 然后报一个「多边形自交」之类的错，跟真正的病根（这份作品是 M6 之前产的、根本没有
 * 轮廓）对不上。丢掉之后 Build 页走「这份作品没有轮廓」那条分支，把话说清楚。
 *
 * 坐标刻意**不取整**：吸附后的顶点本来就可以落在半格上（`nub` 的顶点就在 0.5）。
 */
function safeContour(raw) {
  if (!Array.isArray(raw) || raw.length < 3) return null
  const out = []
  for (const p of raw) {
    if (!Array.isArray(p) || p.length < 2) return null
    const x = Number(p[0])
    const y = Number(p[1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    out.push([x, y])
  }
  return out
}

/**
 * 一步。
 *
 * `tileIds` **刻意不校验存在性** —— 指向已经不存在的片正是 `stepsStaleReason` 要检测的
 * 情形，在这里过滤掉的话，那个诊断就永远看不到东西了。存在的校验是 `analyzeWork` 的
 * **警告**（不是错误）：一份过期的步骤不该让作品存不下去，它只是过期了。
 */
function normalizeStep(s, k) {
  const src = s && typeof s === 'object' ? s : {}
  const tileIds = (Array.isArray(src.tileIds) ? src.tileIds : []).filter(
    (id) => typeof id === 'string' && id,
  )
  const r3 = (v) => Number(v.toFixed(3))
  return {
    no: Number.isFinite(Number(src.no)) && Number(src.no) >= 1 ? Math.floor(Number(src.no)) : k + 1,
    tileIds,
    caption: typeof src.caption === 'string' ? src.caption : '',
    progress: {
      done: Math.max(0, Math.floor(Number(src.progress?.done) || 0)),
      total: Math.max(0, Math.floor(Number(src.progress?.total) || 0)),
    },
    camera: {
      cx: Number.isFinite(Number(src.camera?.cx)) ? r3(Number(src.camera.cx)) : 0,
      cy: Number.isFinite(Number(src.camera?.cy)) ? r3(Number(src.camera.cy)) : 0,
      zoom: Number(src.camera?.zoom) > 0 ? r3(Number(src.camera.zoom)) : 1,
    },
  }
}

/**
 * 补默认值 + 类型纠正。幂等：normalizeWork(normalizeWork(x)) 等于 normalizeWork(x)。
 * 不负责判断合法性 —— 那是 validateWork 的事，两件事分开，UI 才能
 * 「先修好能修的，再把修不了的报出来」。
 */
export function normalizeWork(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}

  const canvas = {
    unit: Number(src.canvas?.unit) > 0 ? Number(src.canvas.unit) : DEFAULT_CANVAS.unit,
    cols: Math.max(1, Math.floor(Number(src.canvas?.cols) || DEFAULT_CANVAS.cols)),
    rows: Math.max(1, Math.floor(Number(src.canvas?.rows) || DEFAULT_CANVAS.rows)),
    background: src.canvas?.background ?? DEFAULT_CANVAS.background,
  }

  const tiles = (Array.isArray(src.tiles) ? src.tiles : [])
    .filter((t) => t && typeof t.shape === 'string')
    .map((t, k) => ({
      id: typeof t.id === 'string' && t.id ? t.id : `t${String(k + 1).padStart(2, '0')}`,
      shape: t.shape,
      i: Math.round(Number(t.i) || 0),
      j: Math.round(Number(t.j) || 0),
      rot: safeRot(t.shape, t.rot),
      color: typeof t.color === 'string' && t.color ? t.color : null,
      locked: Boolean(t.locked),
      source: t.source === TILE_SOURCE.MANUAL ? TILE_SOURCE.MANUAL : TILE_SOURCE.SOLVER,
    }))

  // solution 整体透传（各字段是哪个链路写的不归这儿管），只有 contour 需要过一遍
  // 类型校验 —— 它是重解时唯一会被喂回求解器的字段，见 safeContour
  const solution = src.solution && typeof src.solution === 'object' ? { ...src.solution } : {}
  const contour = safeContour(solution.contour)
  if (contour) solution.contour = contour
  else delete solution.contour

  return {
    workId: src.workId ?? 'W-untitled',
    schemaVersion: SCHEMA_VERSION,
    version: Math.max(1, Math.floor(Number(src.version) || 1)),
    meta: {
      title: src.meta?.title ?? '未命名',
      theme: src.meta?.theme ?? '',
      ageBand: src.meta?.ageBand ?? '',
      tags: Array.isArray(src.meta?.tags) ? src.meta.tags : [],
      createdAt: src.meta?.createdAt ?? '',
    },
    canvas,
    palette: src.palette && typeof src.palette === 'object' ? { ...src.palette } : {},
    tiles,
    steps: (Array.isArray(src.steps) ? src.steps : []).map(normalizeStep),
    solution,
    assets: src.assets && typeof src.assets === 'object' ? { ...src.assets } : {},
    stepsStale: Boolean(src.stepsStale),
  }
}

/** 空作品，新建时用 */
export function createWork(patch = {}) {
  return normalizeWork({
    workId: patch.workId ?? `W-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-001`,
    meta: { title: '未命名', createdAt: new Date().toISOString().slice(0, 10), ...patch.meta },
    canvas: patch.canvas,
    tiles: patch.tiles ?? [],
    ...patch,
  })
}

/**
 * 每片占的原子索引。越界或形状不认识的片对应的位置是 null，
 * 校验和渲染都靠这个区分「放不下」和「没放」。
 */
export function tileAtoms(work, grid) {
  const g = grid ?? createGrid(work.canvas.cols, work.canvas.rows)
  return work.tiles.map((t) => atomsAt(g, t.shape, t.rot, t.i, t.j))
}

/** 统计用量：形状、颜色各用了几片 */
export function usage(work) {
  const shapeUsage = {}
  const colorUsage = {}
  for (const t of work.tiles) {
    shapeUsage[t.shape] = (shapeUsage[t.shape] ?? 0) + 1
    const key = t.color ?? '未指定'
    colorUsage[key] = (colorUsage[key] ?? 0) + 1
  }
  return { shapeUsage, colorUsage }
}

/**
 * 步骤里有没有指向已经不存在的片的引用。
 *
 * **这是诊断，不是「要不要重新拆解」的判据 —— 那个判据是 `stepsStale` 字段。**
 * 两者分工必须写清楚，否则后来人会以为可以省掉字段：
 *
 * `stepsStale` 由每个改片的动作置位，宁可多标不可漏标。派生检查有一个真实漏洞 ——
 * 片 id 是位置派生的（`${shape}-${rot}-${i}-${j}`），所以「把 A 从 (0,0) 挪到 (5,5)、
 * 同时把 B 从 (5,5) 挪到 (0,0)」之后，步骤里引用的 id **仍然全部解析得到**，
 * 可它们描述的是另一套摆法。派生检查漏掉这种情况，而编辑动作自己置位不会漏。
 *
 * 这里能回答的是另一个问题：「具体是哪几个 id 悬空了」—— 用来在界面上把话说清楚。
 */
export function stepsStaleReason(work) {
  const known = new Set((work.tiles ?? []).map((t) => t.id))
  const missing = []
  for (const s of work.steps ?? []) {
    for (const id of s?.tileIds ?? []) {
      if (!known.has(id) && !missing.includes(id)) missing.push(id)
    }
  }
  return missing.length ? { missing } : null
}

/**
 * 完整校验 + 分析。渲染器和后面的求解器都读这个结果，不各自算一遍。
 *
 * 返回的对象全是 JSON 原生类型，可以直接丢给 UI 或写进报告。
 */
export function analyzeWork(rawWork) {
  const work = normalizeWork(rawWork)
  const grid = createGrid(work.canvas.cols, work.canvas.rows)
  const atoms = tileAtoms(work, grid)

  const errors = []
  const warnings = []

  // ---- 1. id 唯一 ----
  const idSeen = new Set()
  const dupIds = new Set()
  for (const t of work.tiles) {
    if (idSeen.has(t.id)) dupIds.add(t.id)
    idSeen.add(t.id)
  }
  if (dupIds.size) {
    errors.push({ code: 'DUP_ID', message: `片 id 重复：${[...dupIds].join('、')}` })
  }

  // ---- 2/3. 形状已知 与 越界 ----
  // 一趟扫完：atoms[k] === null 有两种原因（形状不认识 / 放不下），
  // 靠 tiles[k].shape 分开，否则一个手滑的形状名会同时报出两条错误，误导排查方向。
  const badShapes = new Set()
  const outside = []
  atoms.forEach((a, k) => {
    if (a !== null) return
    const t = work.tiles[k]
    if (!SHAPES[t.shape]) badShapes.add(t.shape)
    else outside.push(t.id)
  })

  if (badShapes.size) {
    errors.push({
      code: TILE_INVALID.UNKNOWN_SHAPE,
      message: `平面拼贴不认识的形状：${[...badShapes].join('、')}。可用的只有 ${Object.keys(SHAPES).join(' / ')}`,
    })
  }
  if (outside.length) {
    errors.push({
      code: TILE_INVALID.OUT_OF_BOUNDS,
      message: `${outside.length} 片超出画布 ${work.canvas.cols}×${work.canvas.rows}：${outside.slice(0, 6).join('、')}${outside.length > 6 ? ' …' : ''}`,
    })
  }

  // ---- 4. 重叠（靠原子集合判定，不靠包围盒） ----
  const claimed = new Map() // 原子 → 第一个占它的片序号
  const overlapPairs = new Set()
  const overlapAtoms = new Set()
  atoms.forEach((list, k) => {
    if (!list) return
    for (const t of list) {
      const prev = claimed.get(t)
      if (prev === undefined) {
        claimed.set(t, k)
      } else if (prev !== k) {
        overlapPairs.add(prev < k ? `${work.tiles[prev].id}×${work.tiles[k].id}` : `${work.tiles[k].id}×${work.tiles[prev].id}`)
        overlapAtoms.add(t)
      }
    }
  })
  if (overlapPairs.size) {
    errors.push({
      code: TILE_INVALID.OVERLAP,
      message: `${overlapPairs.size} 组片互相重叠：${[...overlapPairs].slice(0, 6).join('、')}${overlapPairs.size > 6 ? ' …' : ''}`,
    })
  }

  // ---- 5. 颜色是否在色板里（只是警告，颜色是软约束） ----
  const badColors = [...new Set(work.tiles.map((t) => t.color).filter((c) => c && !isKnownColor(c)))]
  if (badColors.length) {
    warnings.push({ code: 'UNKNOWN_COLOR', message: `颜色不在色板里：${badColors.join('、')}` })
  }

  // ---- 6. 结构连通 ----
  const validAtoms = atoms.filter((a) => a !== null)
  const adj = buildAdjacency(validAtoms, grid)
  const components = validAtoms.length ? connectedComponents(validAtoms.length, adj) : []
  if (components.length > 1) {
    warnings.push({
      code: 'DISCONNECTED',
      message: `结构分成 ${components.length} 块，互不相连。实物会散架，步骤也无法按共边顺序拆。`,
    })
  }

  // ---- 7. 步骤引用的片还在不在（警告，不是错误）----
  // 过期的步骤不该让作品存不下去 —— 它只是过期了，重新拆一次就好
  const stale = stepsStaleReason(work)
  if (stale) {
    warnings.push({
      code: 'STEPS_STALE',
      message: `步骤里有 ${stale.missing.length} 个片 id 已经不在作品里：${stale.missing.slice(0, 6).join('、')}${stale.missing.length > 6 ? ' …' : ''}。步骤图会缺片，重新拆一次即可。`,
    })
  }

  // ---- 8. 单块画布上放不下的极端情况 ----
  const totalAtoms = validAtoms.reduce((s, a) => s + a.length, 0)
  const filledCells = new Set()
  for (const t of claimed.keys()) filledCells.add(grid.cellOf(t))

  const { shapeUsage, colorUsage } = usage(work)

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    work,
    gridSummary: { cols: grid.cols, rows: grid.rows, cellCount: grid.cellCount },
    stats: {
      tileCount: work.tiles.length,
      stepCount: work.steps.length,
      atomCount: totalAtoms,
      filledCells: filledCells.size,
      // 画布占用率：填了多少格。给「这个造型在画布上占多大」一个直观数
      fillRatio: grid.cellCount > 0 ? filledCells.size / grid.cellCount : 0,
      componentCount: components.length,
      shapeUsage,
      colorUsage,
    },
    // 供渲染器直接复用，不用再算一遍
    atoms,
    components,
  }
}

/**
 * 每片的包围盒（单位坐标），渲染时用来定位和算标签位置。
 * 单独抽出来是因为渲染是热路径，不想每次都重新读 OUTLINES。
 */
export function tileBox(shape, rot, i, j) {
  const { w, h } = bbox(shape, rot)
  return { x: i, y: j, w, h }
}
