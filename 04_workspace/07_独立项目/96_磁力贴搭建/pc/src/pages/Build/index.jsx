import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Alert, App, Button, Empty, Input, Segmented, Select, Space, Switch, Tag, Tooltip, Upload } from 'antd'
import {
  DeleteOutlined,
  ExportOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  UnlockOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import MosaicCanvas from '../../components/MosaicCanvas'
import ShapeGlyph from '../../components/ShapeGlyph'
import {
  COLOR_NAMES,
  PLANAR_SHAPES,
  ROTATIONS,
  SHAPES,
  TILE_PALETTE,
  analyzeWork,
  colorHex,
  createWork,
  normalizeRot,
  normalizeWork,
  placeTile,
  removeTile,
  rotateTile,
  setTileColor,
  solveContour,
  stockToShapeMap,
  toggleLock,
} from '../../core/api.js'
import { fsClient } from '../../lib/fsClient'
import { newWorkId } from '../../lib/ids.js'
import { EXT_BY_TYPE, PHOTO_ACCEPT, fileToBase64, photoReject } from '../../lib/photo'
import { listWorks, loadWork, workLabel } from '../../lib/works'
import { useLibrary } from '../../stores/libraryStore'
import fishFixture from '../../mock/work-fish.json'

/**
 * 实物搭建（M6）：画布是文档本身，工具在左、JSON 在右。
 *
 * 这个页面最重要的一个结构决定是 **文档态从「一段文本」变成「一个 work 对象」**。
 * 以前 `committed` 存的是「最后一次解析成功的文本」，画布在它下游 —— 于是每次编辑
 * 都得先序列化成字符串再解析回来，编辑动作没有地方放，撤销更是无从谈起。
 * 现在文档是 `useReducer` 里的一个对象，每个动作直接调 `core/model/edit.js` 的纯函数。
 *
 * 三个附带的好处：
 *   - 撤销/重做只是两个数组，而「按 Delete 删错一片」在这个编辑器里是常态
 *   - 源码模式成了一个**显式模式**，不再是渲染期偷偷同步状态
 *   - 存下去的一定是归一化后的 work，不是用户敲进去的字符串
 *
 * 校验仍然走 `analyzeWork`，而编辑时 `edit.js` 自己先算一遍 —— 这与项目里
 * 「求解器算出方案、`analyzeWork` 独立复算一遍」是同一个 pattern，两者共用一套错误码，
 * 由 `claimMap` 保证「work → 原子归属」只有一处实现。
 */
const HISTORY_MAX = 50

const MODES = [
  { value: 'canvas', label: '画布' },
  { value: 'source', label: '源码' },
]

/** 落点提示语在画布上已经有了（幽灵预览），这里只负责把拒绝理由说出来 */
function reducer(state, action) {
  switch (action.type) {
    case 'LOAD':
      return { ...blank(action.work), tool: state.tool }

    case 'SELECT':
      return { ...state, selectedId: action.id }

    case 'SET_TOOL': {
      const next = { ...state.tool, ...action.patch }
      // 换形状得重算朝向：正方形只有 0°，三角形有四个，长方形两个。
      // 让 normalizeRot 一处决定，页面不自己判「这个朝向还合不合法」。
      next.rot = normalizeRot(next.shape, next.rot)
      return { ...state, tool: next }
    }

    case 'PLACE': {
      const r = placeTile(state.work, { ...action.spec, color: state.tool.color })
      if (!r.ok) return rejected(state, r)
      // 放完自动选中刚放的那片 —— 接着多半就是想转一下或者删掉
      return commit(state, r.work, { selectedId: r.id })
    }

    case 'REMOVE': {
      const r = removeTile(state.work, action.id)
      if (!r.ok) return rejected(state, r)
      return commit(state, r.work, { selectedId: null })
    }

    case 'ROTATE': {
      const r = rotateTile(state.work, action.id)
      if (!r.ok) return rejected(state, r)
      // **旋转会改 id**，所以选中态必须跟着新 id 走，否则表现是「一转就丢选中」，
      // 而且是静悄悄丢的：画布看着正常，只是高亮没了。
      return commit(state, r.work, { selectedId: r.id })
    }

    case 'SET_COLOR': {
      const r = setTileColor(state.work, action.id, action.color)
      if (!r.ok) return rejected(state, r)
      return commit(state, r.work)
    }

    case 'TOGGLE_LOCK': {
      const r = toggleLock(state.work, action.id)
      if (!r.ok) return rejected(state, r)
      return commit(state, r.work)
    }

    case 'REPLACE':
      return commit(state, normalizeWork(action.work), { selectedId: null })

    case 'ADD_PHOTO': {
      // 照片不进撤销栈：它不改片，步骤图跟它没关系，而「撤销掉一张照片」
      // 在这套 UI 里没有对应的入口（没有删照片的路由），能撤不能重做是假的。
      const assets = { ...state.work.assets }
      assets.photos = [...(assets.photos ?? []), action.path]
      if (!assets.cover) assets.cover = action.path
      return setDoc(state, normalizeWork({ ...state.work, assets }))
    }

    case 'UNDO': {
      if (!state.past.length) return state
      const work = state.past[state.past.length - 1]
      return {
        ...state,
        work,
        past: state.past.slice(0, -1),
        future: [state.work, ...state.future].slice(0, HISTORY_MAX),
        selectedId: null,
        dirty: true,
      }
    }

    case 'REDO': {
      if (!state.future.length) return state
      const [work, ...rest] = state.future
      return {
        ...state,
        work,
        past: [...state.past, state.work].slice(-HISTORY_MAX),
        future: rest,
        selectedId: null,
        dirty: true,
      }
    }

    case 'SET_MODE':
      return {
        ...state,
        mode: action.mode,
        // 进源码模式时用当前文档重新渲染一遍文本。反过来（源码 → 画布）
        // 是「应用」那条路，没应用成功的源码不该被画布悄悄吃掉。
        source: action.mode === 'source' ? prettify(state.work) : state.source,
        sourceError: null,
      }

    case 'SOURCE_EDIT':
      return { ...state, source: action.text }

    case 'SOURCE_RESET':
      return { ...state, source: prettify(state.work), sourceError: null }

    case 'SOURCE_APPLY': {
      let parsed
      try {
        parsed = JSON.parse(state.source)
      } catch (err) {
        return { ...state, sourceError: `JSON 语法错误：${err.message}` }
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ...state, sourceError: '顶层得是一个对象，也就是一份 work.json' }
      }
      // 过 normalizeWork 之后再进文档：用户敲的 JSON 缺字段、类型不对都是常态，
      // 而文档态一旦允许「半合法」存在，下游每一处都得自己兜底。
      return { ...commit(state, normalizeWork(parsed)), mode: 'canvas', sourceError: null }
    }

    case 'MARK_SAVED':
      return { ...state, dirty: false }

    default:
      return state
  }
}

const prettify = (work) => `${JSON.stringify(work, null, 2)}\n`

function blank(work) {
  return {
    work: normalizeWork(work),
    past: [],
    future: [],
    selectedId: null,
    tool: { shape: 'SQ', rot: 0, color: COLOR_NAMES[0] },
    mode: 'canvas',
    source: '',
    sourceError: null,
    reject: null,
    dirty: false,
  }
}

/** 改了文档，进撤销栈 */
function commit(state, work, extra = {}) {
  return {
    ...state,
    work,
    past: [...state.past, state.work].slice(-HISTORY_MAX),
    future: [],
    dirty: true,
    ...extra,
  }
}

/** 改了文档，但不进撤销栈（照片这类与片集无关的改动） */
const setDoc = (state, work) => ({ ...state, work, dirty: true })

/** 编辑被拒：文档一个字都不动，只把理由说出来 */
const rejected = (state, result) => ({
  ...state,
  reject: { n: (state.reject?.n ?? 0) + 1, text: result.message },
})

export default function Build() {
  const lib = useLibrary()
  const { message, modal } = App.useApp()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [state, dispatch] = useReducer(reducer, fishFixture, blank)
  const { work, past, future, selectedId, tool, mode, source, sourceError, reject, dirty } = state

  const [showGrid, setShowGrid] = useState(true)
  const [showAtoms, setShowAtoms] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [works, setWorks] = useState([])
  const [flash, setFlash] = useState(null) // 不进 reducer 的提示（读盘失败之类）

  const queryId = searchParams.get('work')
  const analysis = useMemo(() => analyzeWork(work), [work])
  const normalized = analysis.work
  const { stats, errors, warnings } = analysis

  const selected = selectedId ? normalized.tiles.find((t) => t.id === selectedId) ?? null : null
  const contour = Array.isArray(normalized.solution?.contour) ? normalized.solution.contour : null
  const photos = normalized.assets?.photos ?? []

  /* ------------------------------------------------------------ 提示 --- */

  useEffect(() => {
    if (reject) message.error(reject.text)
  }, [reject, message])

  useEffect(() => {
    if (flash) message.error(flash)
  }, [flash, message])

  /* -------------------------------------------------------- 作品入口 --- */

  const refreshWorks = useCallback(async () => {
    try {
      setWorks(await listWorks())
    } catch (err) {
      setFlash(`读作品列表失败：${err.message}`)
    }
  }, [])

  const worksLoaded = useRef(false)
  useEffect(() => {
    // StrictMode 下 effect 会跑两次，这里挡掉重复请求 —— listWorks 是 N+1 次读
    if (worksLoaded.current) return
    worksLoaded.current = true
    refreshWorks()
  }, [refreshWorks])

  /**
   * 载入由**地址栏**驱动，不由下拉框自己载。这样「Draft 跑完跳过来」与
   * 「在这儿手动选一个」走的是同一条路，少一条只在某个入口才走的分支。
   * 参数走 query 而不是 `/produce/build/:id` —— 三级菜单的 key 就是路由 path
   * 那条约定只覆盖静态路由，参数化路径会开出一个 label 解析不到的标签页。
   *
   * ★ `loadedRef` 记的是**已经真的载进来的** id，所以只能在 dispatch 之后写。
   * 早先它写在发起请求**之前**，于是两处都坏了，而且坏得完全无声：
   *
   *   1. StrictMode 下 effect 跑两遍（起请求 → 清理 → 再跑）。第一遍把 ref 写成
   *      `queryId` 之后，第二遍一进来就 `loadedRef.current === queryId` 直接 return，
   *      而第一遍那个请求回来时 `alive` 已被清理置成 false、结果被丢掉 ——
   *      **于是 dev 里一份作品都载不进来**，且不报错（`catch` 也被 `alive` 挡住了）。
   *   2. `switchWork` 只是改地址栏，它自己并不载。可它把 ref 写成了要去的 id，
   *      于是效果里那句「这个 id 载过了」把**唯一**会去载的那条路也堵死了 ——
   *      下拉框选谁都没反应。
   *
   * 「先记上，再去做」和「做成了，再记上」在幂等标记上是两件事：前者在失败与
   * 重入时都会把机会吃掉。所以失败时要把 ref 清回去，允许重试。
   */
  const loadedRef = useRef('')
  useEffect(() => {
    if (!queryId || loadedRef.current === queryId) return
    let alive = true
    loadWork(queryId)
      .then(({ work: data, missing }) => {
        if (!alive) return
        if (missing || !data) {
          setFlash(`library/works/${queryId}/ 里没有 work.json`)
          return
        }
        loadedRef.current = queryId
        dispatch({ type: 'LOAD', work: data })
      })
      .catch((err) => {
        if (!alive) return
        setFlash(`读 work.json 失败：${err.message}`)
      })
    return () => {
      alive = false
    }
  }, [queryId])

  /** 只改地址栏。载入由上面那个 effect 统一负责 —— 这里不许写 `loadedRef` */
  const switchWork = (id) => {
    setSearchParams(id ? { work: id } : {}, { replace: true })
  }

  /* ------------------------------------------------------------ 编辑 --- */

  const act = useCallback((type, payload) => dispatch({ type, ...payload }), [])

  const onPlace = useCallback(
    ({ i, j }) => dispatch({ type: 'PLACE', spec: { shape: tool.shape, rot: tool.rot, i, j } }),
    [tool],
  )

  // Ctrl+Z / Ctrl+Shift+Z。输入框里不接管 —— 在源码模式下打字的人要的是
  // 撤销那一次输入，不是撤销一次放片。
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      e.preventDefault()
      dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Delete / Backspace 删掉选中的片。没选中就什么都不做 —— 不该有一条
  // 「按一下 Delete 删掉某个我没在看的东西」的路径。
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (!selectedId) return
      e.preventDefault()
      dispatch({ type: 'REMOVE', id: selectedId })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId])

  /* ------------------------------------------------------------ 重解 --- */

  /**
   * 锁定片当强制放置、其余丢掉重解。**未锁定的片是被丢弃后重解，不是保留** ——
   * 这就是锁的含义：锁 = 固定，不锁 = 求解器的事。UI 上得说清楚。
   */
  const onResolve = async () => {
    const lockedTiles = work.tiles.filter((t) => t.locked)
    try {
      const sol = solveContour({
        poly: contour,
        // ★ `canvas` 必须传回去。solve.js 的顺序是 resolveCanvas → createGrid →
        // rasterize，而原子索引 t = (j*cols + i)*4 + q **依赖 cols**。当初 Draft
        // 没传 canvas，是从轮廓包围盒推出来的并存进了 work.canvas；传回去，
        // 网格与原子索引才与当初逐位相同，锁定片的原子集合才对得上。
        // 漏传的表现是「跑得干干净净，但锁定片全体错位」。
        canvas: normalized.canvas,
        stock: stockToShapeMap(lib.stock),
        palette: COLOR_NAMES,
        options: { seedKey: normalized.workId },
        lockedTiles,
      })

      if (!sol.tiles.length) {
        modal.error({
          title: '这一版拼不出来',
          content: sol.reason ?? '一片都放不下，改改锁定的片或者回草稿页换张图。',
        })
        return
      }

      const apply = () => {
        dispatch({
          type: 'REPLACE',
          work: {
            ...normalized,
            tiles: sol.tiles,
            solution: { ...normalized.solution, level: sol.level, coverage: sol.metrics?.coverage ?? null, overflow: sol.metrics?.overflow ?? null },
            // 片换了一批，已经拆好的步骤图就跟现在对不上了。只有片集逐位相同时
            // 才保留原来的状态 —— 那种情况下重解其实什么都没改。
            stepsStale: !sameTiles(normalized.tiles, sol.tiles),
          },
        })
      }

      const cover = Math.round((sol.metrics?.coverage ?? 0) * 100)
      if (sol.degraded) {
        // L5 是「判为不可拼」，但仍带一份尽力而为的片集。**不静默替换** ——
        // 用户得自己决定要不要接受一张盖住一半的图。
        modal.confirm({
          title: `${sol.level} · 这一版判为拼不出来，只覆盖了 ${cover}%`,
          content: sol.reason ?? '可以先把这一版用起来，也可以撤销。',
          okText: '用这一版',
          cancelText: '算了',
          onOk: apply,
        })
        return
      }
      apply()
      message.success(`${sol.level} · ${sol.tiles.length} 片 · 覆盖 ${cover}%${lockedTiles.length ? ` · 锁住 ${lockedTiles.length} 片` : ''}`)
    } catch (err) {
      modal.error({ title: '求解出错了', content: err.message })
    }
  }

  /* ------------------------------------------------------------ 落盘 --- */

  const onSave = async () => {
    setSaving(true)
    try {
      const id = normalized.workId
      const bytes = await fsClient.write(`works/${id}/work.json`, normalized)
      dispatch({ type: 'MARK_SAVED' })
      message.success(`已写入 library/works/${id}/work.json（${bytes} 字节）`)
      refreshWorks()
    } catch (err) {
      setFlash(`保存失败：${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const onNewWork = () => {
    if (dirty) {
      modal.confirm({
        title: '现在这份还没存',
        content: '换成一页空白会让没保存的改动没有。',
        okText: '换掉',
        cancelText: '算了',
        okButtonProps: { danger: true },
        onOk: () => {
          loadedRef.current = ''
          setSearchParams({}, { replace: true })
          dispatch({ type: 'LOAD', work: createWork({ workId: newWorkId() }) })
        },
      })
      return
    }
    loadedRef.current = ''
    setSearchParams({}, { replace: true })
    dispatch({ type: 'LOAD', work: createWork({ workId: newWorkId() }) })
  }

  /* ------------------------------------------------------------ 照片 --- */

  const nextPhotoPath = (ext) => {
    const used = new Set(photos.map((p) => p.split('/').pop()))
    for (let n = 1; n <= 99; n += 1) {
      const name = `photo-${String(n).padStart(2, '0')}.${ext}`
      if (!used.has(name)) return `works/${normalized.workId}/${name}`
    }
    return `works/${normalized.workId}/photo-${Date.now()}.${ext}`
  }

  const beforeUpload = async (file) => {
    const reject = photoReject(file)
    if (reject) {
      message.error(reject)
      return Upload.LIST_IGNORE
    }
    setUploading(true)
    try {
      const path = nextPhotoPath(EXT_BY_TYPE[file.type])
      await fsClient.writeBinary(path, await fileToBase64(file))
      dispatch({ type: 'ADD_PHOTO', path })
      // 存图不改片，所以不用等用户点保存 —— 照片已经在磁盘上了，
      // 而 work.json 里的引用留在内存文档里，跟着下一次保存一起落盘。
      message.success(`照片已存到 library/${path}，记得点保存把引用写进 work.json`)
    } catch (err) {
      setFlash(`传照片失败：${err.message}`)
    } finally {
      setUploading(false)
    }
    return Upload.LIST_IGNORE
  }

  /* ------------------------------------------------------------ 渲染 --- */

  const rotChoices = ROTATIONS[tool.shape] ?? [0]
  const selectedRots = selected ? ROTATIONS[selected.shape] ?? [0] : []

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">实物搭建</div>
          <div className="page-desc">
            左边点形状、画布上点一下放一片。搭到满意就把想固定的片锁上，按「重解」让求解器
            <b>只重排没锁的片</b>——锁定的片一片不动，其余的会被丢掉重算。
          </div>
        </div>
        <Space size={8} wrap>
          <Select
            size="small"
            style={{ minWidth: 210 }}
            value={queryId ?? undefined}
            placeholder="载入一个作品"
            options={works.map((w) => ({ value: w.id, label: workLabel(w) }))}
            onChange={switchWork}
            allowClear
            onClear={() => switchWork('')}
          />
          <Segmented
            size="small"
            options={MODES}
            value={mode}
            onChange={(m) => dispatch({ type: 'SET_MODE', mode: m })}
          />
          <Button size="small" icon={<PlusOutlined />} onClick={onNewWork}>
            新作品
          </Button>
          <Tooltip title={analysis.ok ? '' : '先把校验错误处理掉'}>
            <span>
              <Button
                size="small"
                type="primary"
                icon={<SaveOutlined />}
                loading={saving}
                disabled={!analysis.ok}
                onClick={onSave}
              >
                保存
              </Button>
            </span>
          </Tooltip>
        </Space>
      </div>

      {work.stepsStale && (
        <Alert
          type="warning"
          showIcon
          banner
          title="片动过了，已经拆好的步骤图跟现在对不上"
          description={
            <Space size={10}>
              <span>存好这份 work.json 之后去步骤页重新拆解一遍。</span>
              <Button
                size="small"
                type="link"
                style={{ padding: 0 }}
                onClick={() => navigate(`/produce/steps?work=${normalized.workId}`)}
              >
                去步骤拆解
              </Button>
            </Space>
          }
        />
      )}

      <div className="build-split">
        {/* ---------------- 左栏：工具 + 实物照片 ---------------- */}
        <div className="build-col build-stack">
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">放置工具</span>
            </div>
            <div className="panel-body build-tools">
              <div className="tool-group">
                <span className="tool-label">形状</span>
                <div className="tool-shapes">
                  {PLANAR_SHAPES.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={`tool-shape${tool.shape === id ? ' is-on' : ''}`}
                      onClick={() => dispatch({ type: 'SET_TOOL', patch: { shape: id } })}
                    >
                      <ShapeGlyph id={id} size={24} color={tool.shape === id ? 'var(--brand)' : 'var(--ink-2)'} />
                      <span>{SHAPES[id].name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="tool-group">
                <span className="tool-label">朝向</span>
                <div className="tool-row">
                  {rotChoices.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`tool-chip${tool.rot === r ? ' is-on' : ''}`}
                      onClick={() => dispatch({ type: 'SET_TOOL', patch: { rot: r } })}
                    >
                      {r}°
                    </button>
                  ))}
                </div>
                {rotChoices.length === 1 && <span className="faint">这个形状只有一种朝向</span>}
              </div>

              <div className="tool-group">
                <span className="tool-label">新片颜色</span>
                <Swatches
                  onPick={(c) => dispatch({ type: 'SET_TOOL', patch: { color: c } })}
                  isOn={(c) => tool.color === c}
                />
              </div>

              <div className="tool-group">
                <span className="tool-label">选中的片</span>
                {selected ? (
                  <>
                    <div className="mono faint">{selected.id}</div>
                    <div className="faint">
                      {SHAPES[selected.shape]?.name ?? selected.shape} · ({selected.i}, {selected.j}) · rot{' '}
                      {selected.rot} · {selected.color ?? '未指定'}
                    </div>
                    <div className="tool-row">
                      <Button
                        size="small"
                        icon={selected.locked ? <UnlockOutlined /> : <LockOutlined />}
                        onClick={() => act('TOGGLE_LOCK', { id: selected.id })}
                      >
                        {selected.locked ? '解锁' : '锁定'}
                      </Button>
                      <Tooltip title={selectedRots.length > 1 ? '' : '这个形状只有一种朝向'}>
                        <span>
                          <Button
                            size="small"
                            icon={<ReloadOutlined />}
                            disabled={selectedRots.length <= 1}
                            onClick={() => act('ROTATE', { id: selected.id })}
                          >
                            旋转
                          </Button>
                        </span>
                      </Tooltip>
                      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => act('REMOVE', { id: selected.id })}>
                        删除
                      </Button>
                    </div>
                    <Swatches
                      onPick={(c) => act('SET_COLOR', { id: selected.id, color: c })}
                      isOn={(c) => selected.color === c}
                    />
                  </>
                ) : (
                  <span className="faint">画布上点一片就选中它，Delete 删掉</span>
                )}
              </div>

              <div className="tool-group">
                {contour ? (
                  <Button block icon={<ThunderboltOutlined />} onClick={onResolve}>
                    锁定片不动，其余重解
                  </Button>
                ) : (
                  <Tooltip title="重解需要一个目标轮廓，而轮廓是草稿链路算出来的 —— 从草稿页跑出来的作品才有。">
                    <Button block icon={<ThunderboltOutlined />} disabled>
                      锁定片不动，其余重解
                    </Button>
                  </Tooltip>
                )}
                <span className="faint">
                  {contour
                    ? `${work.tiles.filter((t) => t.locked).length} 片锁定 · 未锁定的会被丢掉重算`
                    : '这份作品没有轮廓（不是从草稿页产出的）'}
                </span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">实物照片</span>
              <Upload
                beforeUpload={beforeUpload}
                showUploadList={false}
                accept={PHOTO_ACCEPT}
                disabled={uploading}
              >
                <Button size="small" icon={<PlusOutlined />} loading={uploading}>
                  传一张
                </Button>
              </Upload>
            </div>
            <div className="panel-body">
              {photos.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={<span className="faint">照着方案搭完，拍张照存这儿</span>}
                />
              ) : (
                <div className="photo-grid">
                  {photos.map((p) => (
                    <a key={p} href={fsClient.readRawUrl(p)} target="_blank" rel="noreferrer" title={p}>
                      <img src={fsClient.readRawUrl(p)} alt={p} />
                    </a>
                  ))}
                </div>
              )}
              {/* 没有删照片的入口：那要给 fs-api 加一条 delete 路由，把它的威胁模型
                  从「只在白名单里写」扩大到「能删 library 下的东西」。真要删走 Finder。 */}
            </div>
          </div>
        </div>

        {/* ---------------- 中栏：画布 ---------------- */}
        <div className="build-col">
          <div className="panel is-flex">
            <div className="panel-head">
              <span className="panel-title">拼贴预览</span>
              <Space size={14}>
                <Space size={6}>
                  <span className="faint">网格</span>
                  <Switch size="small" checked={showGrid} onChange={setShowGrid} />
                </Space>
                <Space size={6}>
                  <Tooltip title="每个格子按两条对角线切成 4 个象限三角形。求解器就是按这个粒度做精确覆盖的，不是按整格。">
                    <span className="faint" style={{ borderBottom: '1px dotted var(--ink-3)' }}>
                      原子视图
                    </span>
                  </Tooltip>
                  <Switch size="small" checked={showAtoms} onChange={setShowAtoms} />
                </Space>
                <Space size={6}>
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    disabled={!past.length}
                    onClick={() => dispatch({ type: 'UNDO' })}
                    title="撤销（Ctrl+Z）"
                  />
                  <Button
                    size="small"
                    icon={<ExportOutlined />}
                    disabled={!future.length}
                    onClick={() => dispatch({ type: 'REDO' })}
                    title="重做（Ctrl+Shift+Z）"
                  />
                </Space>
              </Space>
            </div>

            {errors.length > 0 && (
              <Alert
                type="error"
                showIcon
                banner
                title={`${errors.length} 项校验不通过`}
                description={errors.map((e) => e.message).join('；')}
              />
            )}
            {errors.length === 0 && warnings.length > 0 && (
              <Alert
                type="warning"
                showIcon
                banner
                title={warnings.map((w) => w.message).join('；')}
              />
            )}

            <div className="panel-body build-canvas">
              <MosaicCanvas
                work={normalized}
                analysis={analysis}
                contour={contour}
                showGrid={showGrid}
                showAtoms={showAtoms}
                selectedId={selectedId}
                onSelect={(id) => dispatch({ type: 'SELECT', id })}
                // 编辑只在画布模式下开。源码模式下画布是「上一次应用成功的那一版」，
                // 能点能放的话，两种文档会在同一个屏幕上打架。
                editable={mode === 'canvas'}
                tool={tool}
                onPlace={onPlace}
              />
            </div>

            <div className="panel-foot">
              <div className="row-between" style={{ gap: 12 }}>
                <Space size={10} wrap>
                  <Stat label="片" value={stats.tileCount} />
                  <Stat label="原子" value={stats.atomCount} />
                  <Stat label="占格" value={stats.filledCells} />
                  <Stat label="画布占用" value={`${(stats.fillRatio * 100).toFixed(0)}%`} />
                  {work.tiles.some((t) => t.locked) && (
                    <Tag color="processing" style={{ marginInlineEnd: 0 }}>
                      锁定 {work.tiles.filter((t) => t.locked).length} 片
                    </Tag>
                  )}
                  <Tag
                    color={stats.componentCount > 1 ? 'warning' : 'success'}
                    style={{ marginInlineEnd: 0 }}
                  >
                    {stats.componentCount > 1 ? `${stats.componentCount} 块不相连` : '结构连通'}
                  </Tag>
                  {dirty && (
                    <Tag color="warning" style={{ marginInlineEnd: 0 }}>
                      未保存
                    </Tag>
                  )}
                </Space>
                <span className="mono faint" style={{ whiteSpace: 'nowrap' }}>
                  {selected ? `选中 ${selected.id}` : '点一片选中它'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ---------------- 右栏：JSON ---------------- */}
        <div className="build-col">
          <div className="panel is-flex">
            <div className="panel-head">
              <span className="panel-title">work.json</span>
              <Space size={8}>
                <Tag className="mono" style={{ marginInlineEnd: 0 }}>
                  {normalized.workId}
                </Tag>
                {mode === 'source' && (
                  <>
                    <Button size="small" onClick={() => dispatch({ type: 'SOURCE_RESET' })}>
                      重置
                    </Button>
                    <Button size="small" type="primary" onClick={() => dispatch({ type: 'SOURCE_APPLY' })}>
                      应用
                    </Button>
                  </>
                )}
              </Space>
            </div>

            {mode === 'source' && sourceError && (
              <Alert type="error" showIcon banner title={sourceError} />
            )}

            <div className="panel-body build-editor">
              {mode === 'source' ? (
                <Input.TextArea
                  value={source}
                  onChange={(e) => dispatch({ type: 'SOURCE_EDIT', text: e.target.value })}
                  spellCheck={false}
                  className="mono"
                  style={{ height: '100%', resize: 'none', fontSize: 12, lineHeight: 1.55 }}
                />
              ) : (
                // 只读，但**跟着文档走** —— 编辑动作、撤销、重解都会即时反映在这儿。
                // 这是「画布是文档」之后仍保留调试能力的那个窗口。
                <pre className="build-pre">{prettify(normalized)}</pre>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** 色板。放在工具面板与选中框里两处，规则一样：点了就换色 */
function Swatches({ onPick, isOn }) {
  return (
    <div className="tool-colors">
      {COLOR_NAMES.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          aria-label={c}
          className={`tool-color${isOn(c) ? ' is-on' : ''}`}
          style={{ background: TILE_PALETTE[c] ?? colorHex(c) }}
          onClick={() => onPick(c)}
        />
      ))}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <span className="faint">
      {label}{' '}
      <b className="mono" style={{ color: 'var(--ink)' }}>
        {value}
      </b>
    </span>
  )
}

/** 片集是否逐位相同（顺序也算）。重解之后决定要不要把步骤标成过期 */
function sameTiles(a, b) {
  if (a.length !== b.length) return false
  for (let k = 0; k < a.length; k += 1) {
    const x = a[k]
    const y = b[k]
    if (x.id !== y.id || x.rot !== y.rot || x.i !== y.i || x.j !== y.j || x.color !== y.color) return false
  }
  return true
}
