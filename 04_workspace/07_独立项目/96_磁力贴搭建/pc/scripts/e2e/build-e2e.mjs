/**
 * M6 端到端：**实际搭建**这一页的验收。
 *
 * 计划书 §9 的验收原文：
 *   点一片放上去 → 画布多一片且 analyzeWork 无错 → 锁定它 → 重解 →
 *   **锁定片坐标逐位不变**、其余片变了 → 保存 → work.json 里 locked:true 与
 *   stepsStale:true 都在 → 上传照片 → library/works/<id>/photo-01.* 真在磁盘上、
 *   work.json 里只有引用没有 data URL。
 *
 * 两件不寻常的安排，都是必要的：
 *
 * 1. **夹具是当场跑出来的，不是手写的。** 重解需要一个目标轮廓，而轮廓只有草稿链路
 *    产得出来（`work-fish.json` 没有 `solution.contour`，页面上那个按钮是灰的 ——
 *    这条本身也顺带验了）。所以先跑一遍 Draft 的 mock 多边形分支，再走页面上新加的
 *    「去搭建」按钮过来。这样验的是**真作品怎么进 M6 页面**这条真路，
 *    而不是我给 Build 喂一份手工 JSON。
 *
 * 2. **判据尽量从磁盘读，不从页面读。** 「保存落盘」这件事在页面上看不出真假 ——
 *    页面上那份 JSON 面板显示的是**内存里**的文档。只有 `readFileSync` 才是证据。
 *    同理照片：页面上 `<img>` 显示了不代表文件在 `library/` 里。
 *
 * 会真往 `library/works/` 里写东西（Draft 落盘 + Build 保存 + 照片），
 * **必须配 run-build-e2e.sh 做备份还原**。
 */
import fs from 'node:fs'
import path from 'node:path'

const PORT = process.env.CDP_PORT || 9333
const BASE = process.env.BASE_URL || 'http://localhost:5273'
const PC = path.resolve(import.meta.dirname, '..', '..')
const LIB = path.resolve(PC, '..', 'library')
const PHOTO = process.env.PHOTO || path.join(import.meta.dirname, 'fixtures', 'fixture-photo.png')

/* ---------------- CDP 接线 ---------------- */

async function findTarget() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch { /* chrome 还没起来 */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('连不上 CDP')
}

const cdpTarget = await findTarget()
const ws = new WebSocket(cdpTarget.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

let seq = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id)
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''))
  }
  return r.result.value
}

const results = []
const check = (label, okFlag, detail) => {
  results.push({ label, ok: okFlag })
  console.log(`${okFlag ? '  ok  ' : ' FAIL '} ${label}${detail ? `\n         ${detail}` : ''}`)
}

/* ---------------- 点击 / 读取 ---------------- */

async function box(sel, nth = 0, text = null) {
  return evaluate(`(() => {
    const all = [...document.querySelectorAll(${JSON.stringify(sel)})]
    const list = ${text === null ? 'all' : `all.filter(e => e.textContent.trim().includes(${JSON.stringify(text)}))`}
    const el = list[${nth}]
    if (!el) return null
    el.scrollIntoView({ block: 'center', inline: 'center' })
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return null
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
}

async function click(sel, { nth = 0, text = null, label = sel } = {}) {
  const b = await box(sel, nth, text)
  if (!b) throw new Error(`点不到：${label}`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', clickCount: 1 })
  await sleep(40)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 })
  return b
}

async function escape() {
  for (const type of ['keyDown', 'keyUp']) {
    await send('Input.dispatchKeyEvent', {
      type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
    })
  }
}

/** 页面上的文档（内存里那份）。落盘的判据一律另外从磁盘读。 */
const docOf = async () => JSON.parse(await evaluate(`document.querySelector('.build-pre').textContent`))

/* ---------------- 启动 ---------------- */

await send('Page.enable')
await send('Runtime.enable')
await send('DOM.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1040, deviceScaleFactor: 1, mobile: false })

console.log('='.repeat(74))

/* ============ A. 先跑一遍草稿链路，拿到一份带轮廓的真作品 ============ */

console.log('A. 草稿链路（mock 多边形分支）→ 「去搭建」')
await send('Page.navigate', { url: `${BASE}/produce/draft` })
await sleep(2600)
// 标签页在后台时 Chrome 会把合成的 mousePressed/mouseReleased 整个丢掉
await send('Page.bringToFront')
await sleep(400)
for (let i = 0; i < 40; i += 1) {
  if (await evaluate(`!!document.querySelector('.ant-btn-primary')`)) break
  await sleep(250)
}

const STAGE_STATE = `[...document.querySelectorAll('.stage')].map(s => ({
  name: s.querySelector('.stage__name').textContent,
  state: s.querySelector('.ant-tag').textContent,
  summary: s.querySelector('.stage__summary').textContent,
}))`

async function waitIdle(maxMs = 120_000) {
  const t0 = Date.now()
  for (;;) {
    const stages = await evaluate(STAGE_STATE)
    const running = stages.some((s) => s.state === '进行中')
    const busy = await evaluate(`!!document.querySelector('.ant-btn-loading')`)
    if (!running && !busy) return { stages, ms: Date.now() - t0 }
    if (Date.now() - t0 > maxMs) throw new Error('等太久了，草稿链路没跑完')
    await sleep(500)
  }
}

// 分支默认就是「多边形走通」，但别假设 —— 确认一下（下拉触发器是 .ant-select）
const variantLabel = await evaluate(`document.querySelector('.ant-select-content')?.title ?? ''`)
if (!variantLabel.includes('多边形走通')) {
  await click('.ant-select', { label: '演示分支下拉' })
  await sleep(400)
  await click('.ant-select-item-option', { text: '多边形走通', label: '分支「多边形走通」' })
  await sleep(300)
  await escape()
  await sleep(400)
}
console.log(`     分支 = ${await evaluate(`document.querySelector('.ant-select-content')?.title ?? ''`)}`)

const before = await evaluate(`[...document.querySelectorAll('.stage__summary')].map(e=>e.textContent).join('|')`)
await click('.ant-btn-primary', { label: '跑一遍' })
await sleep(700)
const started = await evaluate(
  `!!document.querySelector('.ant-btn-loading') || [...document.querySelectorAll('.stage .ant-tag')].some(t=>t.textContent==='进行中')`,
)
if (!started) {
  const now = await evaluate(`[...document.querySelectorAll('.stage__summary')].map(e=>e.textContent).join('|')`)
  throw new Error(`点了「跑一遍」但链路没动（${now === before ? '状态一个字都没变' : ''}）`)
}
const r1 = await waitIdle()
r1.stages.forEach((s) => console.log(`     ${s.name.padEnd(4)} ${s.state}  ${s.summary.slice(0, 80)}`))
check('草稿链路五段全部完成（重解要的那份轮廓就是它产出的）',
  r1.stages.every((s) => s.state === '完成'),
  `${(r1.ms / 1000).toFixed(1)}s`)

const savedId = await evaluate(`(() => {
  const m = document.body.innerText.match(/library\\/works\\/(W-[0-9-]+)\\//)
  return m ? m[1] : null
})()`)
check('页面上写出了落盘的 workId', Boolean(savedId), savedId ?? '(没找到)')

const jump = await box('button', 0, '去搭建')
check('落盘阶段末尾有「去搭建」按钮', Boolean(jump))

if (jump) {
  await click('button', { text: '去搭建', label: '去搭建' })
  await sleep(1200)
}
const url = await evaluate(`location.href`)
check('点「去搭建」跳到了 Build 并带着 workId', /\/produce\/build\?work=/.test(url), url)

/* ============ B. M6 验收 ============ */

console.log('\nB. 实际搭建（M6 验收）')
/**
 * ★ 这里必须等到**那个 workId** 出现，不能只等 `.build-pre` 存在。
 *
 * Build 的初始文档是夹具 `work-fish.json`，所以 `.build-pre` 一挂上就有内容、
 * 也有 workId —— 只要「有 workId」就当就绪，会在 `loadWork` 还没回来时往下走，
 * 于是整段 B 其实是在**夹具**上跑的（第一次跑就是这么挂的：页面 W-20260917-001
 * ／ 磁盘 W-20260918-160102）。更坏的是它不会报错：夹具没有轮廓 → 重解按钮是灰的
 * → 点它什么都不发生 → 「锁定片还在」「锁定片的坐标逐位不变」两条**全部通过**，
 * 因为文档压根没动过。**拿旧状态冒充成功的断言比没有断言更危险。**
 */
let loaded = false
for (let i = 0; i < 80; i += 1) {
  loaded = await evaluate(`(() => {
    const pre = document.querySelector('.build-pre')
    if (!pre) return false
    try { return JSON.parse(pre.textContent).workId === ${JSON.stringify(savedId)} } catch { return false }
  })()`)
  if (loaded) break
  await sleep(250)
}
await send('Page.bringToFront')
await sleep(300)
if (!loaded) {
  const flashes = await evaluate(`[...document.querySelectorAll('.ant-message-notice-title')].map(e=>e.textContent).join(' | ')`)
  console.log(`     载入没发生。页面提示：${flashes || '(没有提示)'}`)
}

const boot = await docOf()
check('Build 载入的就是草稿刚产出的那份作品', boot.workId === savedId, `页面 ${boot.workId} ／ 磁盘 ${savedId}`)
check('这份作品带着轮廓（重解按钮的前提）',
  Array.isArray(boot.solution?.contour) && boot.solution.contour.length >= 3,
  `contour ${boot.solution?.contour?.length ?? 0} 个顶点`)
check('画布渲染出来了', await evaluate(`document.querySelectorAll('.mc-tile').length`) === boot.tiles.length,
  `${boot.tiles.length} 片`)

const resolveEnabled = await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('锁定片不动，其余重解'))
  return b ? !b.disabled : false
})()`)
check('重解按钮可用（不再是「这份作品没有轮廓」那种灰）', resolveEnabled)

/* ---------- B 段的公共工具：格 ↔ 屏幕 ---------- */

/** `solution.contour` 的坐标空间是「格」（1 单位 = 1 格），与 t.i / t.j 同尺度 */
const contour = boot.solution?.contour ?? []

/** 射线法。只在 B4 选靶格时用 */
function pointInPoly(px, py) {
  let inside = false
  for (let a = 0, b = contour.length - 1; a < contour.length; b = a++) {
    const [ax, ay] = contour[a]
    const [bx, by] = contour[b]
    if ((ay > py) !== (by > py) && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside
  }
  return inside
}

/**
 * 这一格是不是**严格在轮廓内**：格心、四角、四边中点、四个正邻居的格心全在里面。
 *
 * 只判格心不够。贴着轮廓边界的那一格，格心也可能刚好落在里面，而它有一个角在外面 ——
 * 在那种格上删片换片，溢出的那半格会把 overflow 顶过 OVERFLOW_MAX，于是每一级闸门
 * 都过不去、走 bestEffort 分支。那样测的就变成「求解器怎么处理溢出」，
 * 而不是「锁定片之外的部分被重算了」。
 */
function strictlyInside(i, j) {
  const probes = [
    [i + 0.5, j + 0.5],
    [i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1],
    [i + 0.5, j], [i + 0.5, j + 1], [i, j + 0.5], [i + 1, j + 0.5],
    [i - 0.5, j + 0.5], [i + 1.5, j + 0.5], [i + 0.5, j - 0.5], [i + 0.5, j + 1.5],
  ]
  return probes.every(([x, y]) => pointInPoly(x, y))
}

/** 格心 → 屏幕。正向 CTM（`sx = m.a*x + m.c*y + m.e`），视口是恒等变换，稳 */
async function cellPoint(i, j) {
  return evaluate(`(() => {
    const m = document.querySelector('.mc-svg').querySelector('g').getScreenCTM()
    const x = ${i + 0.5} * 64, y = ${j + 0.5} * 64
    return { x: Math.round(m.a * x + m.c * y + m.e), y: Math.round(m.b * x + m.d * y + m.f) }
  })()`)
}

/**
 * 找一个**真的点得到这一片**的屏幕点。
 *
 * 不能拿包围盒中心去点：三角形和长方形的 bbox 中心可能落在图形外面（三角形尤其），
 * `elementFromPoint` 命中不到它，于是「点不中」被误读成应用没反应。所以在 bbox 里
 * 撒一小组点，逐个问 `elementFromPoint` 落在谁身上，取第一个真的命中的。
 */
async function pointForTile(id) {
  return evaluate(`(() => {
    const el = document.querySelector('[data-tile-id=${JSON.stringify(id)}]')
    if (!el) return null
    const b = el.getBoundingClientRect()
    const fs = [[0.5,0.5],[0.3,0.5],[0.7,0.5],[0.5,0.3],[0.5,0.7],[0.3,0.3],[0.7,0.7],[0.3,0.7],[0.7,0.3]]
    for (const [fx, fy] of fs) {
      const x = Math.round(b.left + b.width * fx), y = Math.round(b.top + b.height * fy)
      const hit = document.elementFromPoint(x, y)
      if (hit && hit.closest && hit.closest('[data-tile-id]') === el) return { x, y }
    }
    return null
  })()`)
}

/** 一次完整的点击。先抖一下再到位 —— 位置没变时 Chrome 一个 mousemove 都不派发 */
async function press(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x - 3, y: y + 3, buttons: 0 })
  await sleep(40)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 })
  await sleep(120)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await sleep(60)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
  await sleep(400)
}

/** 「选中的片」那一栏的正文 —— 点选有没有生效，只有它说了算 */
const selectedText = () => evaluate(`(() => {
  const g = [...document.querySelectorAll('.tool-group')].find(x => x.textContent.includes('选中的片'))
  return g ? g.textContent.replace(/\\s+/g, ' ').trim() : '(找不到「选中的片」那一栏)'
})()`)

const clearToasts = () => evaluate(`(() => { document.querySelectorAll('.ant-message-notice').forEach(n => n.remove()); return true })()`)
const toasts = () => evaluate(`[...document.querySelectorAll('.ant-message-notice-title')].map(e=>e.textContent).join(' | ')`)

/* ---------- B1 点放一片 ---------- */

console.log('\nB1 点一片放上去')

/**
 * 选靶：在屏幕上撒点，用 <g> 的 CTM 反推落在哪个格，只留「空格 + 离格边 ≥8 格单位」的。
 *
 * 优先挑**紧挨着已有片**的空格（有邻居）—— 那样这一放看起来是「往外贴一片」，
 * 而不是在空画布中央戳一片。
 *
 * ★ 但这么挑出来的靶格**必然在轮廓之外**（解是 100% 覆盖，轮廓内一格空的都没有）。
 * 所以这一片只能用来验「点放」这条路，**拿它验重解是验不出来的** —— 锁定一片
 * 轮廓外的片碰不到任何目标原子，求解器会逐位复现原来那一版。重解得另构造，见 B4。
 */
async function pickTargets() {
  return evaluate(`(() => {
    const doc = JSON.parse(document.querySelector('.build-pre').textContent)
    const { cols, rows } = doc.canvas
    const svg = document.querySelector('.mc-svg')
    const g = svg.querySelector('g')
    const r = svg.getBoundingClientRect()
    const inv = g.getScreenCTM().inverse()
    const used = new Set()
    for (const node of document.querySelectorAll('.mc-tile')) {
      const b = node.getBBox()
      for (let i = Math.floor(b.x / 64); i < Math.ceil((b.x + b.width) / 64); i += 1)
        for (let j = Math.floor(b.y / 64); j < Math.ceil((b.y + b.height) / 64); j += 1) used.add(i + ',' + j)
    }
    const hasNeighbor = (i, j) =>
      used.has((i+1)+','+j) || used.has((i-1)+','+j) || used.has(i+','+(j+1)) || used.has(i+','+(j-1))
    const seen = new Set(); const out = []
    for (let sx = r.left + 24; sx < r.right - 24; sx += 28) {
      for (let sy = r.top + 24; sy < r.bottom - 24; sy += 28) {
        const cx = inv.a * sx + inv.c * sy + inv.e
        const cy = inv.b * sx + inv.d * sy + inv.f
        const i = Math.floor(cx / 64), j = Math.floor(cy / 64)
        if (i < 0 || j < 0 || i >= cols || j >= rows) continue
        const key = i + ',' + j
        if (used.has(key) || seen.has(key)) continue
        const margin = Math.min(cx % 64, 64 - (cx % 64), cy % 64, 64 - (cy % 64))
        if (margin < 8) continue
        seen.add(key)
        out.push({ i, j, x: Math.round(sx), y: Math.round(sy), neighbor: hasNeighbor(i, j) })
      }
    }
    // 有邻居的优先，其余按到画布中心距离
    const mid = { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }
    out.sort((a, b) => (b.neighbor - a.neighbor) || (Math.hypot(a.x-mid.x,a.y-mid.y) - Math.hypot(b.x-mid.x,b.y-mid.y)))
    return out
  })()`)
}

/** 幽灵预览画在哪一格（取 d 里最小的 x/y —— 形状不同起笔点可能不是左下角） */
async function ghostCell() {
  return evaluate(`(() => {
    const el = document.querySelector('.mc-place')
    const d = el && el.getAttribute('d')
    if (!d) return null
    const nums = d.match(/-?\\d+(?:\\.\\d+)?/g).map(Number)
    let minX = Infinity, minY = Infinity
    for (let k = 0; k + 1 < nums.length; k += 2) { minX = Math.min(minX, nums[k]); minY = Math.min(minY, nums[k+1]) }
    return { i: Math.round(minX / 64), j: Math.round(minY / 64) }
  })()`)
}

async function moveTo(x, y) {
  // 先抖一下：位置没变时 Chrome 一个 mousemove 都不派发
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x - 3, y: y + 3, buttons: 0 })
  await sleep(40)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 })
  await sleep(130)
}

/** 转到靶上并读幽灵；读到空再移一次（合成事件偶尔被合并/丢掉，是脚本的假 FAIL） */
async function moveAndReadGhost(x, y) {
  for (let n = 0; n < 3; n += 1) {
    const px = x + n
    const py = y - n
    await moveTo(px, py)
    const g = await ghostCell()
    if (g) return { ghost: g, x: px, y: py }
  }
  return { ghost: null, x, y }
}

const targets = await pickTargets()
if (!targets.length) throw new Error('画布上一个空格都找不到，没法点放')
const target = targets[0]
console.log(`     靶格 (${target.i},${target.j}) 屏幕 (${target.x},${target.y}) 有邻居=${target.neighbor}`)

const tilesBefore = boot.tiles.length
const { ghost, x: px, y: py } = await moveAndReadGhost(target.x, target.y)
check('幽灵预览落在光标底下那一格',
  Boolean(ghost) && ghost.i === target.i && ghost.j === target.j,
  ghost ? `幽灵 (${ghost.i},${ghost.j}) ／ 靶 (${target.i},${target.j})` : '幽灵是空的')

await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', clickCount: 1 })
await sleep(60)
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', clickCount: 1 })
await sleep(300)

const afterPlace = await docOf()
const placed = afterPlace.tiles.find((t) => t.i === target.i && t.j === target.j)
check('画布上真的多了一片，且落在靶格', afterPlace.tiles.length === tilesBefore + 1 && Boolean(placed),
  `${tilesBefore} → ${afterPlace.tiles.length} 片` + (placed ? `，新片 ${placed.id}` : '，靶格上没有片'))

const errCount = await evaluate(`document.querySelectorAll('.ant-alert-error').length`)
check('analyzeWork 无错（页面上没有校验错误横幅）', errCount === 0, `.ant-alert-error × ${errCount}`)
check('片一动就置了 stepsStale', afterPlace.stepsStale === true, `stepsStale = ${afterPlace.stepsStale}`)

/* ---------- B2 点一片**已有的**片 = 选中它 ---------- */

console.log('\nB2 点一片已有的片')

/**
 * ★ 这一步验的是本会话修掉的一个真 bug。
 *
 * `MosaicCanvas` 的 `handlePointerUp` 原本是 `if (placing) 放 else if (onSelect) 选`，
 * 而 Build 里 `placing` 恒为真（`editable` 且 `tool` 非空），于是 `onSelect` 那半条分支
 * **一次都走不到**。症状极隐蔽：左栏白纸黑字写着「画布上点一片就选中它」，实际上
 * 已放好的片再也点不中 —— 选中态只能靠「刚放下一片」顺带产生，于是锁定/旋转/删除/改色
 * **全部只对最后放的那一片有效**，而「锁定几片、其余重解」这套主流程从界面上走不到。
 *
 * 它同时是 B4 的前置条件：B4 得先点中一片已有的片，才能把它删掉。
 */
const afterPlaceCount = afterPlace.tiles.length

const clickable = await evaluate(`(() => {
  for (const node of document.querySelectorAll('.mc-tile')) {
    const b = node.getBoundingClientRect()
    const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2)
    const hit = document.elementFromPoint(x, y)
    if (hit && hit.closest && hit.closest('[data-tile-id]') === node) return { id: node.dataset.tileId, x, y }
  }
  return null
})()`)
if (!clickable) throw new Error('圈不出一个「点得到」的片')
await clearToasts()
await press(clickable.x, clickable.y)
const selExisting = await selectedText()
check('点一片已有的片 → 选中它（不是又放一片）', selExisting.includes(clickable.id),
  `点 ${clickable.id} → 选中栏「${selExisting.slice(0, 70)}」`)
check('片数没变（点选不是点放）', (await docOf()).tiles.length === afterPlaceCount, `${afterPlaceCount} 片`)

/* ---------- B3 删除 ---------- */

console.log('\nB3 删除一片')

const placedPt = await pointForTile(placed.id)
if (!placedPt) throw new Error(`点不到刚放的那片 ${placed.id}`)
await press(placedPt.x, placedPt.y)
check('再点回来能选中它', (await selectedText()).includes(placed.id), (await selectedText()).slice(0, 70))

await click('button', { text: '删除', label: '删除按钮' })
await sleep(400)
const afterDelete = await docOf()
check('删除真的把那一片拿掉了',
  afterDelete.tiles.length === afterPlaceCount - 1 && !afterDelete.tiles.some((t) => t.id === placed.id),
  `${afterPlaceCount} → ${afterDelete.tiles.length} 片`)

/* ---------- B4 在轮廓内制造一个「非补不可」的缺口 ---------- */

console.log('\nB4 轮廓内删一片长方形，原地换一个等腰直角三角形')

/**
 * ★ 为什么非得这么绕 —— 这是本测试设计上踩过的最大一个坑。
 *
 * 第一版是「挑个空格放一片、锁上、重解，断言其余片变了」，而那条断言**结构性不可能成立**
 * （27/28 里唯一剩的那个 FAIL）。原因：靶格必然在轮廓之外（解是 100% 覆盖，轮廓内没有空格），
 * 而锁定一片轮廓外的片时 `blocked` 掩码碰不到任何 `fullAtoms` —— 那些原子本来就不在目标集里 ——
 * 于是 `remainingFull` 与不锁时逐位相同，确定性的求解器逐位复现原来那一版，
 * 片集一个字节都不变。
 *
 * 要让「其余片变了」成为**构造上的必然**，锁定片必须与原解**部分重叠**：盖住某个原片的一部分
 * 原子、又不是它的全部。那个原片于是再也放不回来，求解器只能换一种铺法。
 *
 * 做法：挑一格 C，它被一片 **RECT** 盖住（RECT 占两个整格，所以 C 是它的真子集）。
 * 删掉这片 RECT，在 C 上放一个 TRI-R 并锁定。于是 ——
 *   · 原 RECT 的 8 个原子里有 2 个被锁死 → **RECT 不可能重新放回来**
 *   · C 剩下的 2 个象限、RECT 腾出来的另一格，都还在 `fullAtoms` 里非补不可
 *   · 所以「重解后除去锁定片的那一份」**不可能**等于「重解前除去锁定片的那一份」
 *
 * 前提是这份解里有 RECT。房子的 mock 解是 4 个 TRI-R + 7 个 RECT、**一个 SQ 都没有**，
 * 所以「删一个 SQ、原地换 TRI-R」那条更直觉的路子在这儿根本走不通 —— 这是查过真数据
 * 才知道的，照直觉写会写出一个永远挑不到靶的测试。
 */
const cellMap = await evaluate(`(() => {
  const m = {}
  for (const node of document.querySelectorAll('.mc-tile')) {
    const b = node.getBBox()
    const i0 = Math.round(b.x / 64), j0 = Math.round(b.y / 64)
    const i1 = Math.round((b.x + b.width) / 64), j1 = Math.round((b.y + b.height) / 64)
    for (let i = i0; i < i1; i += 1) for (let j = j0; j < j1; j += 1) {
      const k = i + ',' + j
      if (!m[k]) m[k] = []
      m[k].push(node.dataset.tileId)
    }
  }
  return m
})()`)
const cellsOf = (id) =>
  Object.entries(cellMap).filter(([, ids]) => ids.includes(id)).map(([k]) => k.split(',').map(Number))

const hosts = []
for (const [k, ids] of Object.entries(cellMap)) {
  if (ids.length !== 1 || !ids[0].startsWith('RECT-')) continue
  const [i, j] = k.split(',').map(Number)
  if (!strictlyInside(i, j)) continue
  const allIn = cellsOf(ids[0]).every(([a, b]) => strictlyInside(a, b))
  hosts.push({ i, j, rectId: ids[0], allIn, d: (i - boot.canvas.cols / 2) ** 2 + (j - boot.canvas.rows / 2) ** 2 })
}
// 整片都在轮廓内的优先（那样补回来时才不会溢出），其次挑靠画布中心的
hosts.sort((a, b) => (a.allIn === b.allIn ? 0 : a.allIn ? -1 : 1) || a.d - b.d)
if (!hosts.length) throw new Error('轮廓内找不到一格被 RECT 盖住的格 —— B4 构造不出来（解的形状变了？）')
const host = hosts[0]
console.log(`     挑中 ${host.rectId} 的格 (${host.i},${host.j})，整片都在轮廓内 = ${host.allIn}`)

// ① 点中它
const hostPt = await pointForTile(host.rectId)
if (!hostPt) throw new Error(`点不到那片 ${host.rectId}`)
await press(hostPt.x, hostPt.y)
const selHost = await selectedText()
check('点中轮廓内那片长方形', selHost.includes(host.rectId), `选中栏「${selHost.slice(0, 70)}」`)

// ② 删掉它
await click('button', { text: '删除', label: '删除按钮' })
await sleep(400)
const afterRemoveHost = await docOf()
check('删掉这片长方形（两个整格让出来）',
  afterRemoveHost.tiles.length === afterDelete.tiles.length - 1 &&
    !afterRemoveHost.tiles.some((t) => t.id === host.rectId),
  `${afterDelete.tiles.length} → ${afterRemoveHost.tiles.length} 片`)

// ③ 形状换成等腰直角三角形
await click('.tool-shape', { text: '等腰直角三角形', label: '形状「等腰直角三角形」' })
await sleep(350)
const rotChips = await evaluate(`[...document.querySelectorAll('.tool-chip')].map(b => b.textContent.trim()).join(' ')`)
check('切到等腰直角三角形后，朝向有四个', rotChips.includes('90°') && rotChips.includes('270°'), rotChips)
await click('.tool-chip', { nth: 0, label: '朝向 0°' })
await sleep(250)

// ④ 在同一格点放
const hostCellPt = await cellPoint(host.i, host.j)
await press(hostCellPt.x, hostCellPt.y)
await sleep(350)
const afterSwap = await docOf()
const tri = afterSwap.tiles.find((t) => t.i === host.i && t.j === host.j)
check('同一格上放了一个等腰直角三角形（四象限里只盖两个）',
  tri?.shape === 'TRI-R', tri ? `落的是 ${tri.id}` : '那一格还是空的')
check('与其它片没有重叠（页面上没有校验错误横幅）',
  (await evaluate(`document.querySelectorAll('.ant-alert-error').length`)) === 0)

/* ---------- B5 锁定它 ---------- */

console.log('\nB5 锁定它')

const autoSelected = await selectedText()
check('放完自动选中刚放的那片', tri ? autoSelected.includes(tri.id) : false, autoSelected.slice(0, 70))

await click('button', { text: '锁定', label: '锁定按钮' })
await sleep(350)
const afterLock = await docOf()
const lockedTile = afterLock.tiles.find((t) => t.id === tri?.id)
check('那片锁上了', lockedTile?.locked === true, `locked = ${lockedTile?.locked}`)
check('统计栏出现「锁定 N 片」',
  await evaluate(`[...document.querySelectorAll('.ant-tag')].some(t => /锁定 \\d+ 片/.test(t.textContent))`))

const lockedSnapshot = { ...lockedTile }

/* ---------- B6 重解：锁定的不动，其余重算 ---------- */

console.log('\nB6 重解')

const beforeResolve = afterLock.tiles
/** 除锁定片之外的那一份「摆了哪些片」。先归一化顺序，免得只是排列不同就被当成变了 */
const sigOf = (ts) => ts.filter((t) => t.id !== lockedSnapshot.id)
  .map((t) => `${t.shape}/${t.rot}/${t.i},${t.j}`).sort().join(' ')

// 先钉住「按钮真的是活的」。灰的按钮点下去什么都不发生，而后面几条断言
// 会因此全部通过 —— 那是假绿，不是通过。
const resolveReady = await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('锁定片不动，其余重解'))
  return Boolean(b) && !b.disabled
})()`)
check('点之前，重解按钮是活的', resolveReady)
if (!resolveReady) throw new Error('重解按钮是灰的，后面的断言全都会变成假绿 —— 停在这儿')

await click('button', { text: '锁定片不动，其余重解', label: '重解按钮' })

// 判「跑过了」的判据是**片集真的变了**，不是「等够久」也不是「没有 loading」。
// 出现弹框就照确认键点掉，把弹框原文记下来 —— 它本身也是要断言的东西之一。
let modalText = ''
let changed = false
for (let i = 0; i < 60; i += 1) {
  await sleep(300)
  const m = await evaluate(`(() => {
    const c = document.querySelector('.ant-modal-container')
    return c ? c.textContent.replace(/\\s+/g,' ').trim().slice(0, 130) : null
  })()`)
  if (m) {
    modalText = m
    console.log(`     弹了框：${m}`)
    await click('.ant-modal-container button.ant-btn-primary', { label: '框上的确认键' })
    await sleep(700)
  }
  const now = await docOf()
  if (sigOf(now.tiles) !== sigOf(beforeResolve)) { changed = true; break }
}
if (!changed) console.log(`     页面提示：${await toasts()}`)

const afterResolve = await docOf()
const survivor = afterResolve.tiles.find((t) => t.id === lockedSnapshot.id)
check('锁定片还在，且坐标/形状/朝向逐位与重解前相同',
  Boolean(survivor) &&
    survivor.shape === lockedSnapshot.shape && survivor.rot === lockedSnapshot.rot &&
    survivor.i === lockedSnapshot.i && survivor.j === lockedSnapshot.j,
  survivor
    ? `重解前 ${lockedSnapshot.shape}/${lockedSnapshot.rot}/(${lockedSnapshot.i},${lockedSnapshot.j})` +
      ` → 现在 ${survivor.shape}/${survivor.rot}/(${survivor.i},${survivor.j})`
    : `锁定片 ${lockedSnapshot.id} 没了`)
check('锁定片仍然是锁的', survivor?.locked === true, `locked = ${survivor?.locked}`)
check('其余片确实重算了（求解器动过）', sigOf(beforeResolve) !== sigOf(afterResolve.tiles),
  `${beforeResolve.length} 片 → ${afterResolve.tiles.length} 片`)

/**
 * 缺口是「一个三角形盖不满一格」这种正常情形，应当能被正常补上：溢出 0、覆盖 100%、
 * 不弹「判为拼不出来」。弹了就是求解器真有话要说（比如它在这格上找不到合法补法），
 * 得让它响出来，而不是被「反正片集变了」糊过去。
 */
check('重解走的是正常档，没有弹降级/失败框', modalText === '', modalText || '(没弹框)')

/* ---------- B7 保存 ---------- */

console.log('\nB7 保存落盘')

const workPath = path.join(LIB, 'works', boot.workId, 'work.json')

/**
 * 点保存，然后**等磁盘上那份满足条件**。
 *
 * 不写成「点一下 sleep 1.5s 再读」：那样时序一飘就变成假 FAIL（第一次跑
 * B5 就是这么挂的 —— 页面上明明记着照片引用，磁盘上却是空的）。判据放在磁盘上、
 * 并且轮询到为止，才既稳又真的是在验落盘。
 */
async function saveAndWait(predicate, label) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await click('button', { text: '保存', label: '保存按钮' })
    for (let i = 0; i < 20; i += 1) {
      await sleep(300)
      try {
        const d = JSON.parse(fs.readFileSync(workPath, 'utf8'))
        if (predicate(d)) return d
      } catch { /* 还没写出来 */ }
    }
  }
  const toast = await evaluate(`[...document.querySelectorAll('.ant-message-notice-title')].map(e=>e.textContent).join(' | ')`)
  console.log(`     ${label} 没等到。页面提示：${toast || '(没有提示)'}`)
  return JSON.parse(fs.readFileSync(workPath, 'utf8'))
}

const onDisk = await saveAndWait((d) => d.tiles.some((t) => t.locked), '保存 locked')
check('磁盘上的 work.json 里那片是 locked:true',
  onDisk.tiles.some((t) => t.id === lockedSnapshot.id && t.locked === true),
  `${path.join('library/works', boot.workId, 'work.json')}`)
check('磁盘上的 work.json 里 stepsStale:true', onDisk.stepsStale === true, `stepsStale = ${onDisk.stepsStale}`)
check('磁盘上的 tile 数与页面上一致', onDisk.tiles.length === afterResolve.tiles.length,
  `磁盘 ${onDisk.tiles.length} ／ 页面 ${afterResolve.tiles.length}`)
check('磁盘上那份仍然带着轮廓（下次打开还能重解）',
  Array.isArray(onDisk.solution?.contour) && onDisk.solution.contour.length >= 3)

/* ---------- B8 传照片 ---------- */

console.log('\nB8 上传实物照片')

const inputObj = await send('Runtime.evaluate', {
  expression: `document.querySelector('.build-col input[type=file]') || document.querySelector('input[type=file]')`,
  returnByValue: false,
})
if (!inputObj.result?.objectId) throw new Error('页面上找不到 file input')
await send('DOM.setFileInputFiles', { files: [PHOTO], objectId: inputObj.result.objectId })
await sleep(2500)

const afterPhoto = await docOf()
const photos = afterPhoto.assets?.photos ?? []
check('页面上的文档记了这条引用', photos.length === 1, JSON.stringify(photos))
check('引用是 library 根相对路径，不是 data URL（约定 3）',
  photos.length > 0 && !/^data:/.test(photos[0]) && photos[0].startsWith(`works/${boot.workId}/`),
  photos[0] ?? '(没有)')

const fileName = photos[0]?.split('/').pop()
const photoAbs = path.join(LIB, photos[0] ?? '')
check('照片真在磁盘上', Boolean(fileName) && fs.existsSync(photoAbs),
  `${photoAbs} ${fs.existsSync(photoAbs) ? `(${fs.statSync(photoAbs).size} 字节)` : '(不在)'}`)

await saveAndWait((d) => (d.assets?.photos ?? []).length > 0, '保存 photos')
const disk2 = fs.readFileSync(workPath, 'utf8')
const diskPhotos = JSON.parse(disk2).assets?.photos ?? []
check('落盘后 photos 与页面上一致', diskPhotos.length === photos.length && diskPhotos[0] === photos[0],
  JSON.stringify(diskPhotos))
check('落盘的 work.json 里只有引用、没有 data URL（约定 3）',
  !/data:image\//.test(disk2) && diskPhotos.every((x) => !x.startsWith('data:')),
  `文件里没有 data:image/ = ${!/data:image\//.test(disk2)}`)

/* ---------------- 汇总 ---------------- */

console.log(`\n作品 ${boot.workId}  ·  ${path.join(LIB, 'works', boot.workId)}`)
console.log('   ' + fs.readdirSync(path.join(LIB, 'works', boot.workId)).join('  '))

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
if (failed.length) console.log('不过的：\n' + failed.map((f) => `  - ${f.label}`).join('\n'))
process.exit(failed.length ? 1 : 0)
