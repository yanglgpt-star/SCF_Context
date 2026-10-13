/**
 * 上传实物照片的三条共同规则 —— 实测录入页与搭建页的照片回填共用这一份。
 *
 * 抽出来的理由不是「省几行」：这两个页面的拒绝理由必须**一模一样**。同一个文件
 * 在一个页面收得下、在另一个页面收不下，是没有人能解释的行为，而它一旦出现，
 * 排查方向会被引向「是不是我的照片有问题」——错的方向。
 */

export const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** 15MB。再大就是没压过的高像素原图，本地工具不需要，也会把 base64 请求撑爆 */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024

export const PHOTO_ACCEPT = Object.keys(EXT_BY_TYPE).join(',')

/** 收不下就给一句能照做的话，收得下返回 null */
export function photoReject(file) {
  if (!EXT_BY_TYPE[file.type]) {
    return `只认 jpg / png / webp，这个是「${file.type || '未知类型'}」`
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return `照片 ${(file.size / 1024 / 1024).toFixed(1)}MB，超过 15MB 上限 —— 压一下再传`
  }
  return null
}

/**
 * `FileReader.readAsDataURL` 的结果是 `data:image/png;base64,XXXX`，
 * 逗号前面那截是 MIME 头，服务端只要逗号后面的裸 base64。
 *
 * 不用 `btoa` 自己编码：那条路要先把 File 读成 ArrayBuffer 再逐字节转字符串，
 * 而 `readAsDataURL` 是浏览器原生实现，大图快得多。
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读不出这个文件'))
    reader.onload = () => {
      const s = String(reader.result)
      const comma = s.indexOf(',')
      resolve(comma >= 0 ? s.slice(comma + 1) : s)
    }
    reader.readAsDataURL(file)
  })
}
