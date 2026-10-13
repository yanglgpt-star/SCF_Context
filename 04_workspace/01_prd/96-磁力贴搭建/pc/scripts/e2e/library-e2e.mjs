/**
 * M8 端到端：**资产库**这一页的验收。
 *
 * 计划书 §M8 的验收原文：
 *   跑一遍真实链路产出的作品能在列表里找到、打开详情、下载成品图与步骤图。
 *
 * 所以这个脚本**当场跑一遍草稿链路**造一份真作品（不喂手工 JSON），再让它走到
 * 资产库里，最后真的点下载按钮、看文件有没有落到盘上。步骤图也走真路 ——
 * 去步骤拆解页拆一遍、存下来，再回资产库看那些图有没有被列出来、下不下得来。
 *
 * 另外它自己造一个**只有 draft.svg 的不完整目录**（不依赖盘上原有的 15 个残留 ——
 * 那些清掉之后这个脚本还得能跑）。
 *
 * 判据一律从磁盘读。页面上那份东西是内存里的，而「文件真在不在、内容对不对」
 * 页面上根本看不出来。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { estimateDifficulty } from '../../src/core/report.js'

const PORT = process.env.CDP_PORT || 9333
const BASE = process.env.BASE_URL || 'http://localhost:5273'
const PC = path.resolve(import.meta.dirname, '..', '..')
const LIB = path.resolve(PC, '..', 'library')
const WORKS = path.join(LIB, 'works')
// 浏览器真的往这里落文件，所以它必须是**磁盘上的普通目录**，不能是产物目录里的
// 什么虚拟路径。`MCDRV` 与 runner 用的杂物目录保持一致。
const DL = path.join(process.env.MCDRV || '/tmp/mcdrv', 'libdownloads')
const INCOMPLETE_ID = 'W-LIBTEST-INCOMPLETE'

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

/** 页面级连接 */
const cdpTarget = await findTarget()
const ws = new WebSocket(cdpTarget.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

let seq = 0
const pending = new Map()
const pageEvents = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id)
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result)
    return
  }
  pageEvents.push(m)
}
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })

/**
 * 浏览器级连接。`Browser.setDownloadBehavior` 只能在这一层发 ——
 * 「点下载按钮之后文件真的落到盘上、名字就是你指定的那个」这件事只有它能验。
 */
const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
const bws = new WebSocket(ver.webSocketDebuggerUrl)
await new Promise((res, rej) => { bws.onopen = res; bws.onerror = rej })
let bseq = 0
const bpending = new Map()
const downloads = []
bws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && bpending.has(m.id)) {
    const p = bpending.get(m.id); bpending.delete(m.id)
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result)
    return
  }
  if (m.method === 'Browser.downloadWillBegin') downloads.push({ ...m.params, state: 'begin' })
  if (m.method === 'Browser.downloadProgress' && m.params.state !== 'inProgress') {
    const d = downloads.find((x) => x.guid === m.params.guid)
    if (d) d.state = m.params.state
  }
}
const bsend = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++bseq
    bpending.set(id, { resolve, reject })
    bws.send(JSON.stringify({ id, method, params }))
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

/** 选一个 antd Select 的值。`nth` 用来指定筛选条里的第几个下拉 */
async function pickSelect(selectSel, nth, optionText, label) {
  await click(selectSel, { nth, label })
  await sleep(350)
  const b = await box('.ant-select-item-option', 0, optionText)
  if (!b) {
    await escape()
    throw new Error(`下拉里没有「${optionText}」`)
  }
  await click('.ant-select-item-option', { text: optionText, label: `选项「${optionText}」` })
  await sleep(300)
  await escape()
  await sleep(300)
}

/* ---------------- 页面读取 ---------------- */

/** 表格列顺序。**先断言表头**，后面才敢按下标取单元格 —— 加一列就会立刻炸 */
const HEADERS = ['封面', '作品', '题材', '年龄档', '难度', '片数', '形状', '步骤', '来源', '更新于', '']

const headersOf = () => evaluate(`[...document.querySelectorAll('.ant-table-thead th')].map(t => t.textContent)`)
const rowCount = () => evaluate(`document.querySelectorAll('.ant-table-tbody tr.ant-table-row').length`)
const rowsOf = () => evaluate(`[...document.querySelectorAll('.ant-table-tbody tr.ant-table-row')].map(tr => ({
  id: tr.querySelector('.lib-id')?.textContent ?? '',
  title: tr.querySelector('.lib-title')?.textContent ?? '',
  cells: [...tr.querySelectorAll('td')].map(td => td.innerText.replace(/\\n/g, ' ')),
  cover: tr.querySelector('.lib-cover img')?.src ?? '',
}))`)

const detailOf = () => evaluate(`({
  id: document.querySelector('.panel-title.mono')?.textContent ?? '',
  items: [...document.querySelectorAll('.ant-descriptions-item')].map(e => e.innerText.replace(/\\n/g, ' ')),
  assets: [...document.querySelectorAll('.assets-list > span')].map(e => e.textContent),
  plan: document.querySelector('.lib-vs img')?.naturalWidth ?? 0,
  stepThumbs: document.querySelectorAll('.lib-steps img').length,
  dl: [...document.querySelectorAll('a.ant-btn')].map(a => ({
    name: a.getAttribute('download'),
    path: new URL(a.href).searchParams.get('path'),
  })),
  json: document.querySelector('.draft-pre')?.textContent ?? '',
  alerts: [...document.querySelectorAll('.ant-alert')].map(e => e.innerText.replace(/\\n/g, ' ')),
  btns: [...document.querySelectorAll('.panel button, .panel a.ant-btn')].map(b => b.textContent.trim()),
})`)

const diskFiles = (id) => fs.readdirSync(path.join(WORKS, id)).sort()
const diskWork = (id) => JSON.parse(fs.readFileSync(path.join(WORKS, id, 'work.json'), 'utf8'))
/** work.json 的 mtime。资产库只读，浏览一圈之后这个数一个都不许变 */
const mtimes = () => Object.fromEntries(
  fs.readdirSync(WORKS).filter((d) => fs.existsSync(path.join(WORKS, d, 'work.json')))
    .map((d) => [d, fs.statSync(path.join(WORKS, d, 'work.json')).mtimeMs]),
)

async function goto(url, ms = 2000) {
  await send('Page.navigate', { url })
  await sleep(ms)
  await send('Page.bringToFront')
  await sleep(400)
}

/* ---------------- 启动 ---------------- */

await send('Page.enable')
await send('Runtime.enable')
await send('DOM.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1040, deviceScaleFactor: 1, mobile: false })

fs.rmSync(DL, { recursive: true, force: true })
fs.mkdirSync(DL, { recursive: true })
await bsend('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true })

console.log('='.repeat(74))

/* ============ A. 造两份数据：一份真作品，一个不完整目录 ============ */

console.log('A. 造数据')

const dirsBefore = fs.readdirSync(WORKS).length
const mtimeBefore = mtimes()

// A1 真作品：走草稿链路的 mock 多边形分支（与 M7 同一套路子）
await goto(`${BASE}/produce/draft`, 2600)
for (let i = 0; i < 40; i += 1) {
  if (await evaluate(`!!document.querySelector('.ant-btn-primary')`)) break
  await sleep(250)
}

const variant = await evaluate(`document.querySelector('.ant-select-content')?.title ?? ''`)
if (!variant.includes('多边形走通')) {
  await pickSelect('.ant-select', 0, '多边形走通', '演示分支下拉')
}

const STAGE_STATE = `[...document.querySelectorAll('.stage')].map(s => ({
  name: s.querySelector('.stage__name').textContent,
  state: s.querySelector('.ant-tag').textContent,
}))`

await click('.ant-btn-primary', { label: '跑一遍' })
await sleep(700)
check('点了「跑一遍」链路真的动起来了（不然下面等的是一份没跑的东西）',
  await evaluate(`!!document.querySelector('.ant-btn-loading') || [...document.querySelectorAll('.stage .ant-tag')].some(t=>t.textContent==='进行中')`))

let stages = []
const t0 = Date.now()
for (;;) {
  stages = await evaluate(STAGE_STATE)
  const busy = await evaluate(`!!document.querySelector('.ant-btn-loading')`)
  if (!stages.some((s) => s.state === '进行中') && !busy) break
  if (Date.now() - t0 > 120_000) throw new Error('等太久了，草稿链路没跑完')
  await sleep(500)
}

const ID = await evaluate(`(() => {
  const m = document.body.innerText.match(/library\\/works\\/(W-[0-9-]+)\\//)
  return m ? m[1] : null
})()`)
check('草稿链路五段全完成，并拿到落盘 workId',
  stages.every((s) => s.state === '完成') && Boolean(ID),
  `${stages.map((s) => `${s.name}:${s.state}`).join(' ')} → ${ID ?? '(没拿到)'}`)
if (!ID) process.exit(1)
check('这份作品盘上有成品图 render.png（列表封面与下载都靠它）',
  fs.existsSync(path.join(WORKS, ID, 'render.png')), diskFiles(ID).join(' '))

// A2 不完整目录：只有一张 draft.svg。**自己造**，不蹭盘上原有的残留 ——
// 那些清掉之后这个脚本还得能跑
const incompleteDir = path.join(WORKS, INCOMPLETE_ID)
fs.mkdirSync(incompleteDir, { recursive: true })
fs.writeFileSync(path.join(incompleteDir, 'draft.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#B23A2E"/></svg>')
console.log(`     造了一个只有 draft.svg 的目录：${INCOMPLETE_ID}`)

/* ============ B. 列表 ============ */

console.log('\nB. 列表页')
await goto(`${BASE}/asset/library`, 2600)

check('页头是资产库', (await evaluate(`document.querySelector('.page-title')?.textContent`)) === '资产库')
const heads = (await headersOf()).map((h) => h.trim())
check('列顺序没变（后面按下标取单元格全靠这条）',
  JSON.stringify(heads) === JSON.stringify(HEADERS), heads.join(' | '))

const rows0 = await rowsOf()
check(`列出盘上每一个目录（${dirsBefore} 个原有 + 我们造的 2 个）`,
  rows0.length === dirsBefore + 2, `${rows0.length} 行`)
check('默认按「更新于」倒序，第一条就是刚跑出来的那份',
  rows0[0]?.id === ID, `第一条 ${rows0[0]?.id} · ${rows0[0]?.cells[9]}`)
// `readRawUrl` 走 `encodeURIComponent`，所以路径里的 `/` 是 `%2F` —— 按字面
// `works/<id>/render.png` 去找会找不到，而那看起来就像「封面选错了图」
const wantCover = encodeURIComponent(`works/${ID}/render.png`)
check('新作品的封面用的是 render.png',
  rows0[0]?.cover.includes(wantCover), `想要含 ${wantCover} ／ 实际 ${rows0[0]?.cover}`)
check('封面图确实解码出来了（naturalWidth > 0）',
  (await evaluate(`[...document.querySelectorAll('.lib-cover img')].filter(i=>i.naturalWidth>0).length`)) > 0,
  await evaluate(`[...document.querySelectorAll('.lib-cover img')].filter(i=>i.naturalWidth>0).length + ' / ' + document.querySelectorAll('.lib-cover img').length`))
check('新作品的来源标成「夹具」（mock 必须一眼看得出）',
  rows0[0]?.cells[8].includes('夹具'), rows0[0]?.cells[8])
check('不完整目录被列出来了，而且带「不完整」标记',
  rows0.some((r) => r.id === INCOMPLETE_ID && r.cells[8].includes('不完整')),
  rows0.find((r) => r.id === INCOMPLETE_ID)?.cells.join(' | ') ?? '(没找到)')

/* ---------- B1 筛选 ---------- */

console.log('\nB1 筛选')

const filterCount = async (kw) => {
  await evaluate(`(() => {
    const el = document.querySelector('.lib-filters input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(el, ${JSON.stringify(kw)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await sleep(500)
  return rowCount()
}

check('搜 workId 能收敛到一条', (await filterCount(ID)) === 1, `${await rowCount()} 行`)
check('搜一个不存在的词 → 0 行', (await filterCount('没有这个东西')) === 0)
await filterCount('')
check('清空搜索后回到全量', (await rowCount()) === rows0.length, `${await rowCount()} 行`)

// 来源下拉 = 第 4 个（题材 / 年龄档 / 难度 / 来源）
await pickSelect('.lib-filters .ant-select', 3, '只看夹具', '来源下拉')
const mockRows = await rowsOf()
check('「只看夹具」筛出来的每一行都带夹具标记',
  mockRows.length > 0 && mockRows.every((r) => r.cells[8].includes('夹具')),
  `${mockRows.length} 行`)

await pickSelect('.lib-filters .ant-select', 3, '只看真产出', '来源下拉')
const realRows = await rowsOf()
check('「只看真产出」里没有夹具、也没有不完整目录',
  realRows.every((r) => !r.cells[8].includes('夹具') && !r.cells[8].includes('不完整')),
  `${realRows.length} 行`)

/* ============ C. 详情 ============ */

console.log('\nC. 详情页')
// 重新载入：上面的筛选是页面 state，不重载的话下面按 id 找那一行会找不到
// （新作品是夹具，正好被「只看真产出」挡掉）
await goto(`${BASE}/asset/library`, 2400)

await evaluate(`[...document.querySelectorAll('.ant-table-tbody tr.ant-table-row')]
  .find(tr => tr.innerText.includes(${JSON.stringify(ID)})).click()`)
await sleep(1800)

check('点一行就打开了详情，地址栏挂上 ?work=', (await evaluate(`location.search`)).includes(`work=${ID}`),
  await evaluate(`location.search`))

const d = await detailOf()
check('详情页头就是这份作品', d.id === ID, d.id)
check('夹具体现在详情页顶部也有一条横幅（不是只在列表里一个小角标）',
  d.alerts.some((a) => a.includes('mock 夹具')), (d.alerts[0] ?? '(没有横幅)').slice(0, 60))

// 难度必须与 Node 侧直接算出来的那个数逐位相同 —— 页面与 core 是两个进程，
// 这条同时在验「页面显示的是 core 算的」以及 core 本身没被页面改写
const want = estimateDifficulty(diskWork(ID))
check('详情里的难度与 Node 直接算的一样（同一套权重，不是页面另算的）',
  d.items.some((it) => it.includes(want.score.toFixed(2))),
  `想要 ${want.score.toFixed(2)}（结构上属${want.ageBand.key}档）／页面 ${d.items.find((i) => i.startsWith('难度')) ?? '(没有难度项)'}`)
check('年龄档那栏写的是「做给谁」，来自 meta',
  d.items.some((it) => it.startsWith('年龄档（做给谁）') && it.includes(diskWork(ID).meta.ageBand)),
  d.items.find((i) => i.startsWith('年龄档')) ?? '(没有)')

const onDisk = diskFiles(ID)
check('资产清单就是盘上真实存在的文件，一个不多一个不少',
  JSON.stringify([...d.assets].sort()) === JSON.stringify(onDisk),
  `页面 ${d.assets.join(' ')} ／ 磁盘 ${onDisk.join(' ')}`)
check('方案图显示出来了（naturalWidth > 0）', d.plan > 0, `naturalWidth = ${d.plan}`)
check('work.json 原文能 parse 回来，而且是同一份',
  (() => { try { return JSON.parse(d.json).workId === ID } catch { return false } })(),
  d.json.slice(0, 40))
check('详情里有「去搭建」和「去拆解」两个入口',
  d.btns.includes('去搭建') && d.btns.includes('去拆解'), d.btns.join(' | '))

/* ============ D. 步骤图：走真路拆一遍再存 ============ */

console.log('\nD. 去步骤页拆出步骤图（M8 要下载的「步骤图」得先真的存在）')

await goto(`${BASE}/produce/steps?work=${ID}`, 2400)
for (let i = 0; i < 60; i += 1) {
  if (await evaluate(`document.body.innerText.includes(${JSON.stringify(ID)})`)) break
  await sleep(250)
}
await click('button', { text: '重新拆解', label: '重新拆解' })
await sleep(1400)
const nSteps = await evaluate(`document.querySelectorAll('.solve-item').length`)
check('拆出了步骤', nSteps >= 6, `${nSteps} 步`)

await click('button', { text: '保存步骤图', label: '保存步骤图' })
let savedWork = null
for (let i = 0; i < 60; i += 1) {
  await sleep(400)
  try {
    const w = diskWork(ID)
    if (Array.isArray(w.assets?.stepImages) && w.assets.stepImages.length) { savedWork = w; break }
  } catch { /* 还没写出来 */ }
}
check('步骤图落盘了', Boolean(savedWork), savedWork ? `${savedWork.assets.stepImages.length} 个文件` : '(没落盘)')
if (!savedWork) { console.log('\n没有步骤图，后面那几条没法验'); process.exit(1) }

/* ---------- D1 回资产库看步骤图 ---------- */

console.log('\nD1 回资产库')
await goto(`${BASE}/asset/library?work=${ID}`, 2400)

const d2 = await detailOf()
const stepPngs = diskFiles(ID).filter((f) => /^step-\d+\.png$/.test(f))
check('步骤图格子数 = 盘上 step-NN.png 的数',
  d2.stepThumbs === stepPngs.length, `页面 ${d2.stepThumbs} ／ 磁盘 ${stepPngs.length}`)
check('导出区把 stepImages 清单里的每一项都出了链接',
  savedWork.assets.stepImages.every((p) => d2.dl.some((x) => x.name.endsWith(path.basename(p)))),
  d2.dl.map((x) => x.name).join(' '))
check('每一条链接指向的文件盘上都真的在（死链比隐藏难查得多）',
  d2.dl.length > 0 && d2.dl.every((x) => x.path && fs.existsSync(path.join(LIB, x.path))),
  d2.dl.map((x) => x.path).join(' '))
check('下载名是 ASCII 的「作品id-原文件名」',
  d2.dl.every((x) => x.name && /^[A-Za-z0-9_.-]+$/.test(x.name) && x.name.startsWith(ID)),
  d2.dl.map((x) => x.name).join(' '))

/* ============ E. 真点下载 ============ */

console.log('\nE. 真点下载按钮')

const grab = async (want) => {
  downloads.length = 0
  await click(`a.ant-btn[download="${want}"]`, { label: `下载 ${want}` })
  for (let i = 0; i < 60; i += 1) {
    await sleep(250)
    const done = downloads.find((x) => x.state === 'completed')
    if (done) return done
  }
  return downloads[0] ?? null
}

const planName = `${ID}-render.png`
const got = await grab(planName)
check('点「成品图」下载后 Chrome 报出来的文件名就是 download 属性指定的那个',
  got?.suggestedFilename === planName, got ? `${got.suggestedFilename}（${got.state}）` : '(没收到下载事件)')

const landedPlan = path.join(DL, planName)
check('文件真的落到了盘上', fs.existsSync(landedPlan),
  fs.existsSync(DL) ? fs.readdirSync(DL).join(' ') : '(下载目录都没有)')
if (fs.existsSync(landedPlan)) {
  const head = fs.readFileSync(landedPlan).subarray(0, 8).toString('hex')
  check('下下来的是真 PNG（文件头对）', head === '89504e470d0a1a0a', head)
  check('大小与盘上那份一模一样',
    fs.statSync(landedPlan).size === fs.statSync(path.join(WORKS, ID, 'render.png')).size,
    `${fs.statSync(landedPlan).size} 字节`)
}

const stepName = `${ID}-step-01.png`
const got2 = await grab(stepName)
check(`点「步骤图」下载：${stepName}`, got2?.suggestedFilename === stepName,
  got2 ? `${got2.suggestedFilename}（${got2.state}）` : '(没收到下载事件)')
check('步骤图也真的落到盘上了，而且是真 PNG',
  fs.existsSync(path.join(DL, stepName)) &&
    fs.readFileSync(path.join(DL, stepName)).subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
  fs.existsSync(path.join(DL, stepName)) ? `${fs.statSync(path.join(DL, stepName)).size} 字节` : '(没有)')

/* ============ F. 不完整目录的详情 ============ */

console.log('\nF. 打开那个不完整的目录')

await goto(`${BASE}/asset/library?work=${INCOMPLETE_ID}`, 2200)
const d3 = await detailOf()
check('页面上说清楚了这个目录没有 work.json',
  d3.alerts.some((a) => a.includes('没有 work.json')), (d3.alerts[0] ?? '(没有横幅)').slice(0, 70))
check('照样把目录里现有的文件列出来（垃圾能被看见才谈得上清）',
  JSON.stringify([...d3.assets].sort()) === JSON.stringify(diskFiles(INCOMPLETE_ID)),
  `页面 ${d3.assets.join(' ')} ／ 磁盘 ${diskFiles(INCOMPLETE_ID).join(' ')}`)
check('不提供删除入口（删目录走 Finder，别把 fs-api 的威胁模型扩大）',
  !d3.btns.some((b) => b.includes('删除')) &&
    !(await evaluate(`!!document.querySelector('.panel a[href*="delete"], .panel button.ant-btn-dangerous')`)),
  d3.btns.join(' | ') || '(没有按钮)')

/* ============ G. 浏览一圈不许写盘 ============ */

console.log('\nG. 资产库是只读的')

const after = mtimes()
const changed = Object.keys(mtimeBefore).filter((k) => mtimeBefore[k] !== after[k])
check('浏览一圈之后，原有作品的 work.json 一个都没被改过',
  changed.length === 0, changed.slice(0, 4).join(' '))
check('目录数就是「原有的 + 脚本造的 2 个」，没有多出别的东西',
  fs.readdirSync(WORKS).length === dirsBefore + 2,
  `${fs.readdirSync(WORKS).length} 个（原有 ${dirsBefore} + 2）`)

/* ============ H. 按钮接线 ============ */

console.log('\nH. 详情页的入口按钮')

await goto(`${BASE}/asset/library?work=${ID}`, 2200)
await click('button', { text: '去搭建', label: '去搭建' })
await sleep(1800)
const buildUrl = await evaluate(`location.pathname + location.search`)
check('「去搭建」跳到实物搭建页并带上 workId', buildUrl === `/produce/build?work=${ID}`, buildUrl)
check('而且那一页真的把这份作品载进来了（不是只改了地址栏）',
  await evaluate(`document.body.innerText.includes(${JSON.stringify(ID)})`),
  await evaluate(`document.querySelector('.page-title')?.textContent ?? ''`))

await goto(`${BASE}/asset/library?work=${ID}`, 2200)
await click('button', { text: '去拆解', label: '去拆解' })
await sleep(1800)
const stepsUrl = await evaluate(`location.pathname + location.search`)
check('「去拆解」跳到步骤拆解页并带上 workId', stepsUrl === `/produce/steps?work=${ID}`, stepsUrl)
check('那一页也真的载进来了', await evaluate(`document.body.innerText.includes(${JSON.stringify(ID)})`))

/* ---------- H1 趁盘上有步骤，跑一遍 bench:steps（沿用 M7 的 C2） ---------- */

console.log('\nH1 趁盘上有带步骤的作品，跑一遍 bench:steps')

let benchOut = ''
let benchOk = true
try {
  benchOut = execFileSync('npm', ['run', 'bench:steps'], { cwd: PC, encoding: 'utf8' })
} catch (err) {
  benchOk = false
  benchOut = err.stdout ?? String(err)
}
const benchLine = benchOut.split('\n').map((l) => l.trim()).find((l) => l.includes('核对了') || l.includes('空过')) ?? ''
check('bench:steps 通过，且那条磁盘核对照样核到了东西（不是空过）',
  benchOk && benchOut.includes('核对了') && !benchOut.includes('现在是空过的'), benchLine)

/* ---------------- 汇总 ---------------- */

console.log(`\n作品 ${ID}  ·  ${path.join(WORKS, ID)}`)
console.log('   ' + diskFiles(ID).join('  '))
console.log(`下载目录 ${DL}：${fs.readdirSync(DL).sort().join('  ')}`)

const ex = pageEvents.filter((e) => e.method === 'Runtime.exceptionThrown')
const cerr = pageEvents.filter(
  (e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error',
)
check('页面全程没有抛未捕获异常，也没有 console.error',
  ex.length === 0 && cerr.length === 0,
  [...ex.map((e) => e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text),
   ...cerr.map((e) => e.params.args.map((a) => a.value ?? a.description).join(' '))]
    .join(' | ').slice(0, 300))

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
if (failed.length) console.log('不过的：\n' + failed.map((f) => `  - ${f.label}`).join('\n'))
process.exit(failed.length ? 1 : 0)
