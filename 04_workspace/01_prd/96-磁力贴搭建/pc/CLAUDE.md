# 磁力贴工作台（PC 端）

亲子向磁力贴搭建内容工厂的 PC 工作台。一期跑通五步链路：
**生成草稿图 → 用实测尺寸模拟拼贴 → 实际搭建 → 拆解流程图 → 存入资产库**。
不做小程序、不做视频渲染、不做自动发布。

上级方案文档在 `../01-整体方案.md`、`../02-可拼贴性求解引擎.md`、`../03-资产库与内容管线.md`。

## 技术栈

| 技术 | 版本 | 说明 |
|---|---|---|
| React | 19 | 函数组件 + Hooks，纯 JSX，**不用 TypeScript** |
| React Router | 7 | |
| Ant Design | 6 | 主题 token 见 `src/theme.js` |
| Vite | 8 | dev 中间件兼当迷你后端 |
| dayjs | 1.x | |

## 启动

```bash
cd pc
npm install
npm run dev          # http://localhost:5273
```

开发服务器启动时会打印两行地址：`library/` 的真实绝对路径，以及 **AI 当前是 mock 还是 live**。
后者要养成看一眼的习惯 —— mock 出的草稿图是夹具，不是模型画的。

| 命令 | 用途 |
|---|---|
| `npm run bench` | M3 求解器：20 个内置轮廓的成功率/耗时/降级落点 |
| `npm run bench:snap` | M4 吸附：13 条用例 + 3 条全局断言 |
| `npm run bench:extract` | M4 轮廓提取：10 条用例，管「两条路走哪条」的决策 |
| `npm run bench:export` | M4 导出：对导出 SVG 字符串断言自包含性（没有 `var(`/`class=`、颜色是 hex、底色在、片数对得上） |
| `npm run bench:measure` | M5 实测换算：10 条用例 + 3 条全局性质，外加写回形状定义的 4 条 |
| `npm run bench:lock` | M6 锁定片重解：11 条性质，含「`lockedTiles: []` 与不传时逐字节相同」 |
| `npm run bench:steps` | M7 步骤拆解：七条性质 + `assets.stepImages` ↔ 磁盘核对 |
| `npm run e2e:draft` | M4 草稿生成：mock 全链路 + 四条分支（28 条） |
| `npm run e2e:measure` | M5 实测录入：造一张几何已知的照片，量出来的 ratio 有唯一正确答案（36 条） |
| `npm run e2e:build` | M6 实际搭建：点放/锁定/重解/落盘/传照片（38 条） |
| `npm run e2e:steps` | M7 步骤拆解：逐步骤切画布、磁盘逐张核对、stale 护栏（31 条） |
| `npm run e2e:library` | M8 资产库：列表/筛选/详情/真点下载/只读性（48 条） |

七个 bench 都靠退出码判定，全过才是 0。**改 `core/` 之后都要跑** —— 它们是
「算法没退步」这件事的唯一证据，页面好看不能替代。

五个 e2e 同样靠退出码判定，**改页面之后要跑**（见下）。

> `bench:steps` 那条「`assets.stepImages` ↔ 磁盘」核对**单独跑永远是空过的** ——
> 盘上没有一个带步骤的作品，脚本自己会印一行说清楚。真正兑现它的是 M7 的 CDP e2e：
> 它在保存之后、把作品改坏之前，**当场跑一遍 `npm run bench:steps`**，断言输出里出现
> 「核对了 N 个带步骤的作品」而不是「现在是空过的」。**别把那个空过的「过」当成验过了。**

`bench:measure` 的三条全局性质对**每条**用例都跑，它们盯的是这套做法本身的性质
而不是某个用例的答案：**参考边填 7.5 还是 6.0，ratio 必须一模一样**（卡尺读数在
分子分母里约掉了），**所有点击坐标等比放大 3 倍，ratio 不能变**（同一套积木拍成
4000px 和 600px，结论必须一致），**失败样本必须进 `problems`、不进 `byShape`**
（否则一条误点会拉低平均值，给出一个看起来很正常但错的数）。第二条抓过真 bug：
`MIN_SEGMENT_PX` 原本是绝对像素阈值，于是同一个标注动作在大照片里合法、在小照片里
非法 —— 正是这套做法本该免疫的分辨率依赖。

## 端到端（`scripts/e2e/`）：五个 e2e 都必须走 runner

环境里没有 puppeteer/playwright，所以直接用 CDP 驱动 Chrome —— Node 24 自带全局
`WebSocket` + `fetch`，`--remote-debugging-port` 拿 `webSocketDebuggerUrl` 就够。
**前置条件、CDP 踩过的坑、选择器清单都在 `scripts/e2e/README.md`**，写新脚本前先读它。

**★ 只能 `npm run e2e:*`，不能直接 `node scripts/e2e/xxx-e2e.mjs`。** 五个脚本全都真往
`library/` 里写东西，而写出来的和真作品一模一样 —— 每个 runner 就是「备份 → 跑 → 还原」。
`run-measure-e2e.sh` 是唯一不碰 `works/` 的，而它恰恰最不能裸跑：它往 `shapes.json` 里写
「卡尺实测 + 照片标定」这条**假的来源说明**。

> `library/works/` 里曾有 15 个测试残留，就是 `draft-e2e.mjs` 裸跑留下的（当时还没有
> runner）。`run-draft-e2e.sh` 是后补的，补它就是为了不再有第二次。

**语法检查用 `node --check`，绝不要用 `node -e "import('./xxx-e2e.mjs')"`** ——
后者会**真的把脚本跑起来**，就这么在 library 里留下过一个 `W-20260918-171312`。

**通过 ≠ 验过。** 已经踩到过三种假绿：按钮是灰的所以点它什么都不发生（于是「锁定片没动」
两条全过）、等待等错了东西（等「有 workId」而不是等「片集真的变了」，整段验收跑在夹具上）、
以及**一句解释自己为什么没有某个按钮的话把「没有这个按钮」的检查弄成了假**。README 末尾
有完整清单。

## 目录

```
pc/
├── server/
│   ├── fs-api.js           # /api/fs/* 中间件，读写 ../library/
│   └── ai-api.js           # /api/ai/* 中间件，方舟调用+mock，密钥只在这儿用
├── scripts/bench-{solve,snap,extract,export,measure,lock,steps}.mjs  # 七个验收台，靠退出码判定
├── scripts/e2e/            # ★ 五套 CDP 端到端 + 各自的 runner（必须走 runner）+ README.md
│   ├── {draft,measure,build,steps,library}-e2e.mjs
│   ├── run-*-e2e.sh        # 备份 → 跑 → 还原 library/（各备份的东西不同，见 README）
│   └── fixtures/fixture-photo.png   # measure-e2e 当场画出来的夹具，build-e2e 也读它
├── src/
│   ├── theme.js            # ★ 配色方案 A「纸感工作台」的唯一色彩来源
│   ├── router/index.jsx    # menuItems + routeConfig（三级菜单 key 即路由 path）
│   ├── layouts/MainLayout.jsx
│   ├── core/               # ★ 纯算法，不 import React、不碰 DOM，可整体搬后端
│   │   ├── api.js          #   UI 只 import 这里；跨边界只用 JSON 原生类型
│   │   ├── contour/        #   polygon 几何 / rasterize / snap 吸附 / mask
│   │   ├── outline/        #   prompt 提示词 / parse 防御式解析 / extract 提取
│   │   ├── measure/        #   scale 实测换算（比例尺 / 标边 / 写回形状定义）
│   │   └── solver/         #   candidates / dlx / solve / strategies
│   ├── components/{SideMenu,TabNav,PageShell,Placeholder,ShapeGlyph,MosaicCanvas}/
│   ├── stores/{tabStore,libraryStore}.jsx
│   ├── lib/{constants,fsClient,aiClient}.js
│   ├── data/defaults.js    # 标准套装的形状与库存默认值
│   ├── mock/ai/            # AI 夹具（手写的，不是抓的）
│   ├── pages/              # 7 个业务页 + Home
│   └── styles/global.css   # CSS 变量 + 布局，值必须与 theme.js 一致
└── ../library/             # ★ 项目真正的资产（与 pc/ 平级，git 可管）
    ├── shapes.json  stock.json  palette.json  topics.json
    ├── measure.json        # 实测录入页的标注（照片路径 + 参考边 + 各条边的两个端点的**原始像素**）
    ├── shots/measure.{jpg,png,webp}   # 实测上传的实物照片。不属于任何作品 ——
    │                       #   拍的是「我这套积木长什么样」，是零件体系的佐证材料，
    │                       #   不是某个作品的资产，所以不放在 works/ 下面
    └── works/<workId>/{work.json, draft.{png,svg}, render.png, step-01.svg, photo-*.jpg}
```

`shots/measure.*` 是**固定文件名**，磁盘上最多留三个（每种扩展名一个）——
换一张就把上一张覆盖掉。留着旧照片没有意义：`measure.json` 里的标注坐标是
**像素**，换照片就全部失效，页面会连着标注一起清空。

`core/` 的两条硬约定（破了就没法搬后端）：**不 import React、不碰 DOM**；
**跨边界的导出数据只用 JSON 原生类型**（内部算法爱用什么用什么，别漏进返回值）。
另外 `core/` 的算法**绝不 mock** —— 那是项目价值本身。

## 实测录入（`/base/measure`）：卡尺读数会自己约掉

这个页面把「一张俯拍照片 + 一条已知长度的边」变成整套形状的边长比例。成立的关键
是一条性质：同一张照片里所有东西共用一个比例尺，所以

```
斜边/a = 斜边像素长 / a的像素长
```

分子分母里的 cm-per-px 是同一个数，直接消掉。于是**比例只靠像素就能定，卡尺只负责
绝对尺寸** —— 那一次卡尺读数同时就是 `shapes.json` 里的 `unit`，一次测量两用。

**代价是它对透视没有免疫力**：必须正对俯拍，斜着拍会近大远小，离镜头远的那块会被
算小。模块检测不到这件事，只能靠「同一条边名的多个采样散了多少」（`SPREAD_WARN_PCT`）
提示。

两条容易改坏的地方：

- **误点判据必须是相对参考边的比例**（`MIN_MARK_FRACTION`），不能是绝对像素数。
  同一套积木拍成 4000px 和 600px，绝对阈值会在一张里误杀、在另一张里放行。
- **`applyMeasurements` 只改 `edges[].ratio` 与 `unit`，不碰 `areaRatio` / `tCount`**。
  面积没法从几条边长反推（同样的三条边可以是完全不同的三角形），而那两个字段说的是
  「这个形状占几格」，属于形状定义，不是量出来的尺寸。
- 确认框里列的是**「标到了哪几条边」**，不是「值变了的边」。量出来正好等于默认值
  （正方形就是 1.0）太常见，按 diff 判会显示成「正方形：」后面空空如也。

标注坐标一律是照片的**原始像素**（`naturalWidth` 那套），不是屏幕显示坐标 —— 页面把
点击换算成原始像素再进 `core/`，`core/` 不知道照片被显示成了多大。

## 资产库（`/asset/library`）：只读，且「难度」与「年龄档」不是一回事

详情是**页内视图**，由 `?work=<id>` 驱动，**没有 `/asset/library/:id` 路由** ——
`tabStore` 的 key 是路由 path、label 由 `findLabel` 查，参数化路径会开出一个 label
解析不到的标签页，正踩在「已知坑」表第三条上。

这一页有四个容易改坏的地方：

- **列表页对每一行只调 `estimateDifficulty(work)`，绝不调 `buildReport`。** 后者要建网格、
  算连通、算对称，几十行就是几十次求解器级别的开销。但两者**共用同一套权重与归一化分母**
  （都走 `report.js` 里的 `difficultyOf` / `ageBandOf`），所以不可能算出两个难度分 ——
  这是「一份数据三种输出」的前提，`bench` 之外还有 M8 的 e2e 拿 Node 侧同函数逐位比对。
- **`ageBandOf` 吃的是难度对象，不是 `.score`。** 传裸数进去 `.score` 是 `undefined`、
  `undefined <= x` 恒假，于是**每一件作品都掉到最后一档**且不报任何错。现在函数头有
  `TypeError` 断言钉住它。
- **列表页有两个「档」，别混**：「年龄档（做给谁）」筛 `meta.ageBand`（当初定给谁的），
  「难度（结构上）」筛算出来的档。两者不一致时列表把年龄档标签标成金色 + Tooltip ——
  按启蒙档做的其实是进阶的活，正是值得被看见的东西。
- **缩略图只在位图里挑，绝不把 `.svg` 当 `<img>` 源**（顺序 cover → photos[0] → render → draft）。
  SVG 在 `<img>` 里是独立文档，读不到页面 CSS 变量 —— 这条写在「三条不能破的约定」里，
  而列表页是最容易犯的地方。

「更新于」用的是 **`work.json` 的 mtime**（`fs-api.js` 的 `read` 路由顺带回一个 `mtime`，
经 `fsClient.read` → `listWorks`/`loadWork` 一路带上来），不是目录 mtime —— 改文件不改父目录的
mtime，用目录会显示成「很久没动过」。**没有加新路由**。

**不完整的目录照样列出来、照样能打开**，带标记 + 原因 + 盘上现有的文件清单，**但不提供
删除入口**（要清走 Finder）。丢掉的话磁盘上的垃圾就永远看不见了，而那正是最该被看见的东西。

## 三条不能破的约定

1. **配色只从 `theme.js` / `global.css` 的 CSS 变量取**，任何页面里不写死颜色。
   改色两处必须同步（antd 管组件，CSS 变量管自绘部分）。
2. **三级菜单的 key 就是路由 path**（含前导斜杠）。`App.jsx` 的 Route 直接由
   `routeConfig` 的 key 生成，从结构上杜绝两者不一致。
3. **`library/` 是事实来源**，`work.json` 里只存引用不存 data URL。

## 已知坑（改菜单/路由/标签时必查）

| 坑 | 表现 | 正确做法 |
|---|---|---|
| `findLabel` 找不到返回 key | key 是 truthy，外层 `if (found)` 提前返回，取到错误 label | **找不到返回 `null`**，调用方 `?? key` 兜底 |
| 路由 path 与菜单 key 不一致 | 点菜单能进，刷新后菜单不高亮、标签页开不出来 | 三级菜单 key 必须与 Route path 完全一致（含前导斜杠） |
| 关闭标签后 activeKey 悬空 | 关掉当前标签后页面空白 | 关闭时回退到最后一个存活标签；`SET_ACTIVE` 校验 key 存在 |

### antd v6 改过的类名（照 v5 记忆去写选择器必然扑空）

这些只在**测试脚本**和 **`global.css`** 里用得上（业务代码走的是组件，不写选择器）。
每一条的表现都是「看起来那个东西没渲染/没弹出来」，实际渲染得好好的。

| v5（容易顺手写的） | v6 |
|---|---|
| `.ant-modal-content` | **`.ant-modal-container`** |
| `.ant-modal-footer` | **`.ant-modal-confirm-btns`** |
| `.ant-select-selector` | **`.ant-select-content`** + `.ant-select-input`，触发器是 `.ant-select` |
| `.ant-progress-text` | **`.ant-progress-indicator`** |
| `.ant-message-notice-content` | **`.ant-message-notice-title`** |
| Segmented 选中项 `.ant-segmented-item-selected` | 还是它，**但只在滑块动画没在跑时才加** —— 要稳就判 **`.ant-segmented-item-selected-text`** |

下拉项 `.ant-select-item-option` 没变。**别猜，`grep` 一下 `node_modules/antd/es/<组件>/`。**

**改的不只是类名，还有属性名。** 这些不改不影响功能，只在控制台印一条 deprecated 警告 ——
所以只有把 `console.error` 当判据的测试才抓得到（M8 的 e2e 就是这么抓出来的）：

| v6 之前 | v6 | 同时改的 |
|---|---|---|
| `Alert` 的 `message` | **`title`** | ——（`description` 没变） |
| `Progress` 的 `trailColor` | **`railColor`** | `width` → `size`、`gapPosition` → `gapPlacement` |
| `Space` 的 `direction` | **`orientation`** | `split` → `separator` |

`Alert` 那条已全库替换（21 处、8 个文件）。改名表在 `node_modules/antd/es/<组件>/` 里都有
一段 `[['旧','新']]`，比如 `alert/Alert.js:87`、`progress/progress.js:120`、`space/index.js:94`。

> **只在失败路径上执行的诊断代码，等于没有被验证过。** M6 的 e2e 里那句「没等到就打印页面提示」
> 用的就是错的选择器，而 M6 那次 38/38 全过 —— 于是它一直静静地打印着「(没有提示)」，
> 直到 M7 复用同一个选择器去读一条**必须**读到的提示才暴露出来。

## AI 与密钥

用**火山方舟（Ark）**，OpenAI 兼容接口，**单个 API Key，不是 AK/SK 签名**。
Base：`https://ark.cn-beijing.volces.com/api/v3`，认证就是一个 `Authorization: Bearer`。

`.env.local`（已在 .gitignore）里三样东西：

| 键 | 说明 |
|---|---|
| `ARK_API_KEY` | 唯一的密钥 |
| `AI_MODE` | `mock`（默认）或 `live` |
| `ARK_IMAGE_MODEL` / `ARK_VISION_MODEL` | 可省略，代码里有默认值 |

`server/ai-api.js` 挂在 `/api/ai/*`：`status` / `imagegen` + `jobs/:id` / `vision`。
**接口按 job 形态设计（提交 → 轮询）**，哪怕方舟本身是同步的 —— 将来换即梦那种
真异步的 provider，前端一行都不用改。

三条不能破的：

1. **密钥只在 Node 侧用**，浏览器 bundle 里不许出现。`loadEnv(mode, dir, '')` 那个
   空串前缀是故意的：`ARK_API_KEY` 不带 `VITE_` 前缀，Vite 就不会把它注入前端。
2. **提示词与响应解析都在 `src/core/outline/`，浏览器侧跑**；`server/ai-api.js`
   只负责发 HTTP 和落盘。
3. **mock 必须走和 live 完全相同的路径**。夹具是「方舟当时这么回的」一份完整响应
   快照，客户端一律 `parseChatText → firstJsonObject`。mock 一旦走捷径（比如服务端
   替客户端把 `choices` 拆好），它就什么都证明不了了。

产出的图**在 Node 侧直接落到 `library/works/<id>/draft.<ext>`**，返回给浏览器的只是
相对路径 —— 临时链接有 TTL，交给浏览器等于多一个会过期的东西。

mock 夹具在 `src/mock/ai/`：`draft.svg`（房子草稿图）+ 四份视觉响应，各对应链路上
会真实发生的一种结果：

| 夹具 | 演示分支 | 链路走到哪 |
|---|---|---|
| `vision-polygon.json` | 多边形走通 | 全程 |
| `vision-mask.json` | 多边形被拒 → 掩码兜底 | 全程（换一条路） |
| `vision-unsnappable.json` | 多边形被拒，且没有掩码 | 断在抠轮廓 |
| `vision-text.json` | 回复里根本没有 JSON | 断在解析 |

**这五份都是手写的，不是抓下来的真实响应**（模型没开通，抓不到），夹具里的
`_fixture.honest` 写了这件事。页头那个「演示分支」下拉就是选它们的 —— 它是
**测试钩子，不是接口的一部分**，live 完全忽略它（`FIXTURES[variant] ?? FIXTURES.polygon`）。

> 账号 `2132088681` 上的模型目前**一个都没开通**，live 会一律返回 `ModelNotOpen`。
> 方舟的字段哪些验过、哪些是猜的，`server/ai-api.js` 文件头有一段清单；
> 猜的那些靠 `postArk()` 的**逐级摘字段重试**兜住（被 400 拒就摘掉最可疑的一个再发，
> 最多退三轮），最坏损失三次请求而不是「第一次真调用就挂」。
