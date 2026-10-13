import { useCallback, useEffect, useRef } from 'react'

/**
 * 视口态：zoom / pan。三层状态里的中间那层。
 *
 * 两条硬要求：
 *
 * 1. **拖拽过程中一次 setState 都不能有**。pointermove 每秒几十次，走 React
 *    会把几百个 tile 重渲一遍，手感直接垮掉。所以变换只写 <g transform>
 *    这一个属性，缩放读数通过回调直接改 DOM 文本。
 *
 * 2. **拖拽状态整个留在 hook 里**，对外只暴露 beginDrag / dragTo / endDrag。
 *    早先的写法是把 drag ref 返回给组件、由组件读写，但那样组件就拿到了一个
 *    「渲染结束之后还能改的对象」，React 编译器判定不安全——这个判断是对的，
 *    组件本来也不该摸视口的内部状态。
 */
const MIN_Z = 0.35
const MAX_Z = 6
const WHEEL_STEP = 1.0015
/** 4px 死区：手抖一下不该被当成拖拽，否则点选永远点不中 */
const DRAG_SLOP = 4

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

export function useViewport({ svgRef, gRef, onZoomChange }) {
  const view = useRef({ z: 1, x: 0, y: 0 })
  const drag = useRef(null)

  // 回调放进 ref，这样 apply 不必要求调用方把 onZoomChange 包成 useCallback。
  // 只能在 effect 里写：渲染期改 ref 是不安全的。
  const zoomCb = useRef(onZoomChange)
  useEffect(() => {
    zoomCb.current = onZoomChange
  }, [onZoomChange])

  const apply = useCallback(() => {
    const g = gRef.current
    if (!g) return
    const { z, x, y } = view.current
    g.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${z.toFixed(4)})`)
    zoomCb.current?.(z)
  }, [gRef])

  /**
   * 屏幕坐标 → **viewBox 坐标**（根 `<svg>` 那层，`-PAD` 起算）。
   *
   * 只给 `zoomAt` 用 —— 视口的 `x/y/z` 本来就是在 viewBox 空间里表示的，
   * 缩放锚点的推导（`q = (p - t) / z`）也只有在这个空间里才成立。
   *
   * **不要拿它做落点换算。** 它映射的是根 `<svg>`，而 `<g transform>` 那一层的
   * 平移缩放不在里面；格坐标是 `<g>` 之后的空间。要格坐标用 `clientToContent`。
   */
  const clientToView = useCallback(
    (clientX, clientY) => {
      const ctm = svgRef.current?.getScreenCTM()
      if (!ctm) return { x: clientX, y: clientY }
      const inv = ctm.inverse()
      return {
        x: inv.a * clientX + inv.c * clientY + inv.e,
        y: inv.b * clientX + inv.d * clientY + inv.f,
      }
    },
    [svgRef],
  )

  /**
   * 屏幕坐标 → **格坐标**（`tilePath` / `cellAtContentPoint` 用的那套，一格 = 1）。
   *
   * 取 `<g>` 的 CTM 而不是根 `<svg>` 的：`getScreenCTM()` 返回的是「该元素自身的
   * 用户坐标系 → 屏幕」，根 `<svg>` 的下一层就是 viewBox，而 `<g>` 身上挂着
   * `translate(x y) scale(z)`，于是它返回的才是含平移缩放的格坐标。
   *
   * `<g>` 还没挂上时退到 viewBox 坐标 —— 那种情况只可能发生在首帧之前，
   * 而那时也没有指针事件可换算。
   */
  const clientToContent = useCallback(
    (clientX, clientY) => {
      const ctm = gRef.current?.getScreenCTM()
      if (!ctm) return clientToView(clientX, clientY)
      const inv = ctm.inverse()
      return {
        x: inv.a * clientX + inv.c * clientY + inv.e,
        y: inv.b * clientX + inv.d * clientY + inv.f,
      }
    },
    [gRef, clientToView],
  )

  /** 屏幕位移 → 用户坐标位移。只用线性部分，不要平移量 */
  const clientDelta = useCallback(
    (dx, dy) => {
      const ctm = svgRef.current?.getScreenCTM()
      if (!ctm) return { x: dx, y: dy }
      const inv = ctm.inverse()
      return { x: inv.a * dx + inv.c * dy, y: inv.b * dx + inv.d * dy }
    },
    [svgRef],
  )

  const zoomAt = useCallback(
    (clientX, clientY, factor) => {
      const p = clientToView(clientX, clientY)
      const { z, x, y } = view.current
      const nz = clamp(z * factor, MIN_Z, MAX_Z)
      if (nz === z) return
      // 让光标下那个点保持不动：它在内容坐标里对应 q = (p - t) / z
      const k = nz / z
      view.current = { z: nz, x: p.x - k * (p.x - x), y: p.y - k * (p.y - y) }
      apply()
    },
    [apply, clientToView],
  )

  /** 以画布中心为锚点缩放，给工具栏的 +/− 按钮用 */
  const zoomByButton = useCallback(
    (factor) => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
    },
    [svgRef, zoomAt],
  )

  const reset = useCallback(() => {
    view.current = { z: 1, x: 0, y: 0 }
    apply()
  }, [apply])

  /* ---------------- 拖拽 / 平移 ---------------- */

  const beginDrag = useCallback(
    (e, hitId) => {
      drag.current = {
        pointerId: e.pointerId,
        clientX: e.clientX,
        clientY: e.clientY,
        start: { ...view.current },
        hitId: hitId ?? null,
        moved: false,
      }
    },
    [],
  )

  /**
   * 返回是否已进入真正的拖拽。false 表示还在死区里，调用方不必做别的。
   * 拖动时整对象替换，不做字段就地改写 —— 就地改写等价于「渲染后修改闭包捕获的值」，
   * 编译器会（正确地）把它标成不安全。
   */
  const dragTo = useCallback(
    (e) => {
      const d = drag.current
      if (!d || d.pointerId !== e.pointerId) return false

      const dx = e.clientX - d.clientX
      const dy = e.clientY - d.clientY
      if (!d.moved && Math.hypot(dx, dy) < DRAG_SLOP) return false

      drag.current = { ...d, moved: true }
      const delta = clientDelta(dx, dy)
      view.current = { z: d.start.z, x: d.start.x + delta.x, y: d.start.y + delta.y }
      apply()
      return true
    },
    [apply, clientDelta],
  )

  /** 结束拖拽。返回 { moved, hitId }；如果这次 pointerup 不属于当前拖拽则返回 null */
  const endDrag = useCallback((e) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return null
    drag.current = null
    return { moved: d.moved, hitId: d.hitId }
  }, [])

  const isDragging = useCallback(() => drag.current !== null, [])

  /* 滚轮。必须 passive:false，否则没法 preventDefault，页面会跟着一起滚 */
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return undefined
    const onWheel = (e) => {
      e.preventDefault()
      // 触控板的 pinch 会带 ctrlKey，步长放大一点，手感才跟得上
      const factor = Math.pow(WHEEL_STEP, -e.deltaY * (e.ctrlKey ? 3 : 1))
      zoomAt(e.clientX, e.clientY, factor)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [svgRef, zoomAt])

  useEffect(() => {
    apply()
  }, [apply])

  // 只导出 clientToContent（格坐标）。clientToView 是 zoomAt 的内部实现，
  // 导出它只会给「拿 viewBox 坐标当格坐标用」再开一条路 —— 那正是这里刚修掉的 bug。
  return { beginDrag, dragTo, endDrag, isDragging, zoomByButton, reset, clientToContent }
}
