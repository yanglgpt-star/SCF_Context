/**
 * M7 端到端：**步骤拆解**这一页的验收。
 *
 * 计划书 §M7 的验收原文：
 *   四个策略产出的序列都通过 firstDisconnectedStep（bench 管）；
 *   步骤恰好划分片集（bench 管）；
 *   **步骤图与 work.json 100% 一致** —— 而「一致」这件事只有把图真的写出来、
 *   再从盘上读回来比对才算数，这一条是这里的主要工作。
 *
 * bench:steps 里那条「assets.stepImages ↔ 磁盘」的核对**一直是空过的**：盘上
 * 15 个作品目录一个带步骤的都没有。这个脚本正好把它变成真的 —— 它当场跑一遍草稿
 * 链路造一份新作品、拆解、保存，于是盘上终于有了带步骤的作品。跑完 runner 会把
 * 整个 library/works/ 还原掉，所以那份是临时的。
 *
 * 判据一律从磁盘读。页面上那份 JSON 面板显示的是**内存里**的文档，
 * 而「图有没有真的落盘、内容对不对」在页面上根本看不出来。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const PORT = process.env.CDP_PORT || 9333
const BASE = process.env.BASE_URL || 'http://localhost:5273'
const PC = path.resolve(import.meta.dirname, '..', '..')
const LIB = path.resolve(PC, '..', 'library')

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

/** 选一个 antd Select 的值。触发器是 `.ant-select`，选项是 `.ant-select-item-option` */
async function pickSelect(selectSel, optionText, label) {
  await click(selectSel, { label })
  await sleep(350)
  const b = await box('.ant-select-item-option', 0, optionText)
  if (!b) {
    await escape()
    throw new Error(`下拉里没有「${optionText}」`)
  }
  await click('.ant-select-item-option', { text: optionText, label: `选项「${optionText}」` })
  await sleep(300)
  await escape()
  await sleep(250)
}

/** 步骤列表现在的样子 */
const stepsOf = () => evaluate(`[...document.querySelectorAll('.solve-item')].map(el => ({
  no: Number(el.firstElementChild.textContent),
  caption: el.querySelector('.solve-name').textContent,
  prog: el.querySelector('.solve-meta .mono').textContent.trim(),
  on: el.classList.contains('is-on'),
}))`)

/** 最后一条页面提示的文字。策略名只在这里出现过，所以它是接线唯一的证据。 */
const latestToast = () => evaluate(`(() => {
  const all = [...document.querySelectorAll('.ant-message-notice-title')]
  return all.length ? all[all.length - 1].textContent : ''
})()`)

/** 画布上现在画了几片、其中几片带本步描边 */
const canvasOf = () => evaluate(`({
  drawn: document.querySelectorAll('.mc-tile').length,
  isNew: document.querySelectorAll('.mc-tile[data-new]').length,
})`)

const diskWork = (id) => JSON.parse(fs.readFileSync(path.join(LIB, 'works', id, 'work.json'), 'utf8'))
const workDir = (id) => path.join(LIB, 'works', id)

/* ---------------- 启动 ---------------- */

await send('Page.enable')
await send('Runtime.enable')
await send('DOM.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1040, deviceScaleFactor: 1, mobile: false })

console.log('='.repeat(74))

/* ============ A. 先造一份真作品 ============ */

console.log('A. 草稿链路（mock 多边形分支）造一份新作品')

await send('Page.navigate', { url: `${BASE}/produce/draft` })
await sleep(2600)
await send('Page.bringToFront')
await sleep(400)
for (let i = 0; i < 40; i += 1) {
  if (await evaluate(`!!document.querySelector('.ant-btn-primary')`)) break
  await sleep(250)
}

const STAGE_STATE = `[...document.querySelectorAll('.stage')].map(s => ({
  name: s.querySelector('.stage__name').textContent,
  state: s.querySelector('.ant-tag').textContent,
}))`

async function waitDraft(maxMs = 120_000) {
  const t0 = Date.now()
  for (;;) {
    const stages = await evaluate(STAGE_STATE)
    const running = stages.some((s) => s.state === '进行中')
    const busy = await evaluate(`!!document.querySelector('.ant-btn-loading')`)
    if (!running && !busy) return stages
    if (Date.now() - t0 > maxMs) throw new Error('等太久了，草稿链路没跑完')
    await sleep(500)
  }
}

const variantLabel = await evaluate(`document.querySelector('.ant-select-content')?.title ?? ''`)
if (!variantLabel.includes('多边形走通')) {
  await pickSelect('.ant-select', '多边形走通', '演示分支下拉')
}

await click('.ant-btn-primary', { label: '跑一遍' })
await sleep(700)
const started = await evaluate(
  `!!document.querySelector('.ant-btn-loading') || [...document.querySelectorAll('.stage .ant-tag')].some(t=>t.textContent==='进行中')`,
)
if (!started) throw new Error('点了「跑一遍」但链路没动')
const stages = await waitDraft()
check('草稿链路五段全部完成', stages.every((s) => s.state === '完成'),
  stages.map((s) => `${s.name}:${s.state}`).join(' '))

const ID = await evaluate(`(() => {
  const m = document.body.innerText.match(/library\\/works\\/(W-[0-9-]+)\\//)
  return m ? m[1] : null
})()`)
check('拿到落盘的 workId', Boolean(ID), ID ?? '(没找到)')
if (!ID) { console.log('\n没有 workId，后面没法验'); process.exit(1) }

const fresh = diskWork(ID)
check('这份新作品还没有步骤（下面要验的是「从零拆出来」这条路）',
  !fresh.steps || fresh.steps.length === 0,
  `${fresh.steps?.length ?? 0} 步，${fresh.tiles.length} 片`)

/* ============ B. Steps 页 ============ */

console.log('\nB. 步骤拆解页')
await send('Page.navigate', { url: `${BASE}/produce/steps?work=${ID}` })
await sleep(2200)
await send('Page.bringToFront')
await sleep(400)

let loaded = false
for (let i = 0; i < 60; i += 1) {
  loaded = await evaluate(`document.querySelector('.page-title')?.textContent === '步骤拆解'
    && document.body.innerText.includes(${JSON.stringify(ID)})`)
  if (loaded) break
  await sleep(250)
}
if (!loaded) {
  const flashes = await evaluate(`[...document.querySelectorAll('.ant-message-notice-title')].map(e=>e.textContent).join(' | ')`)
  console.log(`     可能没载进来。页面提示：${flashes || '(没有提示)'}`)
}

check('页头显示的就是这份作品', await evaluate(`document.body.innerText.includes(${JSON.stringify(ID)})`))
check('还没拆，所以步骤列表是空的', (await stepsOf()).length === 0)
check('策略默认是「自动挑」',
  (await evaluate(`document.querySelector('.panel-body .ant-select-content')?.title ?? ''`)).includes('自动挑'),
  await evaluate(`document.querySelector('.panel-body .ant-select-content')?.title ?? ''`))

/* ---------- B1 拆解 ---------- */

console.log('\nB1 点「重新拆解」')

await click('button', { text: '重新拆解', label: '重新拆解' })
await sleep(900)

// 自动挑挑了哪一个 —— B4 要用它说明「两次结果相同」是不是正确行为
const autoStrategy = (await latestToast()).match(/（([a-z-]+)）/)?.[1] ?? ''

const list = await stepsOf()
check('排出了 6–12 步之间的步数', list.length >= 6 && list.length <= 12, `${list.length} 步`)
check('步号是 1..n 连续的', list.every((s, k) => s.no === k + 1), list.map((s) => s.no).join(','))
check('进度数字单调不减、末尾等于总片数', (() => {
  let prev = 0
  for (const s of list) {
    const done = Number(s.prog.split('/')[0])
    if (!(done > prev)) return false
    prev = done
  }
  return prev === fresh.tiles.length
})(), `${list.map((s) => s.prog).join(' → ')}`)

/* ---------- B2 切步骤：画布必须跟着裁 ---------- */

console.log('\nB2 逐步骤切，看画布')

// 每一步累计了多少片 —— 从进度数字反推（`done` 就是累计到本步的片数）
const cum = list.map((s) => Number(s.prog.split('/')[0]))
let canvasBad = []
for (let k = 0; k < list.length; k += 1) {
  await click('.solve-item', { nth: k, label: `第 ${k + 1} 步` })
  await sleep(320)
  const c = await canvasOf()
  // 更晚的片一片都不许出现 —— 出现了就等于把答案提前给了
  if (c.drawn !== cum[k]) canvasBad.push(`第 ${k + 1} 步画了 ${c.drawn} 片，应为累计的 ${cum[k]} 片`)
  // 本步的片数 = 累计差
  const wantNew = k === 0 ? cum[0] : cum[k] - cum[k - 1]
  if (c.isNew !== wantNew) canvasBad.push(`第 ${k + 1} 步品牌描边 ${c.isNew} ≠ 本步 ${wantNew} 片`)
}
check('每一步：画布画的片数 = 累计片数，带描边的 = 本步片数', canvasBad.length === 0,
  canvasBad.slice(0, 3).join('；'))

/* ---------- B3 右边的图 = 真正会导出的那张 ---------- */

console.log('\nB3 右栏那张图')

await click('.solve-item', { nth: 0, label: '回到第 1 步' })
await sleep(400)

const imgInfo = () => evaluate(`(() => {
  const img = document.querySelector('.draft-shot__img')
  if (!img) return null
  return { src: img.src.slice(0, 40), w: img.naturalWidth, h: img.naturalHeight, alt: img.alt }
})()`)

const shown = await imgInfo()
check('右栏出现了一张图，而且是能解析出来的（naturalWidth > 0）',
  Boolean(shown) && shown.w > 0 && shown.h > 0,
  shown ? `${shown.w}×${shown.h}　${shown.src}…` : '(没有 <img>)')
check('存盘前显示的是将要导出的那份 SVG（走 <img> 的独立文档路径）',
  Boolean(shown) && shown.src.startsWith('data:image/svg+xml'), shown?.src ?? '')

// antd v6 把 `.ant-progress-text` 改成了 `.ant-progress-indicator`（和
// `.ant-modal-content` → `.ant-modal-container` 是同一批改名）。按 v5 的选择器去问
// 只会拿到空串，看起来像「进度数字没渲染」—— 实际渲染了。
const progressText = await evaluate(`document.querySelector('.ant-progress-indicator')?.textContent ?? ''`)
// 左栏那条是 `2 / 11 片`（带了量词），进度条上是 `2 / 11` —— 比数字部分，不比整句。
const num = (s) => s.match(/\d+\s*\/\s*\d+/)?.[0].replace(/\s/g, '') ?? ''
check('进度条上的数字就是本步的累计 / 总数', num(progressText) === num(list[0].prog) && num(progressText) !== '',
  `进度条 ${progressText} ／ 列表 ${list[0].prog}`)

/* ---------- B4 换个策略，结果必须跟着变 ---------- */

console.log('\nB4 换策略')

await pickSelect('.panel-body .ant-select', '从下往上', '策略下拉')
await click('button', { text: '重新拆解', label: '重新拆解（换策略后）' })
await sleep(900)

const list2 = await stepsOf()
check('换策略后仍是 6–12 步', list2.length >= 6 && list2.length <= 12, `${list2.length} 步`)

// **不去断言「换策略后步骤跟着变」** —— 那不是不变量：「自动挑」完全可能就是挑了
// bottom-up，那时两次结果一模一样是**正确行为**。断言它等于把「auto 恰好没挑中这个」
// 当成前提，是条假断言（M5 那条「要求 ratio 精确等于整数的假断言」同一个毛病）。
// 真正会静默坏掉的是**下拉与那次重跑之间的接线** —— 换了下拉却还按老策略重跑，
// 或者压根没重跑。页面把这次实际用的策略写在提示里（`排成 N 步（bottom-up）`），
// 直接读那句话就是这件事唯一的证据。
check('页面报出的就是刚选的那个策略（下拉真的接到了重跑上）',
  (await latestToast()).includes('bottom-up'), await latestToast())
check('划分仍然是同一批片的一个划分（重跑没把片弄丢）',
  list2.reduce((n, s, k) => n + Number(s.prog.split('/')[0]) - (k ? Number(list2[k - 1].prog.split('/')[0]) : 0), 0)
    === fresh.tiles.length,
  `${list2[list2.length - 1].prog}`)
console.log(`     （自动挑挑中的是：${autoStrategy || '没读到'}；两条序列${JSON.stringify(list2.map((s) => s.caption)) === JSON.stringify(list.map((s) => s.caption)) ? '恰好相同' : '不同'}）`)
// 换策略之后右栏必须回落到内存里那份图，不能拿盘上上一批的图配新步骤显示
check('换策略后右栏不再读磁盘上那批（还没有那批）',
  (await evaluate(`document.querySelector('.draft-shot__img')?.src ?? ''`)).startsWith('data:image/svg+xml'))

/* ---------- B5 保存 ---------- */

console.log('\nB5 保存步骤图')

const saveBtn = await box('button', 0, '保存步骤图')
check('保存按钮是活的（不是灰的）', Boolean(saveBtn))
if (!saveBtn) throw new Error('保存按钮是灰的，后面没得验')

await click('button', { text: '保存步骤图', label: '保存步骤图' })

let saved = null
for (let i = 0; i < 60; i += 1) {
  await sleep(400)
  try {
    const d = diskWork(ID)
    if (Array.isArray(d.assets?.stepImages) && d.assets.stepImages.length) { saved = d; break }
  } catch { /* 还没写出来 */ }
}
if (!saved) {
  const flash = await evaluate(`[...document.querySelectorAll('.ant-message-notice-title')].map(e=>e.textContent).join(' | ')`)
  console.log(`     保存没落盘。页面提示：${flash || '(没有提示)'}`)
}
check('work.json 里写进了 assets.stepImages', Boolean(saved), saved ? `${saved.assets.stepImages.length} 项` : '(没落盘)')
if (!saved) { console.log('\n保存没成功，后面的磁盘核对没法做'); process.exit(1) }

/* ============ C. 磁盘核对：图与 work.json 是否一致 ============ */

console.log('\nC. 磁盘核对')

check('落盘的步骤数与页面上一致', saved.steps.length === list2.length,
  `磁盘 ${saved.steps.length} ／ 页面 ${list2.length}`)

// 页面上的进度数字是**累计到本步**的片数，所以本步片数 = 本步累计 − 上一步累计。
// 拿它和盘上的 tileIds.length 逐项比 —— 这一步同时验了两件事：落盘的划分就是页面上
// 那一条，以及 progress.done 真的等于「前 k 步片数之和」（不是页面自己另算的一个数）。
const pageCounts = list2.map((s, k) =>
  Number(s.prog.split('/')[0]) - (k ? Number(list2[k - 1].prog.split('/')[0]) : 0))
check('每一步的片数与页面上的进度数字逐项对得上',
  JSON.stringify(saved.steps.map((s) => s.tileIds.length)) === JSON.stringify(pageCounts),
  `磁盘 ${saved.steps.map((s) => s.tileIds.length).join('+')} ／ 页面 ${pageCounts.join('+')}`)

// 划分不重不漏 —— 这是一致性的根
const allIds = saved.steps.flatMap((s) => s.tileIds)
check('划分不重不漏：并起来恰好是全部片',
  allIds.length === saved.tiles.length && new Set(allIds).size === saved.tiles.length,
  `${allIds.length} 个 id / ${new Set(allIds).size} 个不重复 / ${saved.tiles.length} 片`)

const manifestMissing = saved.assets.stepImages.filter((p) => !fs.existsSync(path.join(LIB, p)))
check('清单里的每一项都真在磁盘上', manifestMissing.length === 0, manifestMissing.slice(0, 3).join('；'))

const onDisk = fs.readdirSync(workDir(ID))
const orphans = onDisk.filter((f) => /^step-\d+\.(svg|png)$/.test(f))
  .filter((f) => !saved.assets.stepImages.some((p) => p.endsWith(`/${f}`)))
check('盘上的步骤文件一个都不少地进了清单（清单是唯一事实来源）', orphans.length === 0, orphans.join('；'))

const stepBad = []
for (let k = 1; k <= saved.steps.length; k += 1) {
  const stem = `step-${String(k).padStart(2, '0')}`
  const svgPath = path.join(workDir(ID), `${stem}.svg`)
  const pngPath = path.join(workDir(ID), `${stem}.png`)
  if (!fs.existsSync(svgPath)) { stepBad.push(`${stem}.svg 不在`); continue }
  if (!fs.existsSync(pngPath)) { stepBad.push(`${stem}.png 不在`); continue }

  const svg = fs.readFileSync(svgPath, 'utf8')
  // 约定 7：`<img>` 里的 SVG 是独立文档，读不到页面 CSS 变量
  if (svg.includes('var(')) stepBad.push(`${stem}.svg 有 var(`)
  if (svg.includes('class=')) stepBad.push(`${stem}.svg 有 class=`)
  if (!svg.includes('<title>')) stepBad.push(`${stem}.svg 没有标题`)

  // 画了几片：本步 + 更早的，一片不多一片少。
  //
  // **数的是 `<g>` 不是 `<path>`**：骨架在 showGrid 时会多画一条网格 `<path>`，
  // 按 `<path>` 数会每张都多一片（而且永远是「多一个」，看着像差一错误而不是选择器写错）。
  // 一片 = 一个 `<g>`（片身 + 磁铁点），而骨架里一个 `<g>` 都没有。
  const drawn = (svg.match(/<g[ >]/g) ?? []).length
  const want = saved.steps.slice(0, k).reduce((n, s) => n + s.tileIds.length, 0)
  if (drawn !== want) stepBad.push(`${stem}.svg 画了 ${drawn} 片，应为 ${want} 片`)

  // 本步的片必须带品牌色描边
  const brand = (svg.match(/stroke="#[0-9A-Fa-f]{6}" stroke-width="2.6"/g) ?? []).length
  if (brand !== saved.steps[k - 1].tileIds.length) {
    stepBad.push(`${stem}.svg 品牌描边 ${brand} ≠ 本步 ${saved.steps[k - 1].tileIds.length} 片`)
  }

  // 进度数字：就是 work.json 里那个，不是页面现算的
  const p = saved.steps[k - 1].progress
  if (!svg.includes(`累计 ${p.done} / ${p.total} 片`)) {
    stepBad.push(`${stem}.svg 里没有「累计 ${p.done} / ${p.total} 片」`)
  }

  // PNG 得是真 PNG，不是一段被存成 .png 的文本
  const head = fs.readFileSync(pngPath).subarray(0, 8)
  if (head.toString('hex') !== '89504e470d0a1a0a') stepBad.push(`${stem}.png 不是 PNG（文件头不对）`)
  if (fs.statSync(pngPath).size < 1000) stepBad.push(`${stem}.png 只有 ${fs.statSync(pngPath).size} 字节`)
}
check(`每张步骤图与 work.json 对得上（片数、描边、进度、转义、PNG 文件头）`, stepBad.length === 0,
  stepBad.slice(0, 4).join('；'))

check('保存时把 stepsStale 清掉了（刚拆的解与片集是一致的）', saved.stepsStale === false,
  `stepsStale = ${saved.stepsStale}`)

// 右栏这时应当改从磁盘读回来 —— 「页面上看着对」和「盘上那份对」是两件事
await sleep(400)
const afterSave = await evaluate(`document.querySelector('.draft-shot__img')?.src ?? ''`)
check('保存完之后右栏改从磁盘上读（不是继续显示内存里那份）',
  afterSave.includes('/api/fs/raw') && afterSave.includes('.png'), afterSave.slice(0, 80))

/* ============ C2. 趁盘上真有步骤，把 bench 那条空过的核对变成真的 ============ */

console.log('\nC2 趁盘上有步骤，跑一遍 bench:steps')

// `bench:steps` 里那条「assets.stepImages ↔ 磁盘」核对在**任何时候跑都是空过的** ——
// 盘上 15 个作品目录一个带步骤的都没有，它自己会大声说明这件事。而这里正好有了一份
// 带步骤的作品（下面 D 段就要把它改坏，所以必须趁现在跑）。这一条才是把计划书那句
// 「assets.stepImages ↔ 磁盘核对」真正兑现的地方，不是 bench 单独跑一次。
let benchOut = ''
let benchOk = true
try {
  benchOut = execFileSync('npm', ['run', 'bench:steps'], { cwd: PC, encoding: 'utf8' })
} catch (err) {
  benchOk = false
  benchOut = err.stdout ?? ''
}
const detailOf = (t) => (t.split('\n').map((l) => l.trim())
  .find((l) => l.includes('核对了') || l.includes('现在是空过的'))
  ?? (t.split('\n').find((l) => l.includes('不过')) ?? '').trim())

check('bench:steps 通过，且那条磁盘核对真的核到了东西（不是空过）',
  benchOk && benchOut.includes('核对了') && !benchOut.includes('现在是空过的'), detailOf(benchOut))

/* ============ D. 过期步骤的护栏 ============ */

console.log('\nD. 步骤引用了不存在的片时，页面要拦一把')

// 直接从盘上抽掉一片（不经过界面 —— 这样造出来的条件与「片被改过」完全一样，
// 而驱动画布点击那套在 M6 里已经验过了，这里没必要再走一遍）
const shrunk = { ...saved, tiles: saved.tiles.slice(0, -1) }
fs.writeFileSync(path.join(workDir(ID), 'work.json'), JSON.stringify(shrunk, null, 2))

// 重新载入：`?work=` 没变，得先走开一下再回来，否则那个 effect 不会重跑
await send('Page.navigate', { url: `${BASE}/produce/home` })
await sleep(900)
await send('Page.navigate', { url: `${BASE}/produce/steps?work=${ID}` })
await sleep(2200)
await send('Page.bringToFront')
await sleep(500)

const banner = await evaluate(`(() => {
  const el = [...document.querySelectorAll('.ant-alert-warning, .ant-alert-error')]
    .map(e => e.textContent).join(' || ')
  return el
})()`)
check('页面上出现了「步骤引用了已经不存在的片」的横幅',
  banner.includes('已经不存在的片'), banner.slice(0, 90) || '(没有横幅)')

const disabled = await evaluate(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('保存步骤图'))
  return btn ? btn.disabled || btn.classList.contains('ant-btn-disabled') : null
})()`)
check('「保存步骤图」被置灰了（存下去会得到一批看起来正常、实际缺片的图）',
  disabled === true, `disabled = ${disabled}`)

/* 恢复：把片补回去，确认护栏解除（否则那个置灰可能是别的什么原因造成的） */
fs.writeFileSync(path.join(workDir(ID), 'work.json'), JSON.stringify(saved, null, 2))
await send('Page.navigate', { url: `${BASE}/produce/home` })
await sleep(700)
await send('Page.navigate', { url: `${BASE}/produce/steps?work=${ID}` })
await sleep(2200)
await send('Page.bringToFront')
await sleep(500)
const disabled2 = await evaluate(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('保存步骤图'))
  return btn ? btn.disabled || btn.classList.contains('ant-btn-disabled') : null
})()`)
check('把片补回去之后按钮恢复了（置灰确实是这条判据造成的）', disabled2 === false,
  `disabled = ${disabled2}`)

/* ---------------- 汇总 ---------------- */

console.log(`\n作品 ${ID}  ·  ${workDir(ID)}`)
console.log('   ' + fs.readdirSync(workDir(ID)).join('  '))

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
if (failed.length) console.log('不过的：\n' + failed.map((f) => `  - ${f.label}`).join('\n'))
process.exit(failed.length ? 1 : 0)
