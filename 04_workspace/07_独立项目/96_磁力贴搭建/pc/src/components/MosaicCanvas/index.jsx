import { useCallback, useEffect, useMemo, useRef } from 'react'
import { SHAPES, analyzeWork, createGrid } from '../../core/api.js'
import { PAD, S, atomOverlayPath, cellAtContentPoint, contourPath, gridPath, tilePath } from './paint.js'
import Tile from './Tile.jsx'
import { useViewport } from './viewport.js'

/**
 * 磁力贴画布。**唯一一套渲染器** —— 工作台画布、步骤图、封面图都走这里，
 * 不另写 Canvas 版本。同一份 work.json 在哪儿画都长一样。
 *
 * 三层状态各归各位（这是这个组件最重要的事）：
 *   文档态  tiles / steps      → 来自 props（父层的 useReducer）
 *   视口态  zoom / pan         → useRef，拖拽时只改 <g transform>，不 setState
 *   交互态  hover / 选中       → 覆盖层 path，命令式改 d，不 setState
 *
 * 结果：悬停和拖拽期间，Tile 组件一次都不重渲。
 */
export default function MosaicCanvas({
  work,
  analysis: analysisProp,
  showGrid = true,
  showAtoms = false,
  /** 目标轮廓（格子坐标，一格 = 1）。给了就叠一条虚线，用来看「要的形状」和「拼出来的形状」差在哪儿 */
  contour = null,
  selectedId = null,
  onSelect,
  /**
   * 点放式编辑。`tool` 是当前要放的形状与朝向 `{ shape, rot }`，
   * 传 `null`（或 editable 为 false）就是纯查看/点选模式。
   *
   * 画布**不判断这一放合不合法** —— 那由 `core/model/edit.js` 的 `canPlace` 一处说了算，
   * 页面拿到 `onPlace` 的回调再决定放不放、拒绝了要给什么提示。视图层多一套边界规则
   * 就一定会跟 core 那套漂移，然后出现「画布说能放、保存时校验报重叠」这种事。
   */
  editable = false,
  tool = null,
  onPlace,
  /**
   * 这一轮新添的片 id（重解之后用来把求解器动过的地方标出来）。
   * 收数组不收集合，内部转成 Set 查一次 —— 调用方手里通常就是数组。
   */
  newIds = null,
  /**
   * 只画这些片，其余不画。**步骤页靠它做「搭到第 N 步时板子上是什么样」** ——
   * 更晚的片必须一片都不出现，否则等于把答案提前给了。
   *
   * 不做成「页面自己裁好 tiles 再传进来」：那样传进来的 work 是一份片不全的作品，
   * 画布自己会去 `analyzeWork` 它，于是每次切步骤都要白跑一遍校验，还得让画布
   * 显示一份根本不存在于磁盘上的作品。过滤是**视图层的一次筛选**，就在视图层做。
   *
   * `null` = 全画（默认）。注意它和 `newIds` 是正交的两件事：这个管「画不画」，
   * 那个管「画出来什么样」。
   */
  onlyIds = null,
}) {
  const svgRef = useRef(null)
  const gRef = useRef(null)
  const hoverRef = useRef(null)
  const selectHaloRef = useRef(null)
  const selectRef = useRef(null)
  const placeRef = useRef(null)
  const zoomRef = useRef(null)

  const placing = editable && tool != null

  // 父层已经把校验结果算出来了（要显示在统计栏里）就直接用，别算两遍
  const computed = useMemo(() => (analysisProp ? null : analyzeWork(work)), [analysisProp, work])
  const analysis = analysisProp ?? computed
  const normalized = analysis.work
  const { cols, rows } = normalized.canvas

  const grid = useMemo(() => createGrid(cols, rows), [cols, rows])

  // 形状不认识的片直接不画 —— outline() 对未知形状是抛异常的（那是程序 bug 的语义），
  // 但这里遇到的是**数据**写错了，该由校验横幅去解释，不该把画布炸掉。
  const keepSet = useMemo(() => (onlyIds ? new Set(onlyIds) : null), [onlyIds])

  /**
   * 一片该不该画。**原子覆盖层要用同一个判据** —— `analysis.atoms` 是
   * `normalized.tiles` 的**同序平行数组**，两边各写一套过滤的话，
   * `showAtoms` 下会出现「片画了、原子线没画」或者反过来的错位。
   */
  const isVisible = useCallback(
    (t) => Boolean(SHAPES[t.shape]) && (!keepSet || keepSet.has(t.id)),
    [keepSet],
  )

  const tiles = useMemo(() => normalized.tiles.filter(isVisible), [normalized.tiles, isVisible])

  const byId = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles])

  const onZoomChange = useCallback((z) => {
    const el = zoomRef.current
    if (el) el.textContent = `${Math.round(z * 100)}%`
  }, [])

  const { beginDrag, dragTo, endDrag, isDragging, zoomByButton, reset, clientToContent } = useViewport({
    svgRef,
    gRef,
    onZoomChange,
  })

  const newSet = useMemo(() => new Set(newIds ?? []), [newIds])

  /* ---------------- 原子视图：哪些格子被占了 ---------------- */

  const filledIJ = useMemo(() => {
    const seen = new Map()
    analysis.atoms.forEach((list, k) => {
      if (!list) return
      if (!isVisible(normalized.tiles[k] ?? {})) return
      for (const t of list) {
        const { i, j } = grid.toIJQ(t)
        seen.set(`${i},${j}`, [i, j])
      }
    })
    return [...seen.values()]
  }, [analysis.atoms, normalized.tiles, isVisible, grid])

  /* ---------------- 交互 ---------------- */

  const updateHover = useCallback(
    (target) => {
      const el = hoverRef.current
      if (!el) return
      const id = target?.closest?.('[data-tile-id]')?.dataset.tileId ?? ''
      if (id === el.dataset.tileId) return
      el.dataset.tileId = id
      if (!id) {
        el.removeAttribute('d')
        return
      }
      const t = byId.get(id)
      if (!t) {
        el.removeAttribute('d')
        return
      }
      el.setAttribute('d', tilePath(t.shape, t.rot, t.i, t.j))
    },
    [byId],
  )

  /**
   * 幽灵预览：把「这一下点下去会放在哪儿」画出来。
   *
   * 跟 hover 一样走命令式改 `d` —— pointermove 每秒几十次，每次 setState 就是
   * 一次 React 渲染，几百个 tile 跟着重渲，手感直接垮掉。这是三层状态划分里
   * 「交互态」那一层的本职。
   */
  const updateGhost = useCallback(
    (clientX, clientY) => {
      const el = placeRef.current
      if (!el) return
      if (!placing) {
        el.removeAttribute('d')
        return
      }
      const p = clientToContent(clientX, clientY)
      const { i, j } = cellAtContentPoint(p.x, p.y)
      el.setAttribute('d', tilePath(tool.shape, tool.rot, i, j))
    },
    [placing, tool, clientToContent],
  )

  // 换形状/朝向，或者退出点放模式时，幽灵要立刻跟上或消失。
  // 不能等下一次 pointermove —— 鼠标停着不动时那一刻画的是旧形状。
  useEffect(() => {
    const el = placeRef.current
    if (el && !placing) el.removeAttribute('d')
  }, [placing, tool])

  const handlePointerDown = useCallback(
    (e) => {
      if (e.button !== 0 && e.button !== 1) return
      svgRef.current?.setPointerCapture?.(e.pointerId)
      beginDrag(e, e.target?.closest?.('[data-tile-id]')?.dataset.tileId)
    },
    [beginDrag],
  )

  const handlePointerMove = useCallback(
    (e) => {
      // 拖拽中只管平移；没在拖拽才更新 hover 高亮与幽灵
      if (dragTo(e)) return
      if (isDragging()) return
      updateHover(e.target)
      updateGhost(e.clientX, e.clientY)
    },
    [dragTo, isDragging, updateHover, updateGhost],
  )

  const handlePointerUp = useCallback(
    (e) => {
      const ended = endDrag(e)
      if (!ended) return
      svgRef.current?.releasePointerCapture?.(e.pointerId)
      // 位移没超过死区才算点击，否则拖完松手会顺手放下一片/改掉选中项
      if (ended.moved) return

      // ★ 点在**已有的片**上 = 选中它，点在空处 = 放一片。
      //
      // 早先写的是 `if (placing) 放 else if (onSelect) 选`，而 Build 永远在点放
      // 模式里（`editable` 且 `tool` 非空 ⇒ `placing` 恒真），于是 `onSelect` 那半条
      // 分支**一次都走不到**。症状很隐蔽：左栏写着「画布上点一片就选中它」，
      // 实际上已放好的片再也点不中 —— 选中态只能靠「刚放下一片」顺带产生，
      // 于是锁定/旋转/删除/改色这些**全部只对最后放的那一片有效**，
      // 而「锁定几片、其余重解」这套主流程从界面上根本走不到。
      //
      // 点放与点选不是二选一，是看这一点落在什么上面。`hitId` 在 pointerdown 时
      // 就从 `[data-tile-id]` 上取好了，这里直接用它，不必再命中一次。
      if (placing) {
        if (ended.hitId && onSelect) {
          onSelect(ended.hitId)
          return
        }
        const p = clientToContent(e.clientX, e.clientY)
        onPlace?.(cellAtContentPoint(p.x, p.y))
        return
      }
      if (onSelect) onSelect(ended.hitId)
    },
    [endDrag, svgRef, placing, clientToContent, onPlace, onSelect],
  )

  const handlePointerLeave = useCallback(() => {
    if (isDragging()) return
    updateHover(null)
    placeRef.current?.removeAttribute('d')
  }, [isDragging, updateHover])

  /* 选中描边：低频道，走 React 更新就好，但也只改 path 的 d */
  useEffect(() => {
    const halo = selectHaloRef.current
    const el = selectRef.current
    if (!halo || !el) return
    const t = selectedId ? byId.get(selectedId) : null
    // 描边是 brand 红，压在同为红色的磁力片上基本看不见，
    // 所以底下垫一条纸色的粗晕圈，任何片色上都读得出。
    for (const node of [halo, el]) {
      if (t) node.setAttribute('d', tilePath(t.shape, t.rot, t.i, t.j))
      else node.removeAttribute('d')
    }
  }, [selectedId, byId])

  /* ---------------- 尺寸 ---------------- */

  const contourD = useMemo(() => contourPath(contour), [contour])

  const w = cols * S
  const h = rows * S

  return (
    <div className="mc-host">
      <svg
        ref={svgRef}
        className="mc-svg"
        viewBox={`${-PAD} ${-PAD} ${w + PAD * 2} ${h + PAD * 2}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        <g ref={gRef}>
          <rect className="mc-sheet" x={0} y={0} width={w} height={h} />
          {showGrid && (
            <path className="mc-grid" d={gridPath(cols, rows)} vectorEffect="non-scaling-stroke" />
          )}
          <rect
            className="mc-frame"
            x={0}
            y={0}
            width={w}
            height={h}
            vectorEffect="non-scaling-stroke"
          />

          <g className="mc-tiles">
            {tiles.map((t) => (
              <Tile key={t.id} tile={t} isNew={newSet.has(t.id)} />
            ))}
          </g>

          {/* 目标轮廓压在最上面：缺口（L1/L4）和压出界（L2）都要能一眼看出来 */}
          {contourD && <path className="mc-contour" d={contourD} vectorEffect="non-scaling-stroke" />}

          {showAtoms && (
            <path
              className="mc-atoms"
              d={atomOverlayPath(filledIJ)}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* 覆盖层一律 pointer-events:none，不然会挡住下面的 tile 收不到事件 */}
          <path ref={placeRef} className="mc-place" vectorEffect="non-scaling-stroke" />
          <path ref={hoverRef} className="mc-hover" vectorEffect="non-scaling-stroke" />
          <path ref={selectHaloRef} className="mc-select-halo" vectorEffect="non-scaling-stroke" />
          <path ref={selectRef} className="mc-select" vectorEffect="non-scaling-stroke" />
        </g>
      </svg>

      <div className="mc-controls">
        <button type="button" onClick={() => zoomByButton(1.25)} title="放大">
          ＋
        </button>
        <button type="button" onClick={() => zoomByButton(0.8)} title="缩小">
          －
        </button>
        <button type="button" onClick={reset} title="回到适应窗口">
          适应
        </button>
      </div>

      <div className="mc-zoom" ref={zoomRef}>
        100%
      </div>
    </div>
  )
}
