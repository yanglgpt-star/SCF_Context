/**
 * 磁力片颜色 —— 这是**作品数据**，不是界面配色，所以放在 core 里。
 * theme.js 从这里取，页面不要另写一份。
 *
 * 顺序就是色卡在界面上的顺序：先原色，后中性色。
 */
export const TILE_PALETTE = {
  红: '#E8443A',
  橙: '#F08A24',
  黄: '#F5C518',
  绿: '#4CAF50',
  蓝: '#2E7DD1',
  紫: '#8E5BB5',
  粉: '#F06292',
  白: '#FFFFFF',
  黑: '#2B2B2B',
}

export const COLOR_NAMES = Object.keys(TILE_PALETTE)

export function isKnownColor(name) {
  return Object.prototype.hasOwnProperty.call(TILE_PALETTE, name)
}

/** 取颜色值时给个兜底色，避免一个手滑的颜色名让整片画不出来 */
export function colorHex(name, fallback = '#C9C5BA') {
  return TILE_PALETTE[name] ?? fallback
}
