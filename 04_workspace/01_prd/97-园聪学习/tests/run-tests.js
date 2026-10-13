const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const engine = require('../services/question-engine')
const metrics = require('../services/learning-metrics')

const root = path.resolve(__dirname, '..')
const results = []
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log(`PASS ${name}`) }
  catch (error) { results.push({ name, ok: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`) }
}
function assert(value, message) { if (!value) throw new Error(message) }
function walk(dir, extension) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(file, extension) : (file.endsWith(extension) ? [file] : [])
  })
}

test('T01 所有 JSON 文件可以解析', () => walk(root, '.json').forEach((file) => JSON.parse(fs.readFileSync(file, 'utf8'))))

test('T02 所有 JavaScript 文件通过语法检查', () => {
  walk(root, '.js').forEach((file) => {
    const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    assert(checked.status === 0, `${path.relative(root, file)}: ${checked.stderr}`)
  })
})

test('T03 app.json 声明的页面文件齐全', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  config.pages.forEach((page) => ['js', 'json', 'wxml', 'wxss'].forEach((ext) => assert(fs.existsSync(path.join(root, `${page}.${ext}`)), `${page}.${ext} 不存在`)))
})

test('T04 随机生成 1000 局均满足出题边界', () => {
  for (let round = 0; round < 1000; round += 1) {
    const session = engine.createSession()
    assert(session.length === 5, '单局不是 5 题')
    assert(new Set(session.map((q) => `${q.operation}_${q.left}_${q.right}`)).size === 5, '单局出现重复组合')
    assert(session[0].left <= 5 && session[0].answer <= 5, '热身题过难')
    assert(session.some((q) => q.operation === 'addition'), '单局缺少加法')
    assert(session.some((q) => q.operation === 'subtraction'), '单局缺少减法')
    session.forEach((q) => {
      assert(q.left >= 1 && q.left <= 10 && q.right >= 1 && q.right <= 10 && q.answer >= 0 && q.answer <= 10, '数值越界')
      assert(q.operation === 'addition' ? q.left + q.right === q.answer : q.left - q.right === q.answer, '答案错误')
      assert(q.operation !== 'subtraction' || q.left >= q.right, '减法出现负数')
      assert(q.options.length === 3 && new Set(q.options).size === 3, '选项不唯一')
      assert(q.options.includes(q.answer), '选项不含正确答案')
      assert(q.options.every((value) => value >= 0 && value <= 10), '选项越界')
    })
  }
})

test('T05 奖励规则正确', () => {
  assert(metrics.rewardFor(5) === 2, '全首次正确应得 2 星')
  assert(metrics.rewardFor(4) === 1 && metrics.rewardFor(0) === 1, '完成局基础奖励应为 1 星')
})

test('T06 学习统计和建议规则正确', () => {
  let summary = metrics.summarize(Array.from({ length: 5 }, (_, index) => ({ operation: index < 3 ? 'addition' : 'subtraction', firstCorrect: true, hintLevel: 0 })))
  assert(summary.accuracy === 100 && summary.hintRate === 0 && summary.advice.includes('独立'), '独立掌握建议错误')
  summary = metrics.summarize(Array.from({ length: 5 }, (_, index) => ({ operation: index < 3 ? 'addition' : 'subtraction', firstCorrect: false, hintLevel: 1 })))
  assert(summary.accuracy === 0 && summary.hintRate === 100 && summary.advice.includes('逐个数'), '提示依赖建议错误')
})

test('T07 WXML 绑定事件均有页面处理函数', () => {
  const pages = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).pages
  pages.forEach((pagePath) => {
    const wxml = fs.readFileSync(path.join(root, `${pagePath}.wxml`), 'utf8')
    const events = [...wxml.matchAll(/bind(?:tap|touchstart|touchend|touchcancel|input|change)="([A-Za-z0-9_]+)"/g)].map((match) => match[1])
    let config
    global.Page = (value) => { config = value }
    const jsPath = path.join(root, `${pagePath}.js`)
    delete require.cache[require.resolve(jsPath)]
    require(jsPath)
    events.forEach((event) => assert(config && typeof config[event] === 'function', `${pagePath}: 缺少 ${event}`))
  })
})

test('T08 十以内加减法语音片段齐全', () => {
  const clips = ['add_question', 'sub_question', 'add_hint', 'sub_hint']
    .concat(Array.from({ length: 10 }, (_, index) => `have_${index + 1}`))
    .concat(Array.from({ length: 10 }, (_, index) => `add_${index + 1}`))
    .concat(Array.from({ length: 10 }, (_, index) => `sub_${index + 1}`))
  clips.forEach((clip) => {
    const file = path.join(root, `assets/audio/voice/${clip}.wav`)
    assert(fs.existsSync(file) && fs.statSync(file).size > 8000, `${path.basename(file)} 缺失、无音频数据或时长异常`)
    assert(fs.readFileSync(file).subarray(0, 4).toString() === 'RIFF', `${path.basename(file)} 不是有效 WAV 容器`)
  })
})

test('T11 旧会话会失效且有效题目必含正确答案', () => {
  global.Page = () => {}
  const game = require('../pages/game/game')
  const oldSession = { id: 'old', startedAt: Date.now(), status: 'active', questions: [{ left: 3, right: 1, answer: 4, options: [3, 4, 5] }] }
  assert(!game.isValidSession(oldSession), '旧版会话未被拒绝')
  const questions = engine.createSession()
  const session = { version: 2, id: 'new', startedAt: Date.now(), status: 'active', questions }
  assert(game.isValidSession(session), '新版有效会话被误拒绝')
  questions.forEach((q) => assert(q.options.includes(q.answer), `${q.id} 的选项不含答案`))
})

test('T09 关键触控尺寸和字号符合基线', () => {
  const appCss = fs.readFileSync(path.join(root, 'app.wxss'), 'utf8')
  const gameCss = fs.readFileSync(path.join(root, 'pages/game/game.wxss'), 'utf8')
  assert(appCss.includes('min-height: 104rpx'), '主按钮低于基线')
  assert(gameCss.includes('min-height:120rpx') && gameCss.includes('font-size:55rpx'), '横屏答案按钮尺寸或数字字号不足')
})

test('T10 生产页面不含远程资源和禁止文案', () => {
  const production = walk(path.join(root, 'pages'), '.wxml').concat(walk(path.join(root, 'pages'), '.js')).map((file) => fs.readFileSync(file, 'utf8')).join('\n')
  assert(!/https?:\/\//.test(production), '发现远程资源')
  ;['排行榜', '分享换', '不及格', '你失败了', '太笨'].forEach((word) => assert(!production.includes(word), `发现禁止内容：${word}`))
})

test('T12 预计主包资源小于 2MB', () => {
  const roots = ['app.js', 'app.json', 'app.wxss', 'sitemap.json', 'pages', 'services', 'components', 'assets']
  const files = roots.flatMap((name) => {
    const target = path.join(root, name)
    return fs.statSync(target).isDirectory() ? walk(target, '') : [target]
  })
  const total = files.reduce((sum, file) => sum + fs.statSync(file).size, 0)
  assert(total < 2 * 1024 * 1024, `预计主包 ${(total / 1024 / 1024).toFixed(2)}MB，超过 2MB`)
})

test('T13 帮助提示讲方法且不直接拼接答案', () => {
  const source = fs.readFileSync(path.join(root, 'pages/game/game.js'), 'utf8')
  const helpBody = source.slice(source.indexOf('useHelp()'), source.indexOf('playHelp(name)'))
  assert(helpBody.includes('把两边放在一起') && helpBody.includes('拿走指定数量'), '加减法方法提示不完整')
  assert(!helpBody.includes('question.answer'), '帮助按钮仍直接使用答案')
})

test('T14 多板块首页配置完整且路由安全', () => {
  let indexPage
  global.Page = (config) => { indexPage = config }
  const indexPath = path.join(root, 'pages/index/index.js')
  delete require.cache[require.resolve(indexPath)]
  require(indexPath)
  const modules = indexPage.data.modules
  assert(Array.isArray(modules) && modules.length >= 4, '首页板块少于4个')
  assert(new Set(modules.map((item) => item.id)).size === modules.length, '板块ID不唯一')
  modules.forEach((item) => {
    assert(item.id && item.name && item.icon && item.theme && item.status && item.stateText, `${item.id || '未知板块'}配置不完整`)
    if (item.status === 'active') assert(item.route && item.route.startsWith('/pages/'), `${item.id}缺少有效路由`)
    if (item.status === 'coming') assert(!item.route, `${item.id}准备中却配置了路由`)
  })
})

test('T15 首页离线语音齐全', () => {
  ;['home_welcome', 'home_guide', 'coming'].forEach((name) => {
    const file = path.join(root, `assets/audio/home/${name}.wav`)
    assert(fs.existsSync(file) && fs.statSync(file).size > 8000, `${name}.wav缺失或无效`)
    assert(fs.readFileSync(file).subarray(0, 4).toString() === 'RIFF', `${name}.wav不是有效WAV`)
  })
})

test('T16 全部页面强制横屏并使用自定义导航', () => {
  const pages = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).pages
  pages.forEach((page) => {
    const config = JSON.parse(fs.readFileSync(path.join(root, `${page}.json`), 'utf8'))
    assert(config.pageOrientation === 'landscape', `${page}未配置横屏`)
    assert(config.navigationStyle === 'custom', `${page}未使用自定义导航`)
  })
})

test('T17 第一阶段四个模块均已开放且路由存在', () => {
  let indexPage
  global.Page = (config) => { indexPage = config }
  const indexPath = path.join(root, 'pages/index/index.js')
  delete require.cache[require.resolve(indexPath)]
  require(indexPath)
  const expected = ['math', 'count', 'split', 'dice']
  assert(expected.every((id) => indexPage.data.modules.some((item) => item.id === id && item.status === 'active')), '第一阶段模块未全部开放')
  indexPage.data.modules.forEach((item) => assert(fs.existsSync(path.join(root, `${item.route.slice(1)}.js`)), `${item.id}路由文件不存在`))
})

test('T18 休息管理为10分钟且锁定后必须重置', () => {
  const oldWx = global.wx; const oldNow = Date.now; const memory = {}
  global.wx = { getStorageSync: (key) => memory[key], setStorageSync: (key, value) => { memory[key] = value }, removeStorageSync: (key) => { delete memory[key] } }
  let now = 100000; Date.now = () => now
  const managerPath = path.join(root, 'services/session-manager.js'); delete require.cache[require.resolve(managerPath)]; const manager = require(managerPath)
  assert(manager.LIMIT === 10 * 60 * 1000, '休息时长不是10分钟')
  manager.start(); now += manager.LIMIT + 1; assert(manager.shouldRest(), '满10分钟未触发休息')
  manager.lock(); assert(manager.isLocked() && manager.shouldRest(), '结束后未锁定')
  manager.reset(); assert(!manager.isLocked() && !manager.shouldRest(), '家长继续后未重置')
  Date.now = oldNow; global.wx = oldWx
})

test('T19 新游戏触控尺寸和点数语音符合iPad基线', () => {
  const css = ['pages/count/count.wxss', 'pages/split/split.wxss', 'pages/dice/dice.wxss'].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n')
  assert(css.includes('width:120rpx') && css.includes('min-height:120rpx'), '点数或答案触控区域小于120rpx')
  for (let number = 1; number <= 10; number += 1) {
    const file = path.join(root, `assets/audio/count/num_${number}.wav`)
    assert(fs.existsSync(file) && fs.statSync(file).size > 5000, `点数语音${number}缺失`)
  }
})

test('T20 横屏页面允许纵向滚动', () => {
  const pages = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).pages
  pages.forEach((page) => {
    const config = JSON.parse(fs.readFileSync(path.join(root, `${page}.json`), 'utf8'))
    assert(config.disableScroll !== true, `${page}禁用了页面滚动`)
    const css = fs.readFileSync(path.join(root, `${page}.wxss`), 'utf8')
    assert(!/(^|[;{])height:100vh;[^}]*overflow:hidden/.test(css), `${page}使用固定高度并隐藏溢出`)
  })
})

test('T21 手机与iPad尺寸分类正确', () => {
  const device = require('../services/device-profile')
  assert(device.classifyDevice(844, 390) === 'phone', '手机横屏被错误识别')
  assert(device.classifyDevice(1024, 768) === 'tablet', 'iPad横屏被错误识别')
  assert(device.classifyDevice(768, 1024) === 'tablet', 'iPad竖屏被错误识别')
  assert(device.classifyDevice(600, 900) === 'tablet', '600px边界识别错误')
  assert(device.classifyDevice(599, 1000) === 'phone', '599px边界识别错误')
})

test('T22 手机真机使用运行时设备类型适配', () => {
  const css = fs.readFileSync(path.join(root, 'app.wxss'), 'utf8')
  assert(css.includes('.safe-page.device-phone'), '缺少运行时手机根样式')
  ;['.landscape-main', '.modules', '.object', '.baskets', '.game-head', '.die'].forEach((selector) => assert(css.includes(`.device-phone ${selector}`), `手机适配缺少${selector}`))
  ;['index', 'count', 'split', 'game', 'dice', 'result', 'parent'].forEach((page) => {
    const wxml = fs.readFileSync(path.join(root, `pages/${page}/${page}.wxml`), 'utf8')
    const js = fs.readFileSync(path.join(root, `pages/${page}/${page}.js`), 'utf8')
    assert(wxml.includes('device-{{deviceType}}'), `${page}未绑定设备类型样式`)
    assert(js.includes('deviceType'), `${page}未设置设备类型`)
  })
  assert(css.includes('width:120rpx') && css.includes('min-height:120rpx'), '手机适配未保留120rpx触控基线')
})

test('T23 手机休息提示紧凑且弹窗不使用不兼容min函数', () => {
  const restWxml = fs.readFileSync(path.join(root, 'components/rest-overlay/rest-overlay.wxml'), 'utf8')
  const restJs = fs.readFileSync(path.join(root, 'components/rest-overlay/rest-overlay.js'), 'utf8')
  const restCss = fs.readFileSync(path.join(root, 'components/rest-overlay/rest-overlay.wxss'), 'utf8')
  assert(restWxml.includes('rest-mask {{deviceType}}'), '休息提示未绑定设备类型')
  assert(restJs.includes("device-profile") && restJs.includes('onWindowResize'), '休息提示不能跟随真机尺寸变化')
  assert(restCss.includes('.rest-mask.phone') && restCss.includes('.phone .rest-card'), '缺少手机休息提示紧凑样式')
  assert(restCss.includes('max-width:58vw') && restCss.includes('font-size:30rpx'), '手机休息提示仍然过大')
  const styles = walk(root).filter((file) => file.endsWith('.wxss')).map((file) => fs.readFileSync(file, 'utf8')).join('\n')
  assert(!styles.includes('width:min('), '弹窗仍使用部分微信内核不兼容的width:min()')
})

test('T24 手机横屏关键尺寸使用px避免rpx宽屏放大', () => {
  const css = fs.readFileSync(path.join(root, 'app.wxss'), 'utf8')
  const marker = '/* 手机横屏使用 px'
  const compact = css.slice(css.indexOf(marker))
  assert(compact.includes('.safe-page.device-phone{padding:6px calc(12px + env(safe-area-inset-right))'), '手机页面未使用px紧凑安全边距')
  assert(compact.includes('.device-phone .primary{min-height:48px'), '手机主按钮仍会随横屏宽度放大')
  assert(compact.includes('.device-phone .module-title{font-size:16px'), '手机模块文字仍会随横屏宽度放大')
  assert(compact.includes('.device-phone .bottom-nav{gap:70px'), '手机底部导航未使用固定尺寸')
  const restCss = fs.readFileSync(path.join(root, 'components/rest-overlay/rest-overlay.wxss'), 'utf8')
  assert(restCss.includes('.rest-mask.phone{padding:10px 100px'), '手机休息提示未使用px安全边距')
  assert(restCss.includes('.phone .title{margin-top:3px;font-size:18px'), '手机休息标题仍然过大')
})

test('T25 页面外弹窗绑定手机类型且首次设置可完整操作', () => {
  const css = fs.readFileSync(path.join(root, 'app.wxss'), 'utf8')
  const indexWxml = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8')
  assert(indexWxml.includes('setup-mask device-{{deviceType}}'), '首次设置弹窗未绑定设备类型')
  assert(indexWxml.includes('bindtap="finishSetup"'), '首次设置缺少完成入口')
  assert(css.includes('.setup-mask.device-phone .setup{width:720px;max-width:100%'), '首次设置弹窗未限制手机可视宽度')
  assert(css.includes('max-height:calc(100vh - 16px)') && css.includes('overflow-y:auto'), '首次设置弹窗缺少小屏高度兜底')
  assert(css.includes('.setup-mask.device-phone .name-side .primary{min-height:44px'), '手机设置完成按钮不可用')
  ;['count', 'split', 'dice'].forEach((page) => {
    const wxml = fs.readFileSync(path.join(root, `pages/${page}/${page}.wxml`), 'utf8')
    assert(wxml.includes('complete-mask device-{{deviceType}}'), `${page}完成弹窗未绑定设备类型`)
  })
  ;['game', 'parent'].forEach((page) => {
    const wxml = fs.readFileSync(path.join(root, `pages/${page}/${page}.wxml`), 'utf8')
    assert(wxml.includes('mask device-{{deviceType}}'), `${page}确认弹窗未绑定设备类型`)
  })
})

test('T26 点数密度与分解篮筐手机布局正确', () => {
  const css = fs.readFileSync(path.join(root, 'app.wxss'), 'utf8')
  const countJs = fs.readFileSync(path.join(root, 'pages/count/count.js'), 'utf8')
  const countWxml = fs.readFileSync(path.join(root, 'pages/count/count.wxml'), 'utf8')
  assert(countJs.includes("answer <= 4 ? 'few' : answer <= 7 ? 'medium' : 'dense'"), '点数图标未按数量调整密度')
  assert(countWxml.includes('objects {{objectSizeClass}}'), '点数密度样式未绑定')
  ;['few', 'medium', 'dense'].forEach((size) => assert(css.includes(`.count-page.device-phone .objects.${size} .object`), `缺少${size}点数尺寸`))
  const splitJs = fs.readFileSync(path.join(root, 'pages/split/split.js'), 'utf8')
  const splitCss = fs.readFileSync(path.join(root, 'pages/split/split.wxss'), 'utf8')
  assert(splitJs.includes("select('.left-basket').boundingClientRect()") && splitJs.includes('inside(this.leftRect)'), '拖拽未按篮筐真实边界判定')
  assert(!splitJs.includes('this.windowHeight * .43'), '仍使用固定屏幕比例判断篮筐')
  assert(splitCss.includes('box-sizing:border-box;overflow:hidden'), '篮筐内容仍可能超出边框')
  assert(css.includes('.split-page.device-phone .source-zone .feedback{height:28px'), '手机积木源区提示仍会挤出积木')
})

test('T27 加减法物体宽度规则不会污染点数页', () => {
  const css = fs.readFileSync(path.join(root, 'app.wxss'), 'utf8')
  assert(css.includes('.game.device-phone .objects{max-width:130px;font-size:29px}'), '加减法实物容器缺少手机宽度规则')
  assert(!/(^|\n)\.device-phone \.objects\{max-width:130px/.test(css), '加减法实物宽度规则仍会污染其他页面')
  assert(css.includes('.count-page.device-phone .content{grid-template-columns:74% 1fr}'), '点数页未充分使用左侧空间')
  assert(css.includes('.count-page.device-phone .objects.few .object{width:96px'), '少量点数图标仍然过小')
})

const failed = results.filter((item) => !item.ok)
console.log(`\nRESULT ${results.length - failed.length}/${results.length} passed`)
process.exitCode = failed.length ? 1 : 0
