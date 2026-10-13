import { memo } from 'react'
import { tileCenter, tileSvgAttrs } from './paint.js'

/**
 * 一片磁力片。**只吃 tile 与 isNew 两个 prop**，故意这样设计：
 *
 * 选中态和 hover 态都由父层的覆盖层路径单独画，不进这里。
 * 于是 memo 真正生效 —— 拖动、悬停、缩放时这几百个 <g> 一个都不重渲，
 * 只有 tiles 数组本身变了、或者这一片的 isNew 翻了才动。
 *
 * `isNew` 收的是**这一片自己的布尔值**而不是整个 id 集合：父层传集合进来的话，
 * 集合一变、memo 的浅比较就全体失效，一次重解要把几百片全重渲一遍。
 *
 * 所有绘制属性来自 `paint.js` 的 `tileSvgAttrs()`，和导出的 SVG 同源。
 */
function Tile({ tile, isNew = false }) {
  const { path, magnets } = tileSvgAttrs(tile, { nonScalingStroke: true })

  return (
    <g
      className="mc-tile"
      data-tile-id={tile.id}
      data-locked={tile.locked ? '' : undefined}
      data-new={isNew ? '' : undefined}
    >
      <path {...path} />
      {magnets.map((m) => (
        <circle key={`${m.cx}-${m.cy}`} {...m} />
      ))}
      {tile.locked && <LockBadge {...tileCenter(tile.shape, tile.rot, tile.i, tile.j)} />}
    </g>
  )
}

/**
 * 锁角标。**只画在画布上**，不画在导出的成品图与步骤图上 —— 锁定是编辑态的概念
 * （「这一片别动」），不是作品的样子，孩子照搭的步骤图上出现一把把锁只会碍事。
 * 所以它不进 `paint.js` 的 `tileSvgAttrs()`，那里是画布与导出共用的视觉来源。
 *
 * 圆形底片是必需的：片色有深有浅，纯黑的锁在深蓝片上糊成一团。纸色底 + 描边
 * 让它在任何片色上都读得出来，和选中光环垫纸色晕圈是同一个理由。
 */
function LockBadge({ x, y }) {
  return (
    <g className="mc-lock" transform={`translate(${x} ${y})`}>
      <circle className="mc-lock-dot" r={7.6} vectorEffect="non-scaling-stroke" />
      <rect className="mc-lock-body" x={-3.9} y={-0.6} width={7.8} height={5.6} rx={1} />
      <path
        className="mc-lock-shackle"
        d="M-2 0.1 V-1.4 A2 2 0 0 1 2 -1.4 V0.1"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  )
}

export default memo(Tile)
