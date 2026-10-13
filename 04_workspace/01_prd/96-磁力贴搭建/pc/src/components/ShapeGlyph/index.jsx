const GLYPHS = {
  SQ: <rect x="3.5" y="3.5" width="17" height="17" rx="1.8" />,
  'TRI-R': <path d="M3.5 20.5 3.5 3.5 20.5 20.5Z" />,
  RECT: <rect x="1.5" y="7.5" width="21" height="9" rx="1.8" />,
  'TRI-E': <path d="M12 3.5 20.5 18.5H3.5Z" />,
  SECTOR: <path d="M4 20V4a16 16 0 0 1 16 16Z" />,
  SEMI: <path d="M4 18a8 8 0 0 1 16 0Z" />,
}

/** 形状缩略图。按 id 查表，未登记的 id 画一个虚线空位，不猜形状。 */
export default function ShapeGlyph({ id, size = 30, color = 'var(--ink-2)', strokeWidth = 1.6 }) {
  const glyph = GLYPHS[id]

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {glyph ? (
        <g fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round">
          {glyph}
        </g>
      ) : (
        <rect
          x="3.5"
          y="3.5"
          width="17"
          height="17"
          rx="1.8"
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray="3 3"
        />
      )}
    </svg>
  )
}
