import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { fsClient } from '../lib/fsClient'
import {
  DEFAULT_SHAPES,
  DEFAULT_STOCK,
  DEFAULT_STOCK_SOURCE,
  DEFAULT_UNIT,
  SCHEMA_VERSION,
} from '../data/defaults'

const LibraryContext = createContext(null)

const SHAPES_PATH = 'shapes.json'
const STOCK_PATH = 'stock.json'

function initialState() {
  return {
    loading: true,
    error: null,
    notice: null,
    loadedFrom: null, // 'disk' | 'default'
    unit: DEFAULT_UNIT,
    shapes: DEFAULT_SHAPES,
    stock: DEFAULT_STOCK,
    stockSource: DEFAULT_STOCK_SOURCE,
    updatedAt: null,
    dirty: false,
    saving: false,
    savedAt: null,
  }
}

/** 磁盘上的形状文件 → 内存态。缺字段一律补默认值，坏数据不会让页面炸掉 */
function fromShapesFile(file) {
  if (!file || !Array.isArray(file.shapes) || file.shapes.length === 0) return null
  const unit = typeof file.unit === 'number' && file.unit > 0 ? file.unit : DEFAULT_UNIT
  const shapes = file.shapes
    .filter((s) => s && typeof s.id === 'string' && Array.isArray(s.edges))
    .map((s) => ({
      id: s.id,
      name: s.name ?? s.id,
      en: s.en ?? '',
      family: s.family ?? 'right',
      planar: Boolean(s.planar),
      edges: s.edges.map((e) => ({
        label: e.label ?? '边长',
        ratio: Number(e.ratio) || 1,
        count: Number(e.count) || 1,
      })),
      areaRatio: Number(s.areaRatio) || 0,
      // 老文件里这个字段叫 atomCount，那时「原子」指的是半格 T。
      // M2 引入真正的象限原子后改了名，这里兼容读一次。
      tCount: typeof (s.tCount ?? s.atomCount) === 'number' ? (s.tCount ?? s.atomCount) : null,
    }))
  if (shapes.length === 0) return null
  return { unit, shapes, source: file.source ?? '', updatedAt: file.updatedAt ?? null }
}

function fromStockFile(file) {
  if (!file || !Array.isArray(file.items)) return null
  return {
    stock: file.items
      .filter((it) => it && typeof it.shapeId === 'string')
      .map((it) => ({
        shapeId: it.shapeId,
        count: Math.max(0, Math.floor(Number(it.count) || 0)),
        colors: Array.isArray(it.colors) ? it.colors : [],
      })),
    source: file.source ?? DEFAULT_STOCK_SOURCE,
    updatedAt: file.updatedAt ?? null,
  }
}

function toShapesFile(state) {
  return {
    schemaVersion: SCHEMA_VERSION,
    unit: state.unit,
    unitLabel: '基准单位 a = 正方形边长（cm）',
    source: state.stockSource,
    updatedAt: new Date().toISOString(),
    shapes: state.shapes,
  }
}

function toStockFile(state) {
  return {
    schemaVersion: SCHEMA_VERSION,
    source: state.stockSource,
    updatedAt: new Date().toISOString(),
    items: state.stock,
  }
}

export function LibraryProvider({ children }) {
  const [state, setState] = useState(initialState)
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const [shapesRes, stockRes] = await Promise.all([
        fsClient.read(SHAPES_PATH),
        fsClient.read(STOCK_PATH),
      ])

      const shapesFile = fromShapesFile(shapesRes.data)
      const stockFile = fromStockFile(stockRes.data)

      if (!shapesFile && !stockFile) {
        setState({
          ...initialState(),
          loading: false,
          loadedFrom: 'default',
          notice: 'library/ 下还没有形状数据，已载入标准套装默认值。核对后点「保存到 library」落盘。',
        })
        return
      }

      setState((s) => ({
        ...s,
        loading: false,
        loadedFrom: 'disk',
        notice: null,
        unit: shapesFile?.unit ?? DEFAULT_UNIT,
        shapes: shapesFile?.shapes ?? DEFAULT_SHAPES,
        stock: stockFile?.stock ?? DEFAULT_STOCK,
        stockSource: shapesFile?.source || stockFile?.source || DEFAULT_STOCK_SOURCE,
        updatedAt: shapesFile?.updatedAt ?? stockFile?.updatedAt ?? null,
        dirty: false,
      }))
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err.message,
        loadedFrom: 'default',
      }))
    }
  }, [])

  useEffect(() => {
    // StrictMode 下 effect 会跑两次，这里挡掉重复请求
    if (loadedRef.current) return
    loadedRef.current = true
    load()
  }, [load])

  const touch = useCallback((patch) => {
    setState((s) => ({ ...s, ...patch, dirty: true, savedAt: null }))
  }, [])

  const actions = useMemo(
    () => ({
      reload: load,

      setUnit: (unit) => touch({ unit: Number(unit) > 0 ? Number(unit) : DEFAULT_UNIT }),

      upsertShape: (shape) =>
        setState((s) => {
          const exists = s.shapes.some((x) => x.id === shape.id)
          const shapes = exists
            ? s.shapes.map((x) => (x.id === shape.id ? { ...x, ...shape } : x))
            : [...s.shapes, shape]
          const hasStock = s.stock.some((it) => it.shapeId === shape.id)
          const stock = hasStock
            ? s.stock
            : [...s.stock, { shapeId: shape.id, count: 0, colors: [] }]
          return { ...s, shapes, stock, dirty: true, savedAt: null }
        }),

      removeShape: (id) =>
        setState((s) => ({
          ...s,
          shapes: s.shapes.filter((x) => x.id !== id),
          stock: s.stock.filter((it) => it.shapeId !== id),
          dirty: true,
          savedAt: null,
        })),

      setStockItem: (shapeId, patch) =>
        setState((s) => ({
          ...s,
          stock: s.stock.map((it) => (it.shapeId === shapeId ? { ...it, ...patch } : it)),
          dirty: true,
          savedAt: null,
        })),

      setStockSource: (source) => touch({ stockSource: source }),

      /**
       * 实测录入页用：把量出来的 unit 与 shapes 一次写进 shapes.json。
       *
       * **只写 shapes.json。** 实测改的是尺寸，不是片数 —— stock.json 一个字都不该动。
       *
       * 刻意把要写的东西当参数收进来，而不是读闭包里的 state：`save` 闭包里的 state
       * 是上一次渲染的，同一个事件里「先 upsertShape 再 save()」会写进旧数据。
       * 这里不依赖任何闭包状态，就不存在那个窗口。
       */
      applyMeasured: async ({ shapes, unit, source }) => {
        setState((s) => ({ ...s, shapes, unit, stockSource: source, saving: true, error: null }))
        try {
          const bytes = await fsClient.write(SHAPES_PATH, {
            schemaVersion: SCHEMA_VERSION,
            unit,
            unitLabel: '基准单位 a = 正方形边长（cm）',
            source,
            updatedAt: new Date().toISOString(),
            shapes,
          })
          setState((s) => ({
            ...s,
            saving: false,
            dirty: false,
            loadedFrom: 'disk',
            updatedAt: new Date().toISOString(),
            savedAt: `${bytes} 字节已写入 library/shapes.json`,
          }))
          return { ok: true, bytes }
        } catch (err) {
          setState((s) => ({ ...s, saving: false, error: err.message }))
          return { ok: false, error: err.message }
        }
      },

      resetToDefaults: () =>
        setState((s) => ({
          ...s,
          unit: DEFAULT_UNIT,
          shapes: DEFAULT_SHAPES,
          stock: DEFAULT_STOCK,
          stockSource: DEFAULT_STOCK_SOURCE,
          dirty: true,
          savedAt: null,
          notice: null,
        })),

      save: async () => {
        setState((s) => ({ ...s, saving: true, error: null }))
        try {
          const [shapesBytes, stockBytes] = await Promise.all([
            fsClient.write(SHAPES_PATH, toShapesFile(state)),
            fsClient.write(STOCK_PATH, toStockFile(state)),
          ])
          setState((s) => ({
            ...s,
            saving: false,
            dirty: false,
            loadedFrom: 'disk',
            updatedAt: new Date().toISOString(),
            savedAt: `${shapesBytes + stockBytes} 字节已写入 library/`,
          }))
          return true
        } catch (err) {
          setState((s) => ({ ...s, saving: false, error: err.message }))
          return false
        }
      },
    }),
    [load, touch, state],
  )

  const value = useMemo(() => ({ ...state, ...actions }), [state, actions])

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary() {
  const context = useContext(LibraryContext)
  if (!context) throw new Error('useLibrary 必须在 LibraryProvider 内部使用')
  return context
}

/** 汇总：总片数、形状种类数、可平面拼贴的形状数 */
export function summarize(state) {
  const total = state.stock.reduce((sum, it) => sum + it.count, 0)
  const kinds = state.stock.filter((it) => it.count > 0).length
  const planarShapes = state.shapes.filter((s) => s.planar).length
  return { total, kinds, planarShapes, shapeKinds: state.shapes.length }
}
