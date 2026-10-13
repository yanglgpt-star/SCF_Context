/**
 * 画布编辑的纯函数 —— 每个函数对应一个用户动作，都返回**新的 work**。
 *
 * 为什么不建方案里提到的 `normalize.js` / `migrate.js` 而是这个文件：编辑需要的是
 * 「一个动作一个函数」，而不是又一层归一化。归一化本来就是 `normalizeWork` 的活，
 * 每个动作在返回前都过它一遍，所以「存下来的 JSON 永远合法」只有一处保证。
 *
 * 三条约定：
 *
 * 1. **落位被占住就拒绝，不挪到最近的空位。** 用户在画布上点哪儿就该在哪儿；
 *    悄悄挪走比拒绝更让人困惑 —— 他不知道自己的点击为什么会跑到别处去。
 *
 * 2. **`canPlace` 与 `analyzeWork` 报同一套码**（`TILE_INVALID`）。编辑器先算一遍
 *    是为了当场给反馈，`analyzeWork` 在保存时再从原子独立复算一遍。这个
 *    「先算 + 独立复算」的验证结构是项目已有的做法，两者由构造保证一致，
 *    而 `claimMap` 是它们之间唯一的桥 —— 「work → 原子归属」全项目只此一处实现。
 *
 * 3. **`stepsStale` 只在会改变出图的动作上置位**：放/删/转/改色都会让已生成的
 *    步骤图与 work 对不上。**锁定不置位** —— 锁只加一个画布上的角标（角标不进导出，
 *    见 `MosaicCanvas/Tile.jsx`），片的位置一片没动，步骤图仍然是对的。为了「改了
 *    个东西」就一律置位，会把重新生成步骤变成用户的日常负担。
 */
import { ROTATIONS, SHAPES, atomsAt, normalizeRot } from '../geometry/shapes.js'
import { createGrid } from '../geometry/grid.js'
import { TILE_INVALID, TILE_SOURCE, normalizeWork, tileAtoms } from './work.js'

/** 位置与朝向派生的 id —— 与求解器那套规则一致，重解之后同一处的 id 不变 */
export function tileIdOf(shape, rot, i, j) {
  return `${shape}-${normalizeRot(shape, rot)}-${i}-${j}`
}

/**
 * 原子 → 占着它的片 id。**work → 原子归属的唯一转换点**。
 *
 * 一原子多主时取**第一个**占它的片 —— 与 `analyzeWork` 里那份 `claimed` 判定
 * 同一规则。手工造出的重叠 work 两边才会都读到同一片，于是报出同一组重叠对。
 */
export function claimMap(atoms, tiles) {
  const map = new Map()
  atoms.forEach((list, k) => {
    if (!list) return
    const id = tiles[k]?.id
    if (id === undefined) return
    for (const t of list) if (!map.has(t)) map.set(t, id)
  })
  return map
}

/** 有 id 的片拿去当人话读 —— 报错时只列 id，用户得自己对回画布上哪一片 */
const shortList = (ids, max = 4) =>
  `${ids.slice(0, max).join('、')}${ids.length > max ? ` 等 ${ids.length} 片` : ''}`

/**
 * 这一放行不行。**不抛异常** —— 调用方给的是画布上点出来的坐标，但工具切换、
 * 画布外点击都能凑出越界，那是正常操作，不是程序 bug。
 *
 * @param {object} grid      与 work 同一张 grid
 * @param {object} spec      { shape, rot, i, j }
 * @param {Map} claimed      claimMap 的结果
 * @param {object} [opts]
 * @param {string} [opts.ignoreId]  忽略这一片的占用（原地旋转时自己挡自己）
 * @returns {{ ok, reason, message, atoms, blockedBy, rot }}
 */
export function canPlace(grid, spec, claimed, { ignoreId = null } = {}) {
  const { shape, i, j } = spec

  if (!SHAPES[shape]) {
    return {
      ok: false,
      reason: TILE_INVALID.UNKNOWN_SHAPE,
      message: `不认识的形状「${shape}」，可用的只有 ${Object.keys(SHAPES).join(' / ')}`,
      atoms: null,
      blockedBy: [],
      rot: 0,
    }
  }

  const rot = normalizeRot(shape, spec.rot)
  const atoms = atomsAt(grid, shape, rot, i, j)
  if (!atoms) {
    return {
      ok: false,
      reason: TILE_INVALID.OUT_OF_BOUNDS,
      message: `${SHAPES[shape].name}放在 (${i}, ${j}) 会超出画布 ${grid.cols}×${grid.rows}`,
      atoms: null,
      blockedBy: [],
      rot,
    }
  }

  const blockedBy = []
  for (const t of atoms) {
    const owner = claimed.get(t)
    if (owner !== undefined && owner !== ignoreId && !blockedBy.includes(owner)) blockedBy.push(owner)
  }
  if (blockedBy.length) {
    return {
      ok: false,
      reason: TILE_INVALID.OVERLAP,
      message: `这一格被 ${shortList(blockedBy)} 占住了，先挪开或删掉它`,
      atoms,
      blockedBy,
      rot,
    }
  }

  return { ok: true, reason: null, message: null, atoms, blockedBy: [], rot }
}

/** work → { grid, atoms, claimed }。每个动作都要这三样，抽一次 */
function frame(work) {
  const grid = createGrid(work.canvas.cols, work.canvas.rows)
  const atoms = tileAtoms(work, grid)
  return { grid, atoms, claimed: claimMap(atoms, work.tiles) }
}

const fail = (work, reason, message) => ({ ok: false, reason, message, work })
const done = (work, extra) => ({ ok: true, reason: null, message: null, work, ...extra })

/**
 * 放一片。`spec.color` 缺省是 null（未指定色）—— 手动放的片不跑配色，
 * 用户想让它有色就自己选，或者重解一次让 `assignColors` 统一配。
 */
export function placeTile(work, spec) {
  const w = normalizeWork(work)
  const { grid, claimed } = frame(w)
  const check = canPlace(grid, spec, claimed)
  if (!check.ok) return fail(w, check.reason, check.message)

  const id = tileIdOf(spec.shape, check.rot, spec.i, spec.j)
  // id 是位置派生的，正常情况下上面的重叠检查已经拦住了同 id。但 work.json 是用户
  // 能直接改的，手改过的文件里可以存在「id 写着 SQ-0-3-3、实际放在 (0,0)」的片，
  // 于是这里能撞上一个位置完全不同的同名片。放进去就是 DUP_ID，不如当场拒绝。
  if (w.tiles.some((t) => t.id === id)) {
    return fail(w, TILE_INVALID.OVERLAP, `已经有一片叫 ${id} 了（片 id 由形状、朝向、落点拼成）`)
  }

  const tile = {
    id,
    shape: spec.shape,
    rot: check.rot,
    i: spec.i,
    j: spec.j,
    color: typeof spec.color === 'string' && spec.color ? spec.color : null,
    locked: Boolean(spec.locked),
    source: TILE_SOURCE.MANUAL,
  }
  return done(normalizeWork({ ...w, tiles: [...w.tiles, tile], stepsStale: true }), { id })
}

export function removeTile(work, tileId) {
  const w = normalizeWork(work)
  if (!w.tiles.some((t) => t.id === tileId)) return fail(w, 'NOT_FOUND', `画布上没有 ${tileId} 这一片`)
  return done(normalizeWork({ ...w, tiles: w.tiles.filter((t) => t.id !== tileId), stepsStale: true }))
}

/**
 * 锁定 / 解锁。**不置 `stepsStale`** —— 理由见文件头第 3 条。
 */
export function toggleLock(work, tileId) {
  const w = normalizeWork(work)
  const t = w.tiles.find((x) => x.id === tileId)
  if (!t) return fail(w, 'NOT_FOUND', `画布上没有 ${tileId} 这一片`)
  const locked = !t.locked
  return done(
    normalizeWork({ ...w, tiles: w.tiles.map((x) => (x.id === tileId ? { ...x, locked } : x)) }),
    { locked },
  )
}

/**
 * 原地转到下一个朝向。
 *
 * **旋转会改 id**（id 里带着朝向），所以返回值里**必须**带新 id 让调用方重设选中态 ——
 * 不带的后果是「一转就丢选中」，而且丢得静悄悄：画布看起来正常，只是高亮没了。
 *
 * 转完要重新查一遍重叠：`TRI-R` 四个朝向都待在同一格，但 `RECT` 的 0°/90° 是 2×1
 * 与 1×2，原地一转就可能压到邻片。
 */
export function rotateTile(work, tileId) {
  const w = normalizeWork(work)
  const t = w.tiles.find((x) => x.id === tileId)
  if (!t) return fail(w, 'NOT_FOUND', `画布上没有 ${tileId} 这一片`)

  const allowed = ROTATIONS[t.shape] ?? []
  if (allowed.length <= 1) return fail(w, 'NO_ROTATION', `${SHAPES[t.shape]?.name ?? t.shape}只有一种朝向`)

  const rot = allowed[(allowed.indexOf(t.rot) + 1) % allowed.length]
  const { grid, claimed } = frame(w)
  const check = canPlace(grid, { shape: t.shape, rot, i: t.i, j: t.j }, claimed, { ignoreId: tileId })
  if (!check.ok) return fail(w, check.reason, `转过去会压住别的片：${check.message}`)

  const id = tileIdOf(t.shape, rot, t.i, t.j)
  if (w.tiles.some((x) => x.id === id)) return fail(w, TILE_INVALID.OVERLAP, `转过去会和 ${id} 撞上同一个 id`)

  return done(
    normalizeWork({
      ...w,
      tiles: w.tiles.map((x) => (x.id === tileId ? { ...x, id, rot } : x)),
      stepsStale: true,
    }),
    { id, rot },
  )
}

/** 改一片的颜色。颜色不在色板里也照收 —— 那只是 `analyzeWork` 的一条警告 */
export function setTileColor(work, tileId, color) {
  const w = normalizeWork(work)
  if (!w.tiles.some((t) => t.id === tileId)) return fail(w, 'NOT_FOUND', `画布上没有 ${tileId} 这一片`)
  const next = typeof color === 'string' && color ? color : null
  return done(
    normalizeWork({
      ...w,
      tiles: w.tiles.map((t) => (t.id === tileId ? { ...t, color: next } : t)),
      // 改色要置位：步骤图是带颜色的，改一片的颜色那几张图就对不上了
      stepsStale: true,
    }),
  )
}
