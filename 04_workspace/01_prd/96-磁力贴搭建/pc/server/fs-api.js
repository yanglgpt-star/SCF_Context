import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// library/ 与 pc/ 平级，是项目的真正资产（可 git 管版本）
export const LIB_ROOT = path.resolve(dirname, '../../library')

const TOP_FILES = new Set(['shapes.json', 'stock.json', 'palette.json', 'topics.json', 'measure.json'])
const WORK_ID = /^[A-Za-z0-9_-]{1,64}$/
const ASSET_FILE = /^[A-Za-z0-9_.-]{1,80}\.(json|png|jpg|jpeg|webp|svg|txt)$/

/** 二进制单文件上限。本地工具不需要传大图，超过就是出错了，别把内存吃光。 */
const MAX_BINARY = 16 * 1024 * 1024

export const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8',
  json: 'application/json; charset=utf-8',
}

// 白名单式路径解析：只放行几个顶层文件、works/<id>/<file> 与 shots/<file>，其余一律拒绝
export function resolveSafe(rel) {
  if (typeof rel !== 'string' || rel.length === 0 || rel.length > 160) return null
  if (rel.includes('..') || rel.startsWith('/')) return null
  if (TOP_FILES.has(rel)) return path.join(LIB_ROOT, rel)

  const seg = rel.split('/')

  // shots/ 放的是实测录入时上传的实物照片。它们不属于任何作品 ——
  // 拍的是「我这套积木长什么样」，是零件体系的佐证材料，不是某个作品的资产。
  // 塞进 works/ 下面会让资产库把它们当成作品列出来。
  if (seg[0] === 'shots') {
    if (seg.length === 1) return path.join(LIB_ROOT, 'shots')
    if (seg.length === 2 && ASSET_FILE.test(seg[1])) return path.join(LIB_ROOT, 'shots', seg[1])
    return null
  }

  if (seg.length === 1 && seg[0] === 'works') return path.join(LIB_ROOT, 'works')
  if (seg[0] !== 'works' || !WORK_ID.test(seg[1] ?? '')) return null
  if (seg.length === 2) return path.join(LIB_ROOT, 'works', seg[1])
  if (seg.length === 3 && ASSET_FILE.test(seg[2])) {
    return path.join(LIB_ROOT, 'works', seg[1], seg[2])
  }
  return null
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

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const route = url.pathname.replace(/^\/+|\/+$/g, '')
  const rel = url.searchParams.get('path') ?? ''

  if (route === 'read' && req.method === 'GET') {
    const abs = resolveSafe(rel)
    if (!abs) return send(res, 400, { ok: false, error: '路径不在白名单内', path: rel })
    try {
      // 顺带把 `mtime` 带回去。资产库要显示「这件作品最后一次保存是什么时候」，
      // 而 `work.json` 的 mtime 就是它 —— 每一条保存路径（草稿落盘、搭建存盘、
      // 步骤存盘）都会重写这份文件。目录的 mtime 做不到这件事：改文件不改父目录的
      // mtime，于是「只改了 work.json」会被显示成很久没动过。
      const [text, stat] = await Promise.all([fs.readFile(abs, 'utf8'), fs.stat(abs)])
      return send(res, 200, { ok: true, path: rel, data: JSON.parse(text), mtime: stat.mtimeMs })
    } catch (err) {
      if (err.code === 'ENOENT') return send(res, 200, { ok: true, path: rel, data: null, missing: true })
      if (err.code === 'EISDIR') return send(res, 400, { ok: false, error: '这是目录，请用 /api/fs/list' })
      return send(res, 500, { ok: false, error: `读取失败：${err.message}` })
    }
  }

  if (route === 'write' && req.method === 'POST') {
    const body = await readBody(req)
    if (body === null) return send(res, 400, { ok: false, error: '请求体不是合法 JSON' })
    const abs = resolveSafe(body.path)
    if (!abs) return send(res, 400, { ok: false, error: '路径不在白名单内', path: body.path })
    try {
      await fs.mkdir(path.dirname(abs), { recursive: true })
      const text = JSON.stringify(body.data, null, 2) + '\n'
      await fs.writeFile(abs, text, 'utf8')
      return send(res, 200, { ok: true, path: body.path, bytes: Buffer.byteLength(text) })
    } catch (err) {
      return send(res, 500, { ok: false, error: `写入失败：${err.message}` })
    }
  }

  // 把 library/ 里的文件**原样**吐给浏览器。`read` 那条路是 JSON.parse 过的，
  // 图片走它必然炸 —— 草稿图、拼贴图、步骤图、实物照片全靠这条路由才显示得出来。
  if (route === 'raw' && req.method === 'GET') {
    const abs = resolveSafe(rel)
    if (!abs) return send(res, 400, { ok: false, error: '路径不在白名单内', path: rel })
    try {
      const buf = await fs.readFile(abs)
      res.statusCode = 200
      res.setHeader('Content-Type', MIME[path.extname(abs).slice(1).toLowerCase()] ?? 'application/octet-stream')
      res.setHeader('Content-Length', buf.length)
      // 同名文件会被反复覆盖（重跑草稿图、重导出拼贴图），缓存住就是给人看旧图
      res.setHeader('Cache-Control', 'no-store')
      return res.end(buf)
    } catch (err) {
      if (err.code === 'ENOENT') return send(res, 404, { ok: false, error: '文件不存在', path: rel })
      if (err.code === 'EISDIR') return send(res, 400, { ok: false, error: '这是目录' })
      return send(res, 500, { ok: false, error: `读取失败：${err.message}` })
    }
  }

  // 浏览器画布导出的 PNG 走这条路存回来。`write` 那条会 JSON.stringify，
  // 把二进制塞进去等于把图片撑大 33% 再存一堆转义码。
  if (route === 'write-binary' && req.method === 'POST') {
    const body = await readBody(req)
    if (body === null) return send(res, 400, { ok: false, error: '请求体不是合法 JSON' })
    const abs = resolveSafe(body.path)
    if (!abs) return send(res, 400, { ok: false, error: '路径不在白名单内', path: body.path })
    if (typeof body.base64 !== 'string' || !body.base64) {
      return send(res, 400, { ok: false, error: 'base64 字段必须是字符串' })
    }
    const buf = Buffer.from(body.base64, 'base64')
    if (buf.length === 0) return send(res, 400, { ok: false, error: 'base64 解不出字节' })
    if (buf.length > MAX_BINARY) {
      return send(res, 413, { ok: false, error: `文件 ${buf.length} 字节，超过上限 ${MAX_BINARY}` })
    }
    try {
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, buf)
      return send(res, 200, { ok: true, path: body.path, bytes: buf.length })
    } catch (err) {
      return send(res, 500, { ok: false, error: `写入失败：${err.message}` })
    }
  }

  if (route === 'list' && req.method === 'GET') {
    const abs = resolveSafe(rel)
    if (!abs) return send(res, 400, { ok: false, error: '路径不在白名单内', path: rel })
    try {
      const entries = await fs.readdir(abs, { withFileTypes: true })
      return send(res, 200, {
        ok: true,
        path: rel,
        entries: entries
          .filter((e) => !e.name.startsWith('.'))
          .map((e) => ({ name: e.name, dir: e.isDirectory() })),
      })
    } catch (err) {
      if (err.code === 'ENOENT') return send(res, 200, { ok: true, path: rel, entries: [] })
      return send(res, 500, { ok: false, error: `列目录失败：${err.message}` })
    }
  }

  return send(res, 404, { ok: false, error: `未知的 fs 路由：${route}` })
}

export function fsApi() {
  return {
    name: 'magnetic-tiles-fs-api',
    configureServer(server) {
      server.middlewares.use('/api/fs', (req, res, next) => {
        handle(req, res).catch((err) => {
          send(res, 500, { ok: false, error: err.message })
        })
        void next
      })
      server.config.logger.info(`  ➜  library: ${LIB_ROOT}`)
    },
  }
}
