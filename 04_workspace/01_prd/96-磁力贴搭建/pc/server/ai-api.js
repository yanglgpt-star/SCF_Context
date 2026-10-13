/**
 * `/api/ai/*` —— 挂在 Vite dev server 上的迷你后端。
 *
 * **这个文件只做两件事：发 HTTP、读写文件。** 提示词、响应解析、轮廓提取全在
 * `src/core/outline/` 里，浏览器侧跑 —— core 是纯函数、不碰 DOM，同一份实现
 * Node 和浏览器都能引，但只引一次比引两次好：两处各有一份，改了一处忘了另一处，
 * 出现的现象是「mock 好用、live 不好用」这种最难查的东西。
 *
 * **它不是 Vite proxy。** proxy 只是把请求原样转发，密钥仍然要出现在浏览器能
 * 够到的地方；这里是 Node 侧组装请求，密钥从头到尾没进过浏览器 bundle。
 *
 * ## 关于方舟的字段，哪些是验过的、哪些是猜的
 *
 * 账号上模型**一个都没开通**（一律 `ModelNotOpen`），所以 live 路径一次都没跑通过。
 * 我验过的只有：接口是 OpenAI 兼容、认证是 `Authorization: Bearer <key>`、
 * `/images/generations` 与 `/chat/completions` 两个路径。**没验过的**：`size` 收
 * 哪些值、`response_format` 认不认 `b64_json`、`watermark`/`seed` 在不在、
 * 视觉的消息体是 `content` 数组还是字符串。这些一律走 `postArk()` 的
 * **逐级摘字段重试**：被 400 拒就摘掉最可疑的一个再发，最多退三轮。
 * 最坏情况是损失三次请求，而不是「第一次真调用就挂」。
 *
 * mock 夹具是**手写的**，不是抓下来的真实响应 —— 模型没开通，抓不到。
 * 夹具里的 `_fixture.honest` 写了这件事，别当成真实数据用。
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseImageResponse } from '../src/core/outline/parse.js'
import { MIME, resolveSafe } from './fs-api.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const MOCK_DIR = path.join(dirname, '../src/mock/ai')

const ARK_BASE = 'https://ark.cn-beijing.volces.com/api/v3'
const DEFAULT_IMAGE_MODEL = 'doubao-seedream-5-0-pro-260628'
const DEFAULT_VISION_MODEL = 'doubao-seed-2-1-pro-260915'

const LIVE_TIMEOUT = 120_000
/** mock 下假装干活的时间。让前端真的走一遍「提交 → 轮询 → 完成」，而不是一提交就好了。 */
const MOCK_DELAY = 400

const JOB_TTL = 10 * 60 * 1000

/** 被 400 拒时按这个顺序往下一级退，每退一级少发一个字段。 */
const DROPPABLE = ['size', 'response_format', 'watermark', 'seed']

/**
 * mock 的夹具表。`variant` 只是页面上的**演示开关**（用来把「多边形被拒退到掩码」
 * 「AI 回了坏数据」这些分支主动演出来），live 完全忽略它 —— 它不是接口的一部分，
 * 是一个测试钩子。四个分支各对应链路里会真实发生的一种结果：
 *
 *   polygon      多边形走通
 *   mask         多边形被拒 → 掩码兜底
 *   unsnappable  多边形被拒且没给掩码 → 整条链路在这里失败（extract 的 ok:false）
 *   text         回复里根本没有 JSON（parse 层就断了）
 */
const FIXTURES = {
  polygon: 'vision-polygon.json',
  mask: 'vision-mask.json',
  unsnappable: 'vision-unsnappable.json',
  text: 'vision-text.json',
}

function resolveConfig(env) {
  return {
    mode: String(env.AI_MODE ?? 'mock').toLowerCase() === 'live' ? 'live' : 'mock',
    key: env.ARK_API_KEY ?? '',
    imageModel: env.ARK_IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL,
    visionModel: env.ARK_VISION_MODEL ?? DEFAULT_VISION_MODEL,
  }
}

/**
 * 画布比例 → 出图尺寸。**这是猜的**（见文件头），所以它排在 `DROPPABLE` 第一位。
 * 取 1024 作短边、按比例算长边、对齐到 64 的倍数 —— 常见的文生图尺寸都是 64 的倍数。
 */
function pickSize(cols, rows) {
  const long = Math.round((1024 * Math.max(cols, rows)) / Math.min(cols, rows) / 64) * 64
  const size = Math.min(Math.max(long, 512), 2048)
  return cols >= rows ? `${size}x1024` : `1024x${size}`
}

function send(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(body)
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** 方舟的报错有好几种形状，全部归一成一句人话。`ModelNotOpen` 这种码要留着，它是可行动的。 */
function arkError(payload, status) {
  const e = payload?.error
  if (typeof e === 'string') return e
  if (e?.message) return e.code ? `${e.code}：${e.message}` : e.message
  if (typeof payload?.message === 'string') return payload.message
  return `HTTP ${status}`
}

/**
 * 带逐级摘字段重试的 POST。
 *
 * 400 是「你发的字段我不认」，不是「你的请求内容有问题」—— 前者能靠少发字段绕过，
 * 后者不能。所以只对 400 重试，401/403（密钥）、429（限流）、5xx（服务端）直接抛。
 */
async function postArk(url, payload, cfg, label, logger) {
  const dropped = []
  for (let round = 0; round <= DROPPABLE.length; round += 1) {
    const body = { ...payload }
    for (const field of DROPPABLE.slice(0, round)) delete body[field]

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LIVE_TIMEOUT),
    })

    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      /* 非 JSON 的错误页（网关 502 之类），下面按 text 报 */
    }

    if (res.ok) {
      if (round > 0) logger?.warn(`  ⚠ ${label}：摘掉 [${dropped.join(', ')}] 之后成功了，把这几项从请求里去掉`)
      return { json, body }
    }

    if (res.status === 400 && round < DROPPABLE.length) {
      dropped.push(DROPPABLE[round])
      logger?.warn(`  ⚠ ${label}：400 ${arkError(json, res.status)}，摘掉 ${DROPPABLE[round]} 重试`)
      continue
    }

    throw new Error(`${label} 失败：${arkError(json, res.status) || text.slice(0, 200)}`)
  }
  throw new Error(`${label} 失败：把可选字段全摘光了还是被拒`)
}

/* ------------------------------------------------------------------ 任务表 --- */

function newJobs() {
  const jobs = new Map()
  return {
    get: (id) => jobs.get(id),
    create(mode) {
      const now = Date.now()
      for (const [id, job] of jobs) if (now - job.touchedAt > JOB_TTL) jobs.delete(id)
      const id = `J-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      const job = { id, mode, status: 'pending', file: null, error: null, startedAt: now, touchedAt: now }
      jobs.set(id, job)
      return job
    },
  }
}

/* -------------------------------------------------------------- 两个动作 --- */

/**
 * 出草稿图。返回 library/ 相对路径 —— **URL 不出服务端**。
 * 临时链接有 TTL，交给浏览器就等于多一个会过期的东西；而且图终究要落到
 * `works/<id>/` 里，绕一圈没有意义。
 */
async function generateDraft(job, { workId, prompt, cols, rows, seed }, cfg, logger) {
  const size = pickSize(cols, rows)

  if (cfg.mode === 'mock') {
    await new Promise((r) => setTimeout(r, MOCK_DELAY))
    const fixture = await fs.readFile(path.join(MOCK_DIR, 'draft.svg'), 'utf8')
    const rel = `works/${workId}/draft.svg`
    const abs = resolveSafe(rel)
    if (!abs) throw new Error(`workId 不合法：${workId}`)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, fixture, 'utf8')
    await dropSibling(abs, '.png')
    return { file: rel, bytes: Buffer.byteLength(fixture), note: 'mock 夹具（手绘的房子，不是模型出的图）' }
  }

  if (!cfg.key) throw new Error('AI_MODE=live 但 ARK_API_KEY 是空的。密钥放 pc/.env.local，别提交。')

  const { json } = await postArk(
    `${ARK_BASE}/images/generations`,
    { model: cfg.imageModel, prompt, size, response_format: 'b64_json', watermark: false, ...(seed ? { seed } : {}) },
    cfg,
    '文生图',
    logger,
  )

  const found = parseImageResponse(json)
  if (!found) throw new Error(`文生图的响应里找不到图片：${JSON.stringify(json).slice(0, 300)}`)

  let buf
  if (found.kind === 'b64') {
    buf = Buffer.from(found.value, 'base64')
  } else {
    const imgRes = await fetch(found.value, { signal: AbortSignal.timeout(LIVE_TIMEOUT) })
    if (!imgRes.ok) throw new Error(`下载草稿图失败：HTTP ${imgRes.status}`)
    buf = Buffer.from(await imgRes.arrayBuffer())
  }
  if (buf.length === 0) throw new Error('草稿图是 0 字节')

  const rel = `works/${workId}/draft.png`
  const abs = resolveSafe(rel)
  if (!abs) throw new Error(`workId 不合法：${workId}`)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, buf)
  await dropSibling(abs, '.svg')
  return { file: rel, bytes: buf.length }
}

/** 同一份作品换模式重跑时，别把上一种格式的草稿留在目录里 —— 两个 draft 文件没法分辨谁是真的。 */
async function dropSibling(abs, ext) {
  const other = abs.replace(/\.(png|svg)$/i, ext)
  if (other === abs) return
  await fs.unlink(other).catch(() => {})
}

/** 视觉理解：把图发给模型，**原文返回**，解析交给浏览器侧的 core 做。 */
async function readContour({ imagePath, prompt, variant }, cfg, logger) {
  if (cfg.mode === 'mock') {
    await new Promise((r) => setTimeout(r, MOCK_DELAY))
    const file = FIXTURES[variant] ?? FIXTURES.polygon
    const raw = JSON.parse(await fs.readFile(path.join(MOCK_DIR, file), 'utf8'))
    // **原样返回整份响应，不做任何预处理。** 夹具就是一个「方舟当时这么回的」的快照，
    // 所以它必须和 live 走完全相同的那条路：parseChatText → firstJsonObject。
    // 早先这里返回的是夹具里的 text 字段，等于替客户端把 choices 拆好了 —— 结果
    // firstJsonObject 挖到的是夹具最外层那个对象，多边形和掩码一个都取不到。
    // mock 存在的意义就是证明 live 那条路能通，它一旦走捷径就什么都证明不了。
    return { raw, model: `mock:${file}`, usage: raw.usage ?? null, requestId: raw.id ?? 'mock' }
  }

  if (!cfg.key) throw new Error('AI_MODE=live 但 ARK_API_KEY 是空的。密钥放 pc/.env.local，别提交。')

  const abs = resolveSafe(imagePath)
  if (!abs) throw new Error(`图片路径不在白名单内：${imagePath}`)
  const bytes = await fs.readFile(abs)
  const mime = MIME[path.extname(abs).slice(1).toLowerCase()] ?? 'image/png'
  const dataUri = `data:${mime};base64,${bytes.toString('base64')}`

  const { json } = await postArk(
    `${ARK_BASE}/chat/completions`,
    {
      model: cfg.visionModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUri } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    },
    cfg,
    '视觉理解',
    logger,
  )

  return { raw: json, model: json?.model ?? cfg.visionModel, usage: json?.usage ?? null, requestId: json?.id ?? null }
}

/* ----------------------------------------------------------------- 路由 --- */

async function handle(req, res, cfg, jobs, logger) {
  const url = new URL(req.url, 'http://localhost')
  const route = url.pathname.replace(/^\/+|\/+$/g, '')

  // 页面靠这条把「当前是 mock 还是 live」显示出来。密钥只报有没有，不报值。
  if (route === 'status' && req.method === 'GET') {
    return send(res, 200, {
      ok: true,
      mode: cfg.mode,
      imageModel: cfg.imageModel,
      visionModel: cfg.visionModel,
      hasKey: Boolean(cfg.key),
      fixtureDir: cfg.mode === 'mock' ? 'src/mock/ai/' : null,
    })
  }

  if (route === 'imagegen' && req.method === 'POST') {
    const body = await readBody(req)
    if (body === null) return send(res, 400, { ok: false, error: '请求体不是合法 JSON' })
    if (!body.workId || !body.prompt) {
      return send(res, 400, { ok: false, error: 'workId 和 prompt 都是必填的' })
    }

    const job = jobs.create(cfg.mode)
    job.status = 'running'
    // 不 await：任务在后台跑，前端拿着 jobId 轮询。
    generateDraft(job, body, cfg, logger)
      .then((result) => {
        job.status = 'done'
        job.file = result.file
        job.bytes = result.bytes
        job.note = result.note ?? null
      })
      .catch((err) => {
        job.status = 'failed'
        job.error = err.message
        logger?.error(`  ✗ 草稿图生成失败：${err.message}`)
      })
      .finally(() => {
        job.touchedAt = Date.now()
      })

    return send(res, 202, { ok: true, jobId: job.id, mode: cfg.mode })
  }

  const jobMatch = route.match(/^jobs\/([A-Za-z0-9-]{1,64})$/)
  if (jobMatch && req.method === 'GET') {
    const job = jobs.get(jobMatch[1])
    if (!job) return send(res, 404, { ok: false, error: '没有这个任务（服务重启过？任务只活在内存里）' })
    job.touchedAt = Date.now()
    return send(res, 200, {
      ok: true,
      jobId: job.id,
      status: job.status,
      mode: job.mode,
      file: job.file,
      bytes: job.bytes ?? null,
      note: job.note ?? null,
      error: job.error,
      ms: job.status === 'pending' || job.status === 'running' ? Date.now() - job.startedAt : job.touchedAt - job.startedAt,
    })
  }

  if (route === 'vision' && req.method === 'POST') {
    const body = await readBody(req)
    if (body === null) return send(res, 400, { ok: false, error: '请求体不是合法 JSON' })
    if (!body.imagePath || !body.prompt) {
      return send(res, 400, { ok: false, error: 'imagePath 和 prompt 都是必填的' })
    }
    const t0 = Date.now()
    try {
      const r = await readContour(body, cfg, logger)
      return send(res, 200, {
        ok: true,
        mode: cfg.mode,
        model: r.model,
        requestId: r.requestId,
        usage: r.usage,
        // mock 和 live 都是整份响应原文，客户端一律 parseChatText → firstJsonObject。
        // 两者在客户端看来必须**完全一样**，不然 mock 通过不代表 live 通过。
        raw: r.raw,
        ms: Date.now() - t0,
      })
    } catch (err) {
      logger?.error(`  ✗ 视觉理解失败：${err.message}`)
      return send(res, 502, { ok: false, error: err.message })
    }
  }

  return send(res, 404, { ok: false, error: `未知的 ai 路由：${route}` })
}

export function aiApi(env = {}) {
  const cfg = resolveConfig(env)
  const jobs = newJobs()
  return {
    name: 'magnetic-tiles-ai-api',
    configureServer(server) {
      const logger = server.config.logger
      logger.info(
        cfg.mode === 'mock'
          ? '  ➜  AI: mock（走 src/mock/ai/ 的夹具，不发任何请求）'
          : `  ➜  AI: live  image=${cfg.imageModel}  vision=${cfg.visionModel}`,
      )
      if (cfg.mode === 'live' && !cfg.key) {
        logger.warn('  ⚠ AI_MODE=live 但 ARK_API_KEY 是空的，/api/ai 的请求会全部失败！')
      }
      server.middlewares.use('/api/ai', (req, res) => {
        handle(req, res, cfg, jobs, logger).catch((err) => {
          send(res, 500, { ok: false, error: err.message })
        })
      })
    },
  }
}
