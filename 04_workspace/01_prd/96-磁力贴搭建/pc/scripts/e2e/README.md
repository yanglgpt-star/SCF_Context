# CDP 端到端

M4–M8 的界面验收。**七个 bench 证明算法没退步，这五个脚本证明页面真的能用** —— 两者不可替代。

环境里没有 puppeteer / playwright，所以直接用 CDP 驱动无头 Chrome：
Node 24 自带全局 `WebSocket` 和 `fetch`，`--remote-debugging-port` 拿 `webSocketDebuggerUrl`
再发 `Input.dispatchMouseEvent` / `Page.captureScreenshot` 就够。

## 跑之前

```bash
# 1) dev server
cd pc && npm run dev                 # http://localhost:5273

# 2) 一个带调试端口的 Chrome（单独 profile，别用日常那个）
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9333 \
  --user-data-dir=/tmp/mcchrome-profile \
  --no-first-run --no-default-browser-check \
  --window-size=1680,1050 about:blank
```

## 跑

```bash
npm run e2e:draft      # M4 草稿生成：mock 全链路 + 四条分支
npm run e2e:measure    # M5 实测录入：造一张几何已知的照片，量出来的 ratio 有唯一正确答案
npm run e2e:build      # M6 实际搭建：点放/点选/删除/换形状/锁定 → 重解 → 落盘 → 传照片
npm run e2e:steps      # M7 步骤拆解：逐步骤切画布、磁盘逐张核对、stale 护栏
npm run e2e:library    # M8 资产库：列表/筛选/详情/真点下载/只读性
```

退出码 0 才算过（与 bench 同一套判据）。日志留在 `/tmp/mcdrv/*-e2e.log`。

环境变量：`BASE_URL`（默认 `http://localhost:5273`）、`CDP_PORT`（默认 `9333`）、
`MCDRV`（杂物目录，默认 `/tmp/mcdrv`，备份/截图/下载/日志都在这儿）。

## ★ 必须走 runner，不能直接 `node xxx-e2e.mjs`

五个脚本**全都真往 `library/` 里写东西**，而且写出来的东西和真作品一模一样。
每个 `run-*-e2e.sh` 都是「备份 → 跑 → 还原」三段，备份还原的位置各不相同：

| runner | 备份还原什么 | 为什么 |
|---|---|---|
| `run-draft-e2e.sh` | `library/works/` 整个 | 每条分支落一份作品 |
| `run-build-e2e.sh` | `library/works/` 整个 | 草稿落盘 + Build 保存 + 照片 |
| `run-steps-e2e.sh` | `library/works/` 整个 | 新作品 + 一批 `step-NN.svg/png` |
| `run-library-e2e.sh` | `library/works/` 整个 | 新作品 + 步骤图 + 一个不完整目录 |
| `run-measure-e2e.sh` | `shapes.json` + `measure.json` + `shots/` | **它写的是「卡尺实测」这个假来源说明** |

`run-measure-e2e.sh` 是唯一不碰 `works/` 的，而它恰恰是最不能裸跑的那个 ——
它会往 `shapes.json` 里写一条假的 `source`，留在用户真实的 library 里就是一条**看起来
完全正常的错误来源说明**。

> **`library/works/` 里曾经有 15 个测试残留，就是 `draft-e2e.mjs` 裸跑留下的。**
> 8 个有完整 `work.json`、7 个只剩 `draft.svg`，全部 `aiMode=mock`、`theme=小房子`。
> `run-draft-e2e.sh` 是后补的，补它就是为了不再发生第二次。

**语法检查用 `node --check`，绝不要用 `node -e "import('./xxx-e2e.mjs')"`** ——
后者会**真的把脚本跑起来**（曾经就这样在 `library/works/` 里留下一个 `W-20260918-171312`）。

## CDP 踩过的坑（写新脚本时照抄结论）

**输入事件**

- **标签页在后台时 Chrome 会丢掉合成的 `mousePressed`/`mouseReleased`** —— 每次交互前
  `Page.bringToFront`。这条不满足时的表现是「点了没反应」，而 DOM 上一切正常。
- **只有位置真的变了才派 `mousemove`** —— 同一个坐标连发会被去重。
- **拖拽刚结束时连着发的两次合成 mousemove 偶尔被合并/丢掉** —— 重试比调 sleep 可靠。
- **`document.elementFromPoint` 是点中三角形/长方形的唯一可靠办法**：包围盒中心可能落在
  图形外面。做法是在 bbox 里撒一小组点，逐个问 `elementFromPoint` 落在谁身上。
- 正向 CTM 映射：`sx = m.a*x + m.c*y + m.e; sy = m.b*x + m.d*y + m.f`。

**下载（`<a download>` 真的生效的唯一硬证据）**

- `Browser.setDownloadBehavior` 必须发在 **browser 级 WS** 上（`/json/version` 的
  `webSocketDebuggerUrl`），不是 page 级；配 `behavior:'allow'` + `downloadPath` + `eventsEnabled:true`。
- `Browser.downloadWillBegin.suggestedFilename` 是 Chrome **自己报出来**的文件名 ——
  它等于 `download` 属性才说明属性生效了。`Browser.downloadProgress` 报 `completed` 才算落盘。
- 这两个事件是 **browser 级**的，page 级 WS 收不到。

**选择器**

- antd v6 改过一批类名与属性名，照 v5 记忆写必然扑空 —— 清单在 `pc/CLAUDE.md` 的
  「已知坑」一节。**别猜，`grep` 一下 `node_modules/antd/es/<组件>/`。**
- 导出 SVG 里数片数要数 `<g>` 不能数 `<path>`：`svgScaffold` 在 `showGrid` 时会多画一条
  网格 `<path>`，按 `<path>` 数**每张都多一片**，看起来像差一错误，实际是选择器选错了。
- **★ 判 Segmented 选中项要用 `.ant-segmented-item-selected-text`，不是 `.ant-segmented-item-selected`。**
  `@rc-component/segmented/es/index.js:180` 写着：
  ```js
  [`${prefixCls}-item-selected`]: optionValue === rawValue && !thumbShow,
  [`${prefixCls}-item-selected-text`]: optionValue === rawValue,
  ```
  滑动底色那个 `thumbShow` 是 `onMotionStart` 置 true、`onMotionEnd` 才置回 false ——
  **标签页被遮挡时 CSS transition 的结束事件可能永远不来**，于是 `thumbShow` 卡在 true，
  于是 `-selected` 永远不出现。看起来完全像「没切过去」，其实早就切过去了。

  这个坑的形态是**单跑绿、连跑红**：单独跑 measure 是绿的，前面刚跑完 draft 再跑就红
  （标签页被 Chrome 判成遮挡）。第一反应是「阈值太紧」，把 1.5 秒调到 6 秒 ——
  调完照样红（等到 6054ms 仍然没有），才发现根本不是时间问题，是判据本身选错了。
  **一条只在特定执行顺序下失败的断言，先怀疑判据，再怀疑时间。**

**路径**

- `fsClient.readRawUrl` 走 `encodeURIComponent`，所以路径里的 `/` 是 `%2F` ——
  按字面 `works/<id>/render.png` 去找 `src` 会找不到，而那看起来完全像「封面选错了图」。

## 一条比 FAIL 更危险的失败：假绿

脚本通过不等于事情被验过。已经踩到过的三种：

- **按钮是灰的，点它什么都不发生** —— 于是「锁定片还在且坐标不变」两条全过。
  修法：点之前先断言按钮是**活的**，否则 `throw`。
- **等待等错了东西** —— 「有 workId」就当就绪，其实那段验收整个跑在夹具上。
  修法：等待必须等到**那个东西**（这里是「片集真的变了」）。
- **一句解释自己为什么没有某个按钮的话，把「没有这个按钮」的检查弄成了假** ——
  原本断言 `innerText` 不含「删除」，而那条提示里就写着「这里不提供删除入口」。
  修法：查按钮文字 + `.ant-btn-dangerous` 选择器，别查整页文本。

还有一条：**只在失败路径上执行的诊断代码等于没有被验证过**。M6 的一句诊断用了错的选择器，
而那次 38/38 全过 —— 它一直静静地打印着「(没有提示)」，直到 M7 复用同一个选择器去读一条
**必须**读到的提示才暴露。
