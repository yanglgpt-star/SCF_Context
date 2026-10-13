/**
 * M5 实测录入页端到端。
 *
 * 关键手法：夹具照片是**画出来的**，每条边的像素长度都是已知的整数，
 * 所以「量出来的 ratio 对不对」有唯一正确答案，不用靠肉眼。
 *
 *   1200×1200 的画布上摆三个形状：
 *     正方形   (100,100)-(500,500)      边 400
 *     三角形   (700,100),(1100,100),(1100,500)   直角边 400，斜边 400√2 = 565.685
 *     长方形   (100,700)-(900,1100)     长 800，短 400
 *
 *   参考边 = 正方形上边 400px ↔ 7.5cm
 *   于是期望：SQ 1.0000、TRI-R 直角边 1.0000 / 斜边 1.4142、RECT 长边 2.0000 / 短边 1.0000
 */
import path from 'node:path'

const PORT = 9333
const BASE = process.argv[2] ?? 'http://localhost:5273/base/measure'
// 夹具照片是**下面那段 canvas 代码当场画出来的**（边长都是已知整数），不是手工拍的 ——
// 所以这个文件属于「脚本的产物」，画完落在这里，build-e2e 也读它。别手工替换它。
//
// 用 path.join 而不是 `new URL(...).pathname`：**那个 .pathname 是百分号编码过的**，
// 而这个项目的路径里有中文（`96_磁力贴搭建`），直接拿去做 fs 路径会 ENOENT。
const FILE = path.join(import.meta.dirname, 'fixtures', 'fixture-photo.png')
const NAT = 1200

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
await send('DOM.enable')
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
await sleep(2800)

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
  await sleep(120)
}

async function escape() {
  for (const type of ['keyDown', 'keyUp']) {
    await send('Input.dispatchKeyEvent', {
      type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
    })
  }
}

/** 选一个 antd Select（页面上的第 nth 个）里的某一项 */
async function pick(nth, optionText, label) {
  await click('.ant-select', { nth, label })
  await sleep(400)
  const changed = await evaluate(`(() => {
    const all = [...document.querySelectorAll('.ant-select-item-option')]
    return all.map(e => e.textContent.trim())
  })()`)
  await click('.ant-select-item-option', { text: optionText, label: `选项「${optionText}」（可选：${changed.join(' / ')}）` })
  await sleep(250)
  await escape()
  await sleep(250)
}

/**
 * 点照片上的一个**原始像素**坐标。
 *
 * 照片被显示成多大是未知的，而且大图会在容器里滚动 —— 所以先把目标点滚到
 * 容器正中、**重新量一次** getBoundingClientRect，再换算成屏幕坐标。
 * 先量后滚的话，滚动量会直接变成点击误差。
 */
async function clickNatural(nx, ny, label) {
  const spot = await evaluate(`(() => {
    const host = document.querySelector('.measure-host')
    const img = document.querySelector('.measure-img')
    if (!host || !img) return null
    const before = img.getBoundingClientRect()
    if (!before.width) return null
    const hr = host.getBoundingClientRect()
    // 先把目标点滚到容器中央
    const k0 = before.width / ${NAT}
    host.scrollLeft += (before.left + ${nx} * k0) - (hr.left + hr.width / 2)
    host.scrollTop += (before.top + ${ny} * k0) - (hr.top + hr.height / 2)
    // 滚动之后再量
    const r = img.getBoundingClientRect()
    const h2 = host.getBoundingClientRect()
    const k = r.width / ${NAT}
    const x = r.left + ${nx} * k
    const y = r.top + ${ny} * k
    return {
      x, y, k,
      inside: x >= h2.left && x <= h2.right && y >= h2.top && y <= h2.bottom,
      shown: Math.round(r.width),
    }
  })()`)
  if (!spot) throw new Error(`找不到照片：${label}`)
  if (!spot.inside) throw new Error(`${label} 的目标点不在可视区内（照片显示成 ${spot.shown}px 宽，滚不过去）`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: spot.x, y: spot.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: spot.x, y: spot.y, button: 'left', clickCount: 1 })
  await sleep(160)
  return spot
}

console.log('='.repeat(74))
console.log(`页面 ${BASE}\n`)

/* ---------------- 菜单与路由 ---------------- */
console.log('[1] 菜单与路由')
const menuLabel = await evaluate(
  `[...document.querySelectorAll('.ant-menu-title-content')].map(e=>e.textContent.trim()).filter(t=>t==='实测录入').length`,
)
check('三级菜单里有「实测录入」', menuLabel === 1, `${menuLabel} 个`)
check(
  '页面标题是实测录入',
  (await evaluate(`document.querySelector('.page-title')?.textContent ?? ''`)) === '实测录入',
)

/* ---------------- 造夹具照片 ---------------- */
console.log('\n[2] 造一张几何已知的夹具照片')
const dataUrl = await evaluate(`(() => {
  const c = document.createElement('canvas')
  c.width = ${NAT}; c.height = ${NAT}
  const x = c.getContext('2d')
  x.fillStyle = '#F5F3EE'; x.fillRect(0, 0, ${NAT}, ${NAT})
  const draw = (fill, stroke, path) => {
    x.beginPath(); path(x); x.closePath()
    x.fillStyle = fill; x.fill()
    x.lineWidth = 6; x.strokeStyle = stroke; x.stroke()
  }
  // 正方形 (100,100)-(500,500)
  draw('#E4572E', '#8C2F14', (p) => p.rect(100, 100, 400, 400))
  // 直角三角形 (700,100),(1100,100),(1100,500) —— 两条直角边都是 400
  draw('#2E86AB', '#12455C', (p) => { p.moveTo(700, 100); p.lineTo(1100, 100); p.lineTo(1100, 500) })
  // 长方形 (100,700)-(900,1100) —— 800×400
  draw('#4CAF50', '#1F5B24', (p) => p.rect(100, 700, 800, 400))
  return c.toDataURL('image/png')
})()`)
if (!dataUrl?.startsWith('data:image/png;base64,')) throw new Error('夹具照片没画出来')
const b64 = dataUrl.slice('data:image/png;base64,'.length)
const { writeFileSync } = await import('node:fs')
writeFileSync(FILE, Buffer.from(b64, 'base64'))
console.log(`     ${FILE}  ${(b64.length / 1365).toFixed(0)} KB`)

/* ---------------- 上传（走真的上传通道） ---------------- */
console.log('\n[3] 上传照片')
const inputObj = await send('Runtime.evaluate', {
  expression: `document.querySelector('.measure-drop input[type=file]') || document.querySelector('input[type=file]')`,
  returnByValue: false,
})
if (!inputObj.result?.objectId) throw new Error('页面上找不到 file input')
await send('DOM.setFileInputFiles', { files: [FILE], objectId: inputObj.result.objectId })
await sleep(2500)

const photoState = await evaluate(`(() => {
  const img = document.querySelector('.measure-img')
  if (!img) return null
  return { w: img.naturalWidth, h: img.naturalHeight, complete: img.complete, shown: Math.round(img.getBoundingClientRect().width) }
})()`)
check('照片进了页面并且解出来了', Boolean(photoState && photoState.w === NAT && photoState.h === NAT), JSON.stringify(photoState))
const photoSrc = await evaluate(`document.querySelector('.measure-img')?.getAttribute('src') ?? ''`)
check('照片是从 library/shots/ 读回来的', /shots\/measure\./.test(decodeURIComponent(photoSrc)), decodeURIComponent(photoSrc))

/* ---------------- 标参考边 ---------------- */
console.log('\n[4] 标参考边（正方形上边 400px ↔ 7.5cm）')
await clickNatural(100, 100, '参考边左端')
const pendingAfterOne = await evaluate(`!!document.querySelector('.measure-pending')`)
check('点第一个点之后画面上出现待定点', pendingAfterOne)
await clickNatural(500, 100, '参考边右端')

const refTag = await evaluate(
  `[...document.querySelectorAll('.panel')].map(p=>p.querySelector('.panel-head .ant-tag')?.textContent).find(t=>t && t.includes('比例尺')) ?? ''`,
)
check('参考边建立后标为「已建立比例尺」', refTag.includes('已建立'), `Tag = ${JSON.stringify(refTag)}`)

const refPx = await evaluate(
  `[...document.querySelectorAll('.measure-ref .faint')].map(e=>e.textContent).find(t=>t.includes('像素')) ?? ''`,
)
check('页面上写出参考边有多少像素', /40\d\s*像素/.test(refPx), refPx.replace(/\s+/g, ' '))
check('比例尺算对了（400px ↔ 7.5cm → 每像素 0.01875）', await evaluate(`document.body.textContent.includes('0.0187')`))

// 标完之后应该自动切到「标形状边」。
// 页面上有两个 Segmented（左边缩放、右边模式），必须**定位到模式那一个** ——
// 按 ant-segmented-block 找。
//
// ★ 判据是 `.ant-segmented-item-selected-text`，**不是** `.ant-segmented-item-selected`。
// 这两个类不是一回事，见 `@rc-component/segmented/es/index.js:180`：
//
//     [`${prefixCls}-item-selected`]: optionValue === rawValue && !thumbShow,
//     [`${prefixCls}-item-selected-text`]: optionValue === rawValue,
//
// 滑动底色那个 `thumbShow` 是 onMotionStart 置 true、onMotionEnd 才置回 false。
// **标签页被遮挡时 CSS transition 的结束事件可能永远不来**，于是 thumbShow 卡在 true，
// 于是 `-selected` 永远不出现 —— 看起来完全像「没切过去」，而它其实早就切过去了。
// `-selected-text` 只看值等不等，与动画无关，是这个断言的正确判据。
//
// 这个坑的形态值得记：**单跑绿、放进整套里连跑就红**。因为整套里前面刚跑完 draft，
// 标签页被 Chrome 判成遮挡，动画事件不来。当时第一反应是「阈值太紧」，
// 把它从 1.5 秒调到 6 秒 —— 调完照样红（等到 6054ms 还是没有），才发现根本不是时间问题。
const readSeg = () =>
  evaluate(`[...document.querySelectorAll('.ant-segmented')].map(s => ({
    block: s.classList.contains('ant-segmented-block'),
    options: [...s.querySelectorAll('.ant-segmented-item')].map(e => e.textContent.trim()),
    selected: [...s.querySelectorAll('.ant-segmented-item-selected-text')].map(e => e.textContent.trim()),
  }))`)
const t0 = Date.now()
let segGroups = await readSeg()
while (Date.now() - t0 < 3000) {
  const g = segGroups.find((x) => x.block)
  if (g?.selected[0] === '标形状边') break
  await sleep(80)
  segGroups = await readSeg()
}
const modeGroup = segGroups.find((g) => g.block)
check(
  '标完参考边自动切到「标形状边」',
  modeGroup?.selected.length === 1 && modeGroup.selected[0] === '标形状边',
  `模式控件 = ${JSON.stringify(modeGroup)}（等到第 ${Date.now() - t0}ms）；页面上所有 Segmented：${JSON.stringify(segGroups)}`,
)

/* ---------------- 标各条边 ---------------- */
console.log('\n[5] 标各形状的边')
const EDGES = [
  { shape: '正方形', label: '边长', a: [100, 100], b: [500, 100], want: 1, desc: '正方形上边 400px' },
  { shape: '正方形', label: '边长', a: [100, 500], b: [500, 500], want: 1, desc: '正方形下边 400px（同一形状同一边名第二次）' },
  { shape: '等腰直角三角形', label: '直角边', a: [700, 100], b: [1100, 100], want: 1, desc: '三角形上边 400px' },
  { shape: '等腰直角三角形', label: '斜边', a: [700, 100], b: [1100, 500], want: Math.SQRT2, desc: '三角形斜边 400√2 = 565.7px' },
  { shape: '长方形', label: '长边', a: [100, 700], b: [900, 700], want: 2, desc: '长方形上边 800px' },
  { shape: '长方形', label: '短边', a: [100, 700], b: [100, 1100], want: 1, desc: '长方形左边 400px' },
]

for (const e of EDGES) {
  await pick(0, e.shape, '形状下拉')
  await sleep(300)
  await pick(1, e.label, '边名下拉')
  await sleep(200)
  await clickNatural(e.a[0], e.a[1], `${e.desc} 起点`)
  await clickNatural(e.b[0], e.b[1], `${e.desc} 终点`)
  const n = await evaluate(`document.querySelectorAll('.measure-list li').length`)
  console.log(`     第 ${n} 条：${e.shape} · ${e.label}   ← ${e.desc}`)
}

const listCount = await evaluate(`document.querySelectorAll('.measure-list li').length`)
check('六条边都记下来了', listCount === EDGES.length, `${listCount} 条`)
const badCount = await evaluate(`document.querySelectorAll('.measure-list li.is-bad').length`)
check('没有一条被判为误点', badCount === 0, `${badCount} 条标红`)

/* ---------------- 算出来的尺寸 ---------------- */
console.log('\n[6] 算出来的尺寸对不对')
const results = await evaluate(`(() => {
  const out = {}
  for (const box of document.querySelectorAll('.measure-result')) {
    const name = box.querySelector('.measure-result__shape').textContent.trim()
    out[name] = {}
    for (const row of box.querySelectorAll('.measure-result__row')) {
      const label = row.querySelector('.faint').textContent.trim()
      const ratio = parseFloat(row.querySelector('.mono').textContent)
      out[name][label] = ratio
    }
  }
  return out
})()`)

const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol
for (const e of EDGES.filter((x, i, arr) => arr.findIndex((y) => y.shape === x.shape && y.label === x.label) === i)) {
  const got = results[e.shape]?.[e.label]
  check(
    `${e.shape} · ${e.label} = ${e.want.toFixed(4)} a`,
    near(got, e.want, 0.004),
    `实际 ${got}`,
  )
}

const multi = await evaluate(`(() => {
  const li = [...document.querySelectorAll('.measure-list li')].find(l => l.textContent.includes('正方形'))
  return li ? li.querySelector('.measure-list__val')?.textContent ?? '' : ''
})()`)
check('同一条边名标两次取平均（不是取最后一条）', multi.includes('1.000'), `列表里显示 ${multi}`)
const spread = await evaluate(`document.querySelector('.measure-result__n .ant-tag')?.textContent ?? ''`)
check('画出「标了几次 · 差多少」', /2 次 · 差/.test(spread), `Tag = ${JSON.stringify(spread)}`)

/* ---------------- 保存标注 ---------------- */
console.log('\n[6.5] 保存标注到 measure.json')
await click('button', { text: '保存标注', label: '保存标注' })
await sleep(900)
const saveMsg = await evaluate(`document.querySelector('.ant-message')?.textContent ?? ''`)
check('标注落盘有成功提示', /measure\.json/.test(saveMsg), saveMsg.trim())
const measureFile = await (await fetch(`http://localhost:5273/api/fs/read?path=measure.json`)).json()
check(
  'measure.json 里六条标注与参考边都在',
  measureFile.data?.marks?.length === 6 && measureFile.data?.ref?.cm === 7.5 && measureFile.data?.photo === 'shots/measure.png',
  `marks=${measureFile.data?.marks?.length} ref=${JSON.stringify(measureFile.data?.ref)} photo=${measureFile.data?.photo} 尺寸=${measureFile.data?.imageW}×${measureFile.data?.imageH}`,
)
// 磁盘上不许出现 data URL —— 那是最容易悄悄长出来的东西
check(
  'measure.json 里没有 data URL（照片只存引用）',
  !JSON.stringify(measureFile.data ?? {}).includes('data:image'),
  `${JSON.stringify(measureFile.data ?? {}).length} 字节`,
)

/* ---------------- 应用并入库 ---------------- */
console.log('\n[7] 应用并入库')
await click('.ant-btn-primary', { label: '应用并入库' })
await sleep(700)
// antd v6 的类名跟 v5 不一样：内容块是 .ant-modal-container（v5 是 .ant-modal-content），
// 底部按钮区是 .ant-modal-confirm-btns（v5 是 .ant-modal-footer）。
const confirmText = await evaluate(`document.querySelector('.ant-modal-container')?.textContent ?? ''`)
check('弹出确认框并列出将写入的每一条', confirmText.includes('基准单位 a') && confirmText.includes('正方形'), confirmText.slice(0, 130).replace(/\s+/g, ' '))
check('确认框里点名了没标到的形状（不留一半默认值还不吭声）', confirmText.includes('保持原值'), confirmText.includes('等腰直角三角形') ? '列出了三角形' : '')
// 量出来正好等于默认值的形状也必须列出来 —— 判据是「标到没有」，不是「值变了没有」
const confirmLines = await evaluate(`[...document.querySelectorAll('.measure-confirm li')].map(e=>e.textContent.trim())`)
const sqLine = confirmLines.find((l) => l.startsWith('正方形'))
check(
  '量出来正好等于默认值的边也照样列出来（正方形边长 = 1.0，跟原值一样）',
  Boolean(sqLine) && /边长\s*→\s*1\b/.test(sqLine),
  `列表 = ${JSON.stringify(confirmLines)}`,
)

await click('.ant-modal-confirm-btns .ant-btn-primary', { label: '确认写入' })
await sleep(1400)
const after = await evaluate(`document.querySelector('.ant-message')?.textContent ?? ''`)
check('写入后有成功提示', /已写入|shapes\.json/.test(after), after.trim())

/* ---------------- 落盘结果 ---------------- */
console.log('\n[8] library/shapes.json 里的数')
const file = await (await fetch(`http://localhost:5273/api/fs/read?path=shapes.json`)).json()
const shapes = file.data?.shapes ?? []
const byId = Object.fromEntries(shapes.map((s) => [s.id, s]))

check('unit 被改成参考边那个读数的 7.5', file.data?.unit === 7.5, `unit = ${file.data?.unit}`)
check('来源写明是实测的，不再是「待卡尺核对」', /实测/.test(file.data?.source ?? ''), file.data?.source)
// 落盘的数是从「屏幕上点出来的像素」推的，而驱动点的是屏幕坐标 —— 落点差
// 半个像素，读出来就是 400.5 而不是 400（这次 RECT 短边读到 1.0013，就是驱动
// 点在了 y=99.4 而不是 100）。这不是页面算错，是**照片测量的分辨率下限**，
// 所以这里和 [6] 用同一个容差；要求精确等于整数反而是个假断言。
check('SQ 边长 = 1', near(byId.SQ?.edges?.[0]?.ratio, 1, 0.004), `${byId.SQ?.edges?.[0]?.ratio}`)
check('TRI-R 直角边 = 1', near(byId['TRI-R']?.edges?.[0]?.ratio, 1, 0.004), `${byId['TRI-R']?.edges?.[0]?.ratio}`)
check('TRI-R 斜边 = 1.4142', near(byId['TRI-R']?.edges?.[1]?.ratio, Math.SQRT2, 0.001), `${byId['TRI-R']?.edges?.[1]?.ratio}`)
check('RECT 长边 = 2', near(byId.RECT?.edges?.[0]?.ratio, 2, 0.008), `${byId.RECT?.edges?.[0]?.ratio}`)
check('RECT 短边 = 1', near(byId.RECT?.edges?.[1]?.ratio, 1, 0.004), `${byId.RECT?.edges?.[1]?.ratio}`)

// 面积与占格数是形状定义，不是量出来的 —— 必须原样不动
check('areaRatio 没被动（面积不是量出来的）', byId.SQ?.areaRatio === 1 && byId['TRI-R']?.areaRatio === 0.5 && byId.RECT?.areaRatio === 2,
  `${byId.SQ?.areaRatio} / ${byId['TRI-R']?.areaRatio} / ${byId.RECT?.areaRatio}`)
check('tCount 没被动', byId.SQ?.tCount === 2 && byId['TRI-R']?.tCount === 1 && byId.RECT?.tCount === 4,
  `${byId.SQ?.tCount} / ${byId['TRI-R']?.tCount} / ${byId.RECT?.tCount}`)
check('一条边都没标的形状（等边三角形）原样留着', byId['TRI-E']?.edges?.[0]?.ratio === 1 && byId['TRI-E']?.planar === false)

/* ---------------- 刷新后还在 ---------------- */
console.log('\n[9] 刷新后标注还在（说明存下来了）')
await send('Page.navigate', { url: BASE })
await sleep(2600)
const restored = await evaluate(`(() => ({
  marks: document.querySelectorAll('.measure-list li').length,
  hasRef: /已建立比例尺/.test(document.body.textContent),
  photo: !!document.querySelector('.measure-img'),
}))()`)
check('标注与参考边都读回来了', restored.marks === 6 && restored.hasRef && restored.photo, JSON.stringify(restored))

/* ---------------- 收尾 ---------------- */
console.log('\n' + '─'.repeat(74))
if (problems.length) {
  console.log(`✗ ${problems.length} 条不过：`)
  problems.forEach((p) => console.log(`   ${p}`))
} else {
  console.log('全部通过')
}
await send('Page.captureScreenshot', {}).then((r) =>
  import('node:fs').then((fs) => fs.writeFileSync('/tmp/mcdrv/measure-final.png', Buffer.from(r.data, 'base64'))),
)
ws.close()
process.exit(problems.length ? 1 : 0)
