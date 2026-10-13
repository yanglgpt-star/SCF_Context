import { bboxOf } from '../../core/api.js'

/**
 * 轮廓缩略图。**目标形状**的图，不是求解结果 —— 放在「要拼的形状」旁边，
 * 好和「求解器拼出来的形状」对着看：降级到 L4/L5 时差在哪儿，一眼就看得出来。
 *
 * 这是全站唯一一处画轮廓缩略图的地方。求解页和草稿页都要它，两处各画一遍的话，
 * 迟早会有一处的留白比例或描边对不上 —— 那种差异没人会去逐张比，只会觉得
 * 「两个页面的形状好像不太一样」，然后开始怀疑数据。
 *
 * viewBox 用和输出同样的边长（正方形，但把图形按长边缩放后居中），
 * 所以宽高比怪异的轮廓（比如一根细长的杆）不会被拉变形。
 */
export default function ContourThumb({ poly, size = 30, className = 'contour-thumb' }) {
  if (!Array.isArray(poly) || poly.length < 3) return null

  const { minX, minY, w, h } = bboxOf(poly)
  const pad = Math.max(w, h) * 0.08 + 0.1
  const scale = size / (Math.max(w, h) + pad * 2)

  return (
    <svg className={className} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g
        transform={
          `translate(${(size - w * scale) / 2},${(size - h * scale) / 2}) ` +
          `scale(${scale}) translate(${-minX},${-minY})`
        }
      >
        <polygon
          points={poly.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="var(--brand-wash)"
          stroke="var(--brand)"
          // 图形被 scale 过，描边要除回去才不会跟着一起变粗
          strokeWidth={1 / scale}
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}
