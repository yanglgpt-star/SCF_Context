/**
 * core 层的唯一门面。UI 只 import 这里，不直接摸 core/ 内部文件。
 *
 * 两条不能破的约定：
 *   1. core/ 不 import React，也不碰 DOM —— 保证以后能整体搬去 Python 后端
 *   2. 跨边界的导出数据只用 JSON 原生类型，不用 class / Map / Set / Date
 *      （内部算法爱用什么用什么，别漏进返回值就行）
 */

/* --- 配置 --- */
export {
  ATOMS_PER_CELL,
  ATOM_EPS,
  AGE_BANDS,
  COVERAGE_EXCELLENT,
  COVERAGE_PASS,
  DEFAULT_CANVAS,
  DIFFICULTY_NORMS,
  DIFFICULTY_WEIGHTS,
  FALLBACK_LABEL,
  FALLBACK_LEVELS,
  FALLBACK_NOTE,
  MAX_STEPS,
  MIN_STEPS,
  OVERFLOW_MAX,
  RASTER_SAMPLES,
  SCHEMA_VERSION,
  SOLVER_ATTEMPTS,
  SOLVER_MAX_NODES,
  SOLVER_TOP_K,
} from './config.js'

/* --- 网格 --- */
export { createGrid, DEFAULT_GRID, QUADRANT_LABEL, QUADRANT_OUTLINE, Q_E, Q_N, Q_S, Q_W } from './geometry/grid.js'

/* --- 形状 --- */
export {
  SHAPES,
  PLANAR_SHAPES,
  ROTATIONS,
  TRI_K_TO_ROT,
  TRI_QUADRANTS,
  TRI_ROT_TO_K,
  atomCount,
  atomsAt,
  bbox,
  footprint,
  normalizeRot,
  outline,
  tCount,
} from './geometry/shapes.js'

/* --- 邻接与连通 --- */
export {
  atomsAdjacent,
  buildAdjacency,
  connectedComponents,
  firstDisconnectedStep,
  isConnected,
  quadrantNeighbors,
} from './geometry/adjacency.js'

/* --- 颜色 --- */
export { COLOR_NAMES, TILE_PALETTE, colorHex, isKnownColor } from './model/palette.js'

/* --- 作品数据 --- */
export {
  TILE_INVALID,
  TILE_SOURCE,
  analyzeWork,
  createWork,
  normalizeWork,
  stepsStaleReason,
  tileAtoms,
  tileBox,
  usage,
} from './model/work.js'

/* --- 画布编辑（M6） --- */
export {
  canPlace,
  claimMap,
  placeTile,
  removeTile,
  rotateTile,
  setTileColor,
  tileIdOf,
  toggleLock,
} from './model/edit.js'

/* --- 库存 --- */
export { stockToShapeMap, stockTotals } from './model/stock.js'

/* --- 轮廓几何 --- */
export {
  bboxOf,
  edgeAngles,
  isGridFriendly,
  isSimple,
  mirrorX,
  perimeter,
  pointInPolygon,
  polygonArea,
  segmentsIntersect,
  signedArea,
  simplify,
  translate,
  translateToOrigin,
} from './contour/polygon.js'

/* --- 栅格化 --- */
export {
  ATOM_FULL,
  ATOM_OUTSIDE,
  ATOM_PARTIAL,
  isTarget,
  rasterize,
  scoreAgainstTarget,
} from './contour/rasterize.js'
export { maskComponents, outlineFromMask } from './contour/mask.js'
export { snapToGrid } from './contour/snap.js'
export { CASES as SNAP_CASES, checkInvariants as checkSnapInvariants } from './contour/snapCases.js'

/* --- 轮廓管线（M4） --- */
export { PROMPT_VERSION, VISION_MARGIN, buildImagePrompt, buildVisionPrompt } from './outline/prompt.js'
export { parseImageResponse, parseChatText, firstJsonObject, parseOutlinePayload } from './outline/parse.js'
export { extractOutline } from './outline/extract.js'

/* --- 求解 --- */
export { solveContour } from './solver/solve.js'
export { acceptSolution, explainFailure, levelSpec } from './solver/strategies.js'
export { CONTOURS, checkContours } from './solver/contours.js'
export { coverCounts, dilateAllow, enumerateCandidates, targetCells } from './solver/candidates.js'
export { LOCK_INVALID, buildLocked, remainingFull } from './solver/locked.js'

/* --- 实测换算（M5） --- */
export {
  MIN_MARK_FRACTION,
  MIN_REF_CM,
  MIN_REF_PX,
  SPREAD_WARN_PCT,
  applyMeasurements,
  distPx,
  makeScale,
  measureSegment,
  summarizeMarks,
} from './measure/scale.js'

/* --- 配色 --- */
export { assignColors } from './color/assign.js'

/* --- 步骤拆解（M7）--- */
export { STRATEGIES, orderTiles, strategiesMeta } from './steps/orderings.js'
export { chooseStrategy, growOrder, planSizes, sequenceTiles } from './steps/sequence.js'

/* --- 报告 --- */
export { buildReport, estimateDifficulty } from './report.js'

/* --- 确定性随机 --- */
export { hashSeed, mulberry32 } from './util/rng.js'
