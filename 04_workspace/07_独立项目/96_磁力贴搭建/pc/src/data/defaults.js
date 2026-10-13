/**
 * 标准通用磁力片套装的默认值 —— 占位数据，等用户卡尺实测后覆盖。
 *
 * 几何约定（详见 ../../02-可拼贴性求解引擎.md）：
 *   a = 正方形边长，是全套的基准单位
 *   edges[].ratio 是「该边长度 / a」，实际尺寸 = ratio × unit
 *
 * family 决定能否参与平面拼贴求解：
 *   right        直角族（45°/90°）—— 平面拼贴只用这一族
 *   equilateral  等边族（60°/120°）—— 留给立体搭建，平面无法共边混拼
 *   arc          含圆弧 —— 一期不支持
 *
 * tCount 是「占几个 T」，T = 单位直角三角形面积 = 0.5 a²。这是给人看的面积单位，
 * 跟 core 内部求解用的「象限原子」不是一个东西（1 格 = 4 原子 = 2 T）。
 * 平面拼贴用不上的形状填 null。
 */

export const SCHEMA_VERSION = 1

/** 市面常见 6 / 7 / 7.5 cm，默认取 7.5，必须以卡尺实测为准 */
export const DEFAULT_UNIT = 7.5

export const FAMILY_LABEL = {
  right: '直角族',
  equilateral: '等边族',
  arc: '弧形',
}

export const FAMILY_HINT = {
  right: '45°/90° 边方向，可参与平面共边拼贴',
  equilateral: '60°/120° 边方向，与直角族无法平面共边，留给立体搭建',
  arc: '含圆弧边，一期不做平面拼贴',
}

export const DEFAULT_SHAPES = [
  {
    id: 'SQ',
    name: '正方形',
    en: 'Square',
    family: 'right',
    planar: true,
    edges: [{ label: '边长', ratio: 1, count: 4 }],
    areaRatio: 1,
    tCount: 2,
  },
  {
    id: 'TRI-R',
    name: '等腰直角三角形',
    en: 'Right Triangle',
    family: 'right',
    planar: true,
    edges: [
      { label: '直角边', ratio: 1, count: 2 },
      { label: '斜边', ratio: Math.SQRT2, count: 1 },
    ],
    areaRatio: 0.5,
    tCount: 1,
  },
  {
    id: 'RECT',
    name: '长方形',
    en: 'Rectangle',
    family: 'right',
    planar: true,
    edges: [
      { label: '长边', ratio: 2, count: 2 },
      { label: '短边', ratio: 1, count: 2 },
    ],
    areaRatio: 2,
    tCount: 4,
  },
  {
    id: 'TRI-E',
    name: '等边三角形',
    en: 'Equilateral Triangle',
    family: 'equilateral',
    planar: false,
    edges: [{ label: '边长', ratio: 1, count: 3 }],
    areaRatio: 0.433,
    tCount: null,
  },
  {
    id: 'SECTOR',
    name: '扇形（1/4 圆）',
    en: 'Quarter Circle',
    family: 'arc',
    planar: false,
    edges: [
      { label: '半径', ratio: 1, count: 2 },
      { label: '弧', ratio: Math.PI / 2, count: 1 },
    ],
    areaRatio: 0.785,
    tCount: null,
  },
  {
    id: 'SEMI',
    name: '半圆',
    en: 'Semicircle',
    family: 'arc',
    planar: false,
    edges: [
      { label: '直径', ratio: 1, count: 1 },
      { label: '弧', ratio: Math.PI / 2, count: 1 },
    ],
    areaRatio: 0.393,
    tCount: null,
  },
]

export const DEFAULT_STOCK_SOURCE = '标准通用套装默认值（非实测，待卡尺核对）'

/** 库存：形状 × 数量 + 该形状有哪些颜色 */
export const DEFAULT_STOCK = [
  { shapeId: 'SQ', count: 24, colors: ['红', '橙', '黄', '绿', '蓝'] },
  { shapeId: 'TRI-E', count: 20, colors: ['红', '橙', '黄', '绿', '蓝'] },
  { shapeId: 'TRI-R', count: 16, colors: ['红', '橙', '黄', '绿', '蓝'] },
  { shapeId: 'RECT', count: 8, colors: ['红', '橙', '黄', '绿', '蓝'] },
  { shapeId: 'SECTOR', count: 4, colors: ['红', '黄', '蓝'] },
  { shapeId: 'SEMI', count: 4, colors: ['橙', '绿'] },
]

/**
 * 边长的展示文本：把 ratio × unit 换算成实际厘米。
 * 刻意不显示「外接尺寸」——弧形的外接矩形要靠真实几何算，
 * 拿 ratio 的最大/最小值凑出来的数是错的，宁可先不给。
 */
export function formatEdgeLengths(shape, unit) {
  return shape.edges
    .map((edge) => {
      const cm = `${(edge.ratio * unit).toFixed(1)}cm`
      return edge.count > 1 ? `${edge.label} ${cm}，${edge.count} 条` : `${edge.label} ${cm}`
    })
    .join('　·　')
}

export function buildDefaultShapesFile() {
  return {
    schemaVersion: SCHEMA_VERSION,
    unit: DEFAULT_UNIT,
    unitLabel: '基准单位 a = 正方形边长（cm）',
    source: DEFAULT_STOCK_SOURCE,
    updatedAt: new Date().toISOString(),
    shapes: DEFAULT_SHAPES,
  }
}

export function buildDefaultStockFile() {
  return {
    schemaVersion: SCHEMA_VERSION,
    source: DEFAULT_STOCK_SOURCE,
    updatedAt: new Date().toISOString(),
    items: DEFAULT_STOCK,
  }
}
