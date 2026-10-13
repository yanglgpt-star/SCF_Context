/**
 * 草稿生成页（M4）端到端：mock 模式走完整链路 + 四条分支。
 *
 * 要验的五条（计划书里的页面验收项）：
 *   1. mock 走完整链路，端到端 ≤3 分钟
 *   2. 并排显示画布与导出预览，导出的 PNG 和画布所见一致
 *   3. 多边形吸附失败 → 退到掩码，且页面**明确写出走的是哪条**
 *   4. AI 返回坏数据 → 报出可读原因，不白屏
 *   5. mock 在 UI 上看得见（模式 Tag + 角标 + 说明文字）
 */
const PORT = 9333
const BASE = process.argv[2] ?? 'http://localhost:5273/produce/draft'

const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
if (!target) throw new Error('没有可用的页面 target')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})

let seq = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(new Error(JSON.stringify(msg.error)))
    else resolve(msg.result)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 1680,
  height: 1050,
  deviceScaleFactor: 1,
  mobile: false,
})
await send('Page.navigate', { url: BASE })
// 标签页在后台时 Chrome 会**丢掉**合成的 mousePressed/mouseReleased —— 表现是「点了没反应」，
// 而 DOM 上一切正常。M4/M5 这两个脚本写得早，当时还没踩到这个坑；M6 之后的三套都有这一行。
await send('Page.bringToFront')
await sleep(2600)

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) {
    throw new Error(`${r.exceptionDetails.text} :: ${r.exceptionDetails.exception?.description ?? ''}`)
  }
  return r.result.value
}

const ok = (b) => (b ? '过  ' : '**不过**')
const problems = []
function check(name, pass, detail = '') {
  console.log(`  ${ok(pass)}${name}${detail ? `   ${detail}` : ''}`)
  if (!pass) problems.push(name)
}

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
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 })
}

/**
 * 选一个演示分支：打开 antd Select → 点下拉里的那一项。
 *
 * 触发器是 `.ant-select`，不是 v5 那个 `.ant-select-selector` —— antd v6 把它
 * 拆成了 `.ant-select-content` + `.ant-select-input`，v5 的类名在页面上根本不存在
 * （症状是「点不到」，不是「点错了」，很容易误判成元素被遮住）。
 * 下拉里的项倒是还叫 `.ant-select-item-option`。
 */
async function escape() {
  for (const type of ['keyDown', 'keyUp']) {
    await send('Input.dispatchKeyEvent', {
      type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
    })
  }
}

async function pickVariant(label) {
  const before = await evaluate(`document.querySelector('.ant-select-content')?.title ?? ''`)
  if (before === label) {
    await escape()
    return
  }
  await click('.ant-select', { label: '演示分支下拉' })
  await sleep(400)
  await click('.ant-select-item-option', { text: label, label: `分支「${label}」` })
  await sleep(300)
  // 必须把浮层关掉再往下走：下拉的浮层会盖住「跑一遍」，点了没反应。
  // 更坏的是那一刻 waitIdle 会立刻返回**上一轮**的阶段状态，于是这一轮
  // 看起来「跑成功了」而其实根本没跑 —— 一个会拿旧状态冒充成功的测试
  // 比没有测试更危险，所以下面还要确认链路真的动起来了。
  await escape()
  await sleep(400)
  const after = await evaluate(`document.querySelector('.ant-select-content')?.title ?? ''`)
  if (after !== label) throw new Error(`分支没切过去：想选「${label}」，现在是「${after}」`)
  console.log(`     （分支已切到「${after}」）`)
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
    if (Date.now() - t0 > maxMs) throw new Error('等太久了，链路没跑完')
    await sleep(500)
  }
}

async function runOnce(variantLabel) {
  if (variantLabel) await pickVariant(variantLabel)
  const before = await evaluate(`[...document.querySelectorAll('.stage__summary')].map(e=>e.textContent).join('|')`)
  await click('.ant-btn-primary', { label: '跑一遍' })
  await sleep(700)
  const started = await evaluate(
    `!!document.querySelector('.ant-btn-loading') || [...document.querySelectorAll('.stage .ant-tag')].some(t=>t.textContent==='进行中')`,
  )
  if (!started) {
    const now = await evaluate(`[...document.querySelectorAll('.stage__summary')].map(e=>e.textContent).join('|')`)
    throw new Error(
      `点了「跑一遍」但链路没动（${now === before ? '阶段状态一个字都没变，' : ''}多半是浮层挡住了按钮）`,
    )
  }
  return waitIdle()
}

const dumpStages = (stages) =>
  stages.forEach((s) => console.log(`     ${s.name.padEnd(4)} ${s.state}  ${s.summary.slice(0, 90)}`))

console.log('='.repeat(74))
console.log(`页面 ${BASE}`)

/* ---------------- 5. mock 在 UI 上看得见 ---------------- */
console.log('\n[5] mock 模式在 UI 上看得见')
const mockTag = await evaluate(`document.querySelector('.page-head .ant-tag')?.textContent ?? ''`)
const mockAlert = await evaluate(
  `[...document.querySelectorAll('.ant-alert')].map(a=>a.textContent).find(t=>t.includes('mock')) ?? ''`,
)
const variantDisabled = await evaluate(`!!document.querySelector('.ant-select-disabled')`)
check('页头有 AI 模式 Tag', /mock/i.test(mockTag), `Tag = ${JSON.stringify(mockTag)}`)
check('有 mock 说明文字（写清图是夹具、主题只影响提示词）', mockAlert.includes('夹具') && mockAlert.includes('提示词'))
check('演示分支开关在 mock 下可用', !variantDisabled)

/* ---------------- 1 + 2 + 3. polygon 主线 ---------------- */
console.log('\n[1][2] polygon 分支：跑完整链路')
const t0 = Date.now()
const r1 = await runOnce('多边形走通')
const wall = Date.now() - t0
dumpStages(r1.stages)
check('五段全部完成', r1.stages.every((s) => s.state === '完成'), `用时 ${(wall / 1000).toFixed(1)}s（含选分支的等待）`)
check('端到端远在 3 分钟以内', wall < 180_000, `${(wall / 1000).toFixed(1)}s`)

const outlineTag = await evaluate(
  `[...document.querySelectorAll('.panel')].map(p=>p.querySelector('.panel-head .ant-tag')?.textContent).find(t=>t && t.includes('多边形')) ?? ''`,
)
check('轮廓面板写明走的是多边形', outlineTag.includes('多边形'), `Tag = ${JSON.stringify(outlineTag)}`)

const tileCount = await evaluate(`document.querySelectorAll('.mc-tile').length`)
check('画布上真的画出了磁力片', tileCount > 0, `${tileCount} 片`)
check('画布与导出预览并排（三栏同一行）', await evaluate(`(() => {
  const cols = [...document.querySelectorAll('.draft-split > .build-col')]
  if (cols.length !== 3) return false
  const ys = cols.map(c => Math.round(c.getBoundingClientRect().top))
  return Math.abs(ys[0] - ys[1]) < 4 && Math.abs(ys[1] - ys[2]) < 4
})()`))

const png = await evaluate(`(() => {
  const imgs = [...document.querySelectorAll('.draft-shot__img')]
  const last = imgs[imgs.length - 1]
  if (!last) return null
  return { src: last.getAttribute('src'), w: last.naturalWidth, h: last.naturalHeight, complete: last.complete }
})()`)
check('导出预览的图是从磁盘读回来的 PNG', Boolean(png && /render\.png/.test(png.src)), png?.src?.slice(0, 60))
check('PNG 有真实像素（不是 0×0 的空图）', Boolean(png && png.w > 100 && png.h > 100), png ? `${png.w}×${png.h}` : '')

const foot = await evaluate(
  `[...document.querySelectorAll('.panel-foot')].map(e=>e.textContent).find(t=>t.includes('render.png')) ?? ''`,
)
check('页面上列出了落盘的四个文件', ['render.png', 'render.svg', 'work.json', 'vision.json'].every((f) => foot.includes(f)))

/* 像素级「和画布所见一致」不做自动比对 —— 两条渲染路径（活的 SVG vs 栅格化）
   差一个像素就红，脆得没人愿意维护。但有两个**具体的坏法**值得机器拦：
     · 底色丢了 → 社交平台把透明当黑色，发出去是黑框
     · 栅格化成一张空板 → 尺寸对、文件有、里面什么都没有
   这两条都能从 PNG 的像素直方图上看出来，而且不脆。 */
const px = await evaluate(`(async () => {
  const img = [...document.querySelectorAll('.draft-shot__img')].pop()
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  const seen = new Set()
  let opaque = 0
  for (let k = 0; k < data.length; k += 4) {
    if (data[k + 3] === 255) opaque += 1
    seen.add('#' + [data[k], data[k+1], data[k+2]].map(v => v.toString(16).padStart(2,'0')).join('').toUpperCase())
  }
  const canvasFills = [...new Set([...document.querySelectorAll('.mc-tile path')].map(p => p.getAttribute('fill').toUpperCase()))]
  return { colors: seen.size, opaque, total: data.length / 4, hasSheet: seen.has('#FBFAF6'), hasPad: seen.has('#F5F3EE'), canvasFills }
})()`)
check('PNG 不透明（没有留着透明底）', px.opaque === px.total, `${px.opaque}/${px.total}`)
check('PNG 里有画布底色（那条 rect 活着穿过了栅格化）', px.hasSheet && px.hasPad, `底色 #FBFAF6 ${px.hasSheet} · 外底色 #F5F3EE ${px.hasPad}`)
check('PNG 不是一张空板', px.colors >= 4, `${px.colors} 种颜色，画布上 ${px.canvasFills.length} 种填充色`)

await send('Page.captureScreenshot', {}).then((r) =>
  import('node:fs').then((fs) => fs.writeFileSync('/tmp/mcdrv/draft-success.png', Buffer.from(r.data, 'base64'))),
)

/* ---------------- 3. 掩码兜底 ---------------- */
console.log('\n[3] mask 分支：多边形被拒 → 退到掩码')
const r2 = await runOnce('多边形被拒 → 掩码兜底')
dumpStages(r2.stages)
check('五段仍然全部完成', r2.stages.every((s) => s.state === '完成'))
check(
  '链路摘要写明是掩码兜底',
  r2.stages.find((s) => s.name === '抠轮廓')?.summary.includes('掩码'),
  r2.stages.find((s) => s.name === '抠轮廓')?.summary,
)
const maskTag = await evaluate(
  `[...document.querySelectorAll('.panel')].map(p=>p.querySelector('.panel-head .ant-tag')?.textContent).find(t=>t && t.includes('掩码')) ?? ''`,
)
check('轮廓面板写明走的是掩码兜底', maskTag.includes('掩码'), `Tag = ${JSON.stringify(maskTag)}`)
const attemptText = await evaluate(
  `[...document.querySelectorAll('.draft-details')].map(d=>d.textContent).find(t=>t && t.includes('EDGE')) ?? ''`,
)
check(
  '把多边形那条路为什么被拒也写出来了',
  attemptText.includes('EDGE_NOT_SNAPPABLE'),
  attemptText.slice(0, 110).replace(/\s+/g, ' '),
)

/* ---------------- 4. 坏数据：多边形被拒且没有掩码 ---------------- */
console.log('\n[4a] unsnappable 分支：AI 给了不能用的多边形，也没有掩码')
const r3 = await runOnce('多边形被拒，且没有掩码')
dumpStages(r3.stages)
const outlineStage3 = r3.stages.find((s) => s.name === '抠轮廓')
check('抠轮廓这一段被标成中断', outlineStage3.state === '中断')
check('后面的段没被误标成完成', r3.stages.find((s) => s.name === '求解').state === '待办')
check('中断原因可读（说清是哪个形状问题、要挪多远）', /缓坡|45|度|格/.test(outlineStage3.summary), outlineStage3.summary.slice(0, 120))
check('段上标红', await evaluate(`!!document.querySelector('.stage--failed')`))
check(
  '页面没有白屏：面板、控制台都还在',
  await evaluate(`document.querySelectorAll('.panel').length >= 4 && !!document.querySelector('.ant-segmented')`),
)
check('这一趟没有写进 library（没解出形状就不该落盘）', await evaluate(`!document.querySelector('.panel-foot')?.textContent.includes('render.png')`))

/* ---------------- 4b. 坏数据：回复里没有 JSON ---------------- */
console.log('\n[4b] text 分支：回复里一个 JSON 都没有')
const r4 = await runOnce('回复里根本没有 JSON')
dumpStages(r4.stages)
const outlineStage4 = r4.stages.find((s) => s.name === '抠轮廓')
check('抠轮廓这一段被标成中断', outlineStage4.state === '中断')
check('原因写的是「回复里没有 JSON」', outlineStage4.summary.includes('JSON'), outlineStage4.summary)
const raw = await evaluate(`(() => {
  const p = [...document.querySelectorAll('.panel')].find(p => p.textContent.includes('视觉理解的原始回复'))
  return p ? p.querySelector('.draft-pre')?.textContent ?? '' : ''
})()`)
check('把 AI 的原文照出来了（复盘唯一能看的东西）', raw.includes('小房子') && raw.length > 40, `${raw.length} 字`)
check('页面仍然没有白屏', await evaluate(`document.querySelectorAll('.panel').length >= 4`))

/* ---------------- 收尾 ---------------- */
console.log('\n' + '─'.repeat(74))
if (problems.length) {
  console.log(`✗ ${problems.length} 条不过：`)
  problems.forEach((p) => console.log(`   ${p}`))
} else {
  console.log('全部通过')
}
await send('Page.captureScreenshot', {}).then((r) =>
  import('node:fs').then((fs) => fs.writeFileSync('/tmp/mcdrv/draft-final.png', Buffer.from(r.data, 'base64'))),
)
ws.close()
process.exit(problems.length ? 1 : 0)
