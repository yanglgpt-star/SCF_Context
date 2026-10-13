import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, App, Button, Empty, Progress, Select, Space, Tag, Tooltip } from 'antd'
import { PartitionOutlined, SaveOutlined, ToolOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import MosaicCanvas from '../../components/MosaicCanvas'
import PageShell from '../../components/PageShell'
import { buildStepSvg } from '../../components/MosaicCanvas/exportSvg.js'
import {
  MAX_STEPS,
  MIN_STEPS,
  analyzeWork,
  createGrid,
  sequenceTiles,
  stepsStaleReason,
  strategiesMeta,
} from '../../core/api.js'
import { fsClient, toBase64 } from '../../lib/fsClient.js'
import { svgToPng } from '../../lib/pngExport.js'
import { listWorks, loadWork, workLabel } from '../../lib/works'

/**
 * 步骤拆解（M7）：把「一堆片」变成「一条能照着搭的序列」，并出每一步的图。
 *
 * 三栏从左到右就是用户实际的动作顺序：**怎么排** → **板子变成什么样** → **这一步的图**。
 * 中间那栏是活的画布（拖拽缩放都在），右边那栏是**导出的那张图** —— 两者并排摆着，
 * 「画布所见」和「出图所得」不一致这件事才验得了。这也是 `.draft-split` 那条固定高度
 * 规则当初写下的理由。
 *
 * ## 拆解只在点击时发生
 *
 * `sequenceTiles` 是纯计算，但**绝不放进 effect**（`react-hooks/purity` 开着，而且
 * 这里有一条更实在的理由）：自动跑的话，用户换个策略、切个步骤都得等它跑一遍，
 * 而它是「一次点击换一个结果」的语义。打开页面看到的是**磁盘上已经存好的步骤**，
 * 只有按了「重新拆解」才会被覆盖 —— 于是「载入 → 看一眼 → 退出」这条最常走的路
 * 一个字节都不改盘。
 *
 * ## 保存写两样东西，清单里的顺序就是步子的顺序
 *
 * 每步一个 `.svg`（矢量，方便打印和二次编辑）一个 `.png`（小红书/抖音只收 PNG）。
 * `assets.stepImages` 是**清单**，不靠目录列举 —— 没有删除路由，重新拆解之后
 * 残留的旧文件在应用里删不掉，目录列举永远不能当事实来源。
 */
export default function Steps() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [works, setWorks] = useState([])
  const [work, setWork] = useState(null)
  const [flash, setFlash] = useState(null)

  const [strategy, setStrategy] = useState('auto')
  const [run, setRun] = useState(null)
  const [stepIndex, setStepIndex] = useState(0)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(null)

  const queryId = searchParams.get('work')
  const normalized = work
  const analysis = useMemo(() => (normalized ? analyzeWork(normalized) : null), [normalized])

  /* ------------------------------------------------------------ 提示 --- */

  useEffect(() => {
    if (flash) message.error(flash)
  }, [flash, message])

  /* -------------------------------------------------------- 作品入口 --- */

  const refreshWorks = useCallback(async () => {
    try {
      setWorks(await listWorks())
    } catch (err) {
      setFlash(`读作品列表失败：${err.message}`)
    }
  }, [])

  const worksLoaded = useRef(false)
  useEffect(() => {
    if (worksLoaded.current) return
    worksLoaded.current = true
    refreshWorks()
  }, [refreshWorks])

  /**
   * 载入由地址栏驱动，与 Build 页同一套写法 —— 连 `loadedRef` 只能**做成了再记上**
   * 那条都照抄（写在发起请求之前的话，StrictMode 下 effect 跑两遍会把唯一会去载的
   * 那条路堵死，且完全无声）。
   */
  const loadedRef = useRef('')
  useEffect(() => {
    if (!queryId || loadedRef.current === queryId) return
    let alive = true
    loadWork(queryId)
      .then(({ work: data, missing }) => {
        if (!alive) return
        if (missing || !data) {
          setFlash(`library/works/${queryId}/ 里没有 work.json`)
          return
        }
        loadedRef.current = queryId
        setWork(data)
        // 换作品必须把上一条拆解结果丢掉 —— 它是**对着另一份片集**算出来的，
        // 留着的话，新作品的步骤列表会显示旧作品的片 id，而画布一片都画不出来。
        setRun(null)
        setSaved(null)
        setStepIndex(0)
      })
      .catch((err) => {
        if (!alive) return
        setFlash(`读 work.json 失败：${err.message}`)
      })
    return () => {
      alive = false
    }
  }, [queryId])

  /** 只改地址栏，载入交给上面那个 effect —— 这里不许写 `loadedRef` */
  const switchWork = (id) => setSearchParams(id ? { work: id } : {}, { replace: true })

  /* ------------------------------------------------------------ 拆解 --- */

  // 单独一个 useMemo，不是 `run?.steps ?? normalized?.steps ?? []` 一行了事 ——
  // 那个 `?? []` 在没有步骤时每次渲染都给一个新数组，下游按 steps 建的 memo
  // 会全体失效（lint 的 exhaustive-deps 报的就是这件事）。
  const steps = useMemo(() => run?.steps ?? normalized?.steps ?? [], [run, normalized])
  const step = steps[stepIndex] ?? null

  const onSequence = () => {
    if (!normalized) return
    const grid = createGrid(normalized.canvas.cols, normalized.canvas.rows)
    const result = sequenceTiles(normalized.tiles, grid, { strategy })
    setRun(result)
    setStepIndex(0)
    // 盘上那批图是上一次拆的解，策略一换就对不上了。此处不清的话，右栏会拿旧图
    // 配新步骤显示 —— 而「步骤图与 work.json 一致」正是这一步要保证的事。
    setSaved(null)
    if (result.ok) message.success(`排成 ${result.steps.length} 步（${result.strategy}）`)
  }

  /* ------------------------------------------------------------ 保存 --- */

  const stale = useMemo(() => (normalized ? stepsStaleReason(normalized) : null), [normalized])

  /**
   * 存下去的步骤图**必须是对着当前片集算出来的**。两种情况不能存：
   *   - 还没有步骤（没拆过、盘上也没有）
   *   - 盘上的步骤引用了已经不存在的片（`stepsStale`），而用户还没重新拆
   * 后者存下去会得到一批缺片的图，而且看起来完全正常 —— 正是最难发现的那类。
   */
  const canSave = Boolean(normalized) && analysis?.ok && steps.length > 0 && (!stale || run)
  const saveHint = !normalized
    ? '先载入一份作品'
    : !analysis?.ok
      ? '先把校验错误处理掉'
      : stale && !run
        ? '盘上的步骤引用了已经不存在的片，先「重新拆解」'
        : ''

  const onSave = async () => {
    setSaving(true)
    try {
      const id = normalized.workId
      const pad = (k) => String(k).padStart(2, '0')
      const preview = { ...normalized, steps }
      const listed = []

      for (let k = 0; k < steps.length; k += 1) {
        const svg = buildStepSvg({ work: preview, index: k })
        const image = await svgToPng(svg)
        const base = `works/${id}/step-${pad(k + 1)}`
        await fsClient.writeBinary(`${base}.svg`, toBase64(svg))
        await fsClient.writeBinary(`${base}.png`, image.base64)
        listed.push(`${base}.svg`, `${base}.png`)
      }

      const next = {
        ...normalized,
        steps,
        assets: { ...normalized.assets, stepImages: listed },
        // 只有**刚算出来的**这一份才配把过期标记清掉。存盘上原有的那批步骤时
        // 保持原样 —— 否则「片动过了」这句话会被一次存盘悄悄抹掉。
        stepsStale: run ? false : normalized.stepsStale,
      }
      const bytes = await fsClient.write(`works/${id}/work.json`, next)

      setWork(next)
      setSaved({ id, bust: Date.now() })
      message.success(`已写入 ${steps.length} 步的图与 work.json（${bytes} 字节）`)
      refreshWorks()
    } catch (err) {
      setFlash(`保存失败：${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  /* ------------------------------------------------------------ 出图 --- */

  const stepWork = useMemo(
    () => (normalized && step ? { ...normalized, steps } : null),
    [normalized, steps, step],
  )

  /**
   * 右边那栏的图**就是导出的那张**，只是还没落盘。
   *
   * 故意走 `<img>` + `data:` 这条路，而不是把 SVG 直接塞进 DOM：`<img>` 里的 SVG
   * 是独立文档，读不到页面 CSS 变量也读不到外部样式表 —— 和 `svgToPng` 那条
   * Blob → `<img>` 的路是同一回事。直接内联进 DOM 的话，它会从页面继承字体之类的东西，
   * 于是一张「在屏幕上看着没问题、导出后糊掉」的图完全演示得出来。
   *
   * 用 `encodeURIComponent` 而不是 base64：标题里有中文，`btoa` 会抛（`toBase64`
   * 绕的就是这个坑，但这里不需要再绕一次 —— percent-encoding 本来就吃 UTF-8）。
   */
  const preview = useMemo(() => {
    if (!stepWork || !step) return { svg: '', error: '' }
    try {
      return { svg: buildStepSvg({ work: stepWork, index: stepIndex }), error: '' }
    } catch (err) {
      return { svg: '', error: err.message }
    }
  }, [stepWork, step, stepIndex])

  const showDisk = Boolean(saved && normalized && saved.id === normalized.workId)
  const imgSrc = showDisk
    ? fsClient.readRawUrl(
        `works/${saved.id}/step-${String(stepIndex + 1).padStart(2, '0')}.png`,
        saved.bust,
      )
    : preview.svg
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview.svg)}`
      : ''

  const cumulativeIds = useMemo(() => {
    const out = []
    for (let k = 0; k <= stepIndex && k < steps.length; k += 1) out.push(...steps[k].tileIds)
    return out
  }, [steps, stepIndex])

  /* ------------------------------------------------------------ 渲染 --- */

  const broken = analysis?.warnings.find((w) => w.code === 'DISCONNECTED') ?? null

  return (
    <PageShell
      title="步骤拆解"
      desc={`把一堆片排成一条能照着搭的序列，再出每一步的图。${MIN_STEPS}–${MAX_STEPS} 步，片太少就按实际片数拆。`}
      actions={
        <Space size={8} wrap>
          <Select
            size="small"
            style={{ minWidth: 210 }}
            value={queryId ?? undefined}
            placeholder="载入一个作品"
            options={works.map((w) => ({ value: w.id, label: workLabel(w) }))}
            onChange={switchWork}
            allowClear
            onClear={() => switchWork('')}
          />
          <Tooltip title={saveHint}>
            <span>
              <Button
                size="small"
                type="primary"
                icon={<SaveOutlined />}
                loading={saving}
                disabled={!canSave}
                onClick={onSave}
              >
                保存步骤图
              </Button>
            </span>
          </Tooltip>
        </Space>
      }
    >
      {!normalized && (
        <div className="panel">
          <div className="panel-body">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="还没有载入作品：右上角选一个，或者从草稿生成 / 实物搭建页跳过来"
            />
          </div>
        </div>
      )}

      {broken && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 14 }}
          title="这份作品的片没有连成一片，排不出顺序"
          description={
            <Space size={10}>
              <span>
                实物没有底座，每片新磁力片必须与已经搭好的结构共边，否则放上去就掉。
                步骤拆解不会替你猜一个错序。
              </span>
              <Button
                size="small"
                type="link"
                style={{ padding: 0 }}
                icon={<ToolOutlined />}
                onClick={() => navigate(`/produce/build?work=${normalized.workId}`)}
              >
                去实际搭建页把它们连起来
              </Button>
            </Space>
          }
        />
      )}

      {stale && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 14 }}
          title={`盘上的步骤引用了 ${stale.missing.length} 个已经不存在的片`}
          description={`例如 ${stale.missing.slice(0, 3).join('、')}。照着它出的图会缺片，但图本身看起来完全正常 —— 按一次「重新拆解」就好。`}
        />
      )}

      <div className="draft-split">
        {/* ---------------- 左栏：怎么排 + 步骤清单 ---------------- */}
        <div className="build-col">
          <div className="panel is-flex">
            <div className="panel-head">
              <span className="panel-title">怎么排</span>
              {run && (
                <Tag color={run.ok ? 'success' : 'error'} style={{ marginInlineEnd: 0 }}>
                  {run.ok ? '刚拆的' : '拆不出'}
                </Tag>
              )}
            </div>
            <div className="panel-body">
              <Select
                size="small"
                style={{ width: '100%' }}
                value={strategy}
                onChange={setStrategy}
                options={[
                  { value: 'auto', label: '自动挑（按每步的紧凑程度）' },
                  ...strategiesMeta().map((s) => ({ value: s.id, label: s.label })),
                ]}
              />
              <div className="faint" style={{ marginTop: 4, minHeight: 32 }}>
                {strategy === 'auto'
                  ? '四个都跑一遍，取每步包围盒最小的那个 —— 步骤越局部，孩子越找得到该往哪儿放。'
                  : (strategiesMeta().find((s) => s.id === strategy)?.hint ?? '')}
              </div>
              <Button
                size="small"
                block
                icon={<PartitionOutlined />}
                disabled={!normalized || !analysis?.ok}
                onClick={onSequence}
                style={{ marginTop: 8 }}
              >
                重新拆解
              </Button>
            </div>

            <div className="solve-list">
              {steps.map((s, k) => (
                <button
                  key={s.no}
                  type="button"
                  className={`solve-item${k === stepIndex ? ' is-on' : ''}`}
                  onClick={() => setStepIndex(k)}
                >
                  <span
                    className="mono faint"
                    style={{ flex: 'none', width: 18, textAlign: 'right' }}
                  >
                    {s.no}
                  </span>
                  <span className="solve-meta">
                    <span className="solve-name">{s.caption}</span>
                    <span className="faint mono">
                      {s.progress.done} / {s.progress.total} 片
                    </span>
                  </span>
                </button>
              ))}
              {!steps.length && (
                <div className="faint" style={{ padding: '10px 14px' }}>
                  {normalized
                    ? '还没有步骤。按上面那个「重新拆解」，或者载入一份已经拆过的作品。'
                    : ''}
                </div>
              )}
            </div>

            {run?.note && <div className="panel-foot faint">{run.note}</div>}
          </div>
        </div>

        {/* ---------------- 中栏：板子的样子 ---------------- */}
        <div className="build-col">
          <div className="panel is-flex">
            <div className="panel-head">
              <span className="panel-title">搭到这一步，板子是这样</span>
              <Space size={8}>
                {normalized && <span className="faint">{normalized.tiles.length} 片</span>}
                {analysis && <span className="faint">{steps.length} 步</span>}
              </Space>
            </div>
            <div className="panel-body build-canvas">
              {normalized && step ? (
                <MosaicCanvas
                  work={normalized}
                  analysis={analysis}
                  showGrid
                  // 更晚的片一片都不画 —— 画了就等于把答案提前给了
                  onlyIds={cumulativeIds}
                  // 本步的片加一道品牌色描边，和导出的那张步骤图是同一套视觉
                  newIds={step.tileIds}
                />
              ) : (
                <div className="draft-figure faint">
                  {normalized ? '左边选一步' : '还没载入作品'}
                </div>
              )}
            </div>
            {step && (
              <div className="panel-foot faint">
                二期的镜头取景是{' '}
                <span className="mono">
                  {step.camera.cx}, {step.camera.cy} · {step.camera.zoom}×
                </span>
                ，静态步骤图不按它裁切 —— 一裁切，孩子在整块板上找位置就没法用了。
              </div>
            )}
          </div>
        </div>

        {/* ---------------- 右栏：这一步的图 ---------------- */}
        <div className="build-col">
          <div className="panel is-flex">
            <div className="panel-head">
              <span className="panel-title">这一步的图</span>
              {step && (
                <span className="faint">
                  {showDisk ? '盘上读回来的' : '就是将要导出的那张'}
                </span>
              )}
            </div>
            <div className="panel-body build-canvas">
              {preview.error ? (
                <Alert type="error" showIcon title="这张图生成不了" description={preview.error} />
              ) : imgSrc ? (
                <div className="draft-shot">
                  <img src={imgSrc} alt={step?.caption ?? '步骤图'} className="draft-shot__img" />
                </div>
              ) : (
                <div className="draft-figure faint">
                  {normalized ? '左边选一步' : '还没载入作品'}
                </div>
              )}
            </div>
            {step && (
              <div className="panel-foot">
                <div className="mono" style={{ marginBottom: 6, wordBreak: 'break-all' }}>
                  {step.caption}
                </div>
                <Progress
                  percent={
                    step.progress.total
                      ? Math.round((step.progress.done / step.progress.total) * 100)
                      : 0
                  }
                  size="small"
                  format={() => `${step.progress.done} / ${step.progress.total}`}
                />
                <div className="faint" style={{ marginTop: 4 }}>
                  本步 {step.tileIds.length} 片
                  {showDisk && (
                    <span className="mono">
                      {' · '}works/{saved.id}/step-{String(stepIndex + 1).padStart(2, '0')}.{'{svg,png}'}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {analysis?.warnings?.length > 0 && !broken && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 14 }}
          title="这份作品有几点要留意"
          description={analysis.warnings.map((w) => w.message).join('；')}
        />
      )}
    </PageShell>
  )
}
