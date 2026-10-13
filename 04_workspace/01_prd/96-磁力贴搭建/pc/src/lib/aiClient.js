/**
 * AI 调用的浏览器客户端。仿 `fsClient.js`。
 *
 * 三件事要记住：
 *   1. **这里没有任何密钥**，也不该有。密钥在 Node 侧（`server/ai-api.js`）。
 *   2. **接口按 job 形态设计**（提交 → 轮询），哪怕方舟本身是同步的。
 *      将来换成即梦那种真异步的 provider，前端一行都不用改。
 *   3. **提示词在这里组装、响应在这里解析**，服务端只负责收发和落盘。
 *      `src/core/outline/` 是纯函数，两边都能引，但只引一次好过引两次。
 */

const BASE = '/api/ai'

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
    // 中间件没挂上时会返回 index.html，统一按失败处理
  }

  if (!res.ok || !payload?.ok) {
    throw new Error(payload?.error || `请求失败（HTTP ${res.status}）`)
  }
  return payload
}

const post = (route, body) =>
  request(`${BASE}/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export const aiClient = {
  /** 当前是 mock 还是 live、用的哪个模型、密钥有没有。密钥的值永远不返回。 */
  status: () => request(`${BASE}/status`),

  /**
   * 提交出图任务，返回 `{ jobId, mode }`。**不返回图片** —— 图在 Node 侧直接写进
   * `library/works/<id>/`，前端拿到的只是一个相对路径。
   */
  imagegen: (body) => post('imagegen', body),

  job: (jobId) => request(`${BASE}/jobs/${encodeURIComponent(jobId)}`),

  /**
   * 视觉理解。`variant` 只在 mock 下有意义（用来挑夹具），live 会忽略它 ——
   * 页面要能演示「多边形被拒、退到掩码」这条路，不能只在测试台里存在。
   */
  vision: (body) => post('vision', body),
}

/**
 * 轮询到任务结束。返回最终那次 job 的状态。
 *
 * 用 `setTimeout` 递归而不是 `setInterval`：请求本身有耗时，固定间隔会在
 * 服务端慢的时候堆起一串并发请求。`signal` 让调用方能在组件卸载时停掉它。
 */
export async function pollJob(jobId, { intervalMs = 700, timeoutMs = 180_000, signal, onTick } = {}) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (signal?.aborted) throw new Error('已取消')
    const job = await aiClient.job(jobId)
    onTick?.(job)
    if (job.status === 'done' || job.status === 'failed') return job
    if (Date.now() > deadline) throw new Error(`等了 ${Math.round(timeoutMs / 1000)} 秒还没出图`)
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}
