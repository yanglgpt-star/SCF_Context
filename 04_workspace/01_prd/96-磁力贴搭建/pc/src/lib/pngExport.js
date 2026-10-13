/**
 * SVG 字符串 → PNG。
 *
 * 走的是一条**故意绕远**的路：SVG → Blob → `<img>` → canvas → base64。
 * 直接 `canvas.drawImage(svgElement)` 是画不出来的，把 `<foreignObject>` 塞进 canvas
 * 也画不出来；浏览器唯一肯帮你栅格化 SVG 的入口就是 `<img>`（或者 CSS background），
 * 所以这里必须绕这一圈。
 *
 * **尺寸不在这里定。** `buildExportSvg` 已经把 `width`/`height` 按倍数算好了，
 * 这里只负责把那个尺寸原样搬进 canvas —— 出多大的图是一件事，栅格化是另一件事，
 * 掺在一起就会出现「改了导出尺寸，PNG 也跟着糊了」这种找不着北的问题。
 */

/** base64 前面那截 `data:image/png;base64,` 的长度不固定，用 indexOf 切 */
const stripDataUrl = (url) => {
  const comma = url.indexOf(',')
  return comma < 0 ? url : url.slice(comma + 1)
}

/**
 * @param {string} svgString  `buildExportSvg()` 的输出
 * @returns {Promise<{ base64: string, width: number, height: number, bytes: number }>}
 */
export async function svgToPng(svgString) {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  try {
    const img = new Image()
    img.decoding = 'sync'
    await new Promise((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('SVG 解析失败（多半是字符串里有没转义的字符）'))
      img.src = url
    })

    // SVG 带显式 width/height 时浏览器会给naturalWidth；万一没有就退回 2 倍画布
    const width = img.naturalWidth || img.width
    const height = img.naturalHeight || img.height
    if (!width || !height) throw new Error('SVG 没有可用的尺寸（缺 width/height？）')

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    // SVG 背景是自己画的（buildExportSvg 第一层就是底色 rect），
    // 但万一哪层漏了，白底比透明底安全 —— 透明 PNG 发到微信会变成黑框
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)

    const dataUrl = canvas.toDataURL('image/png')
    const base64 = stripDataUrl(dataUrl)
    return { base64, width, height, bytes: Math.floor((base64.length * 3) / 4) }
  } finally {
    // 不 revoke 就是一块赖着不走的内存。放 finally 里，出错也要清。
    URL.revokeObjectURL(url)
  }
}
