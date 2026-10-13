/**
 * library/ 磁盘文件的读写客户端。
 *
 * 走 Vite dev 中间件 /api/fs/*（见 server/fs-api.js），
 * 浏览器只能碰白名单内的路径，写不到别处去。
 */

const BASE = '/api/fs'

/**
 * 文本 → base64（不带 data: 前缀）。给 `writeBinary` 用。
 *
 * `btoa` 只吃 latin1，字符串里一旦有非 ASCII 就抛 —— 而导出 SVG 里现在就有中文
 * （步骤图的标题与进度数字），所以必须先过一遍 UTF-8。
 *
 * 放在这里而不是各个页面各写一份：它存在的唯一理由是 `write-binary` 那条路
 * 收 base64，而文本文件走 `write` 会被 JSON.stringify（一份 SVG 存成带引号和
 * `\n` 的 JSON 字符串，之后没有工具读得懂）。
 */
export function toBase64(text) {
  let bin = ''
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b)
  return btoa(bin)
}

async function request(url, init) {
  let res
  try {
    res = await fetch(url, init)
  } catch (err) {
    throw new Error(`连不上开发服务器：${err.message}`)
  }

  let payload = null
  try {
    payload = await res.json()
  } catch {
    // 中间件没挂上时会返回 index.html，这里统一按失败处理
  }

  if (!res.ok || !payload?.ok) {
    throw new Error(payload?.error || `请求失败（HTTP ${res.status}）`)
  }
  return payload
}

export const fsClient = {
  /**
   * `mtime` 是文件最后写入时间（epoch ms），拿不到就是 `null`。
   * 只有 `work.json` 这类会被反复覆盖的文件读它才有意义 —— 资产库用它显示
   * 「最后一次保存」，所以它进的是**展示**而不是任何判据。
   */
  async read(path) {
    const { data, missing, mtime } = await request(`${BASE}/read?path=${encodeURIComponent(path)}`)
    return { data, missing: Boolean(missing), mtime: mtime ?? null }
  },

  async write(path, data) {
    const { bytes } = await request(`${BASE}/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, data }),
    })
    return bytes
  },

  async list(path) {
    const { entries } = await request(`${BASE}/list?path=${encodeURIComponent(path)}`)
    return entries
  },

  /**
   * 图片、字体这类二进制文件的地址，直接丢给 `<img src>` 用。
   *
   * 给的是 URL 不是字节，因为让浏览器自己去取是对的：它会把图缓存进
   * 解码器、按需要解码、`onError` 还能给出可读的失败。走 fetch + blob URL
   * 多一层生命周期要管（blob 不 revoke 就是内存泄漏），换来的只是一个
   * 我们并不需要的「能读到字节」。
   *
   * 路径后面挂一个 `t=` 打破缓存：同一个作品反复重跑草稿图时，文件名不变、
   * 内容在变，浏览器会拿旧图。服务端那条 `no-store` 管的是 HTTP 缓存，
   * React 重渲染时 `src` 字符串没变的话压根不会重新请求。
   */
  readRawUrl(path, bust = 0) {
    const q = `path=${encodeURIComponent(path)}${bust ? `&t=${bust}` : ''}`
    return `${BASE}/raw?${q}`
  },

  /** 存浏览器画布导出的 PNG（base64，不带 data: 前缀）。 */
  async writeBinary(path, base64) {
    const { bytes } = await request(`${BASE}/write-binary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, base64 }),
    })
    return bytes
  },
}
