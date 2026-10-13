import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Input, Segmented, Select, Space, Tag } from 'antd'
import { PlayCircleOutlined, ToolOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import ContourThumb from '../../components/ContourThumb'
import MosaicCanvas from '../../components/MosaicCanvas'
import PageShell from '../../components/PageShell'
import { buildExportSvg } from '../../components/MosaicCanvas/exportSvg.js'
import {
  AGE_BANDS,
  COLOR_NAMES,
  DEFAULT_CANVAS,
  FALLBACK_LABEL,
  PROMPT_VERSION,
  analyzeWork,
  buildImagePrompt,
  buildReport,
  buildVisionPrompt,
  extractOutline,
  firstJsonObject,
  parseChatText,
  parseOutlinePayload,
  solveContour,
  stockToShapeMap,
} from '../../core/api.js'
import { aiClient, pollJob } from '../../lib/aiClient.js'
import { fsClient, toBase64 } from '../../lib/fsClient.js'
import { newWorkId } from '../../lib/ids.js'
import { svgToPng } from '../../lib/pngExport.js'
import { useLibrary } from '../../stores/libraryStore'

/**
 * 五步链路：主题 → 文生图 → 轮廓 → 吸附 → 求解 → 出图落盘。
 *
 * 这个页面是**唯一一个把整条链路串起来的地方**，所以它有两个不寻常的设计：
 *
 * 1. **失败不是异常，是一种结果。** AI 回了一段没有 JSON 的话、轮廓不是网格友好的、
 *    求解一片都放不下 —— 这些都会真实发生，而且**发生在第几步**正是最要紧的信息。
 *    所以每一段自己记自己的状态（待办/进行中/完成/中断），断在哪一段、为什么，
 *    就写在那一段上。抛一个大红条出去会把「断在哪儿」这个信息抹掉。
 *
 * 2. **能演的分支都做成开关。** 「多边形被拒退到掩码」「AI 回了坏数据」这两条路
 *    光靠测试台证明不了页面扛得住。`variant` 就是那个开关（只在 mock 下有效），
 *    点一下就能把这两条路各走一遍。
 */

const STAGES = [
  { key: 'draft', name: '草稿图', hint: '主题 → 提示词 → 文生图' },
  { key: 'outline', name: '抠轮廓', hint: '视觉理解 → 解析 → 吸附' },
  { key: 'solve', name: '求解', hint: '精确覆盖 + 逐级降级' },
  { key: 'export', name: '出图', hint: '画布 → SVG → 栅格化' },
  { key: 'save', name: '落盘', hint: '写回 library/works/' },
]

const idleStages = () => STAGES.map((s) => ({ ...s, status: 'idle', summary: '', ms: null }))

const STAGE_TAG = {
  idle: { color: 'default', text: '待办' },
  running: { color: 'processing', text: '进行中' },
  done: { color: 'success', text: '完成' },
  failed: { color: 'error', text: '中断' },
}

/**
 * 演示开关。四个值各对应链路里会真实发生的一种结果 —— 前两个是**成功**的两种走法，
 * 后两个是**失败**的两种断点。名字直接写结果，不写夹具名。
 */
const VARIANTS = [
  { value: 'polygon', label: '多边形走通', desc: '干净的房子，45° 屋顶，顶点吸附后精确落回格点' },
  { value: 'mask', label: '多边形被拒 → 掩码兜底', desc: '多边形是 2:1 缓坡（差 45° 有 18.4°），吸附拒收，退回掩码' },
  { value: 'unsnappable', label: '多边形被拒，且没有掩码', desc: '两条路都断，链路停在抠轮廓这一步' },
  { value: 'text', label: '回复里根本没有 JSON', desc: '链路停在解析这一步' },
]

const LEVEL_TONE = { L0: 'success', L1: 'success', L2: 'warning', L3: 'warning', L4: 'warning', L5: 'error' }

const fmtKB = (bytes) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`)
const pct = (v) => `${Math.round((v ?? 0) * 100)}%`

export default function Draft() {
  const lib = useLibrary()
  const navigate = useNavigate()

  const [topics, setTopics] = useState([])
  const [topicsError, setTopicsError] = useState('')
  const [status, setStatus] = useState(null)

  const [topicId, setTopicId] = useState('')
  const [topicText, setTopicText] = useState('')
  const [band, setBand] = useState(AGE_BANDS[0].key)
  const [variant, setVariant] = useState('polygon')

  const [busy, setBusy] = useState(false)
  const [stages, setStages] = useState(idleStages)
  const [prompts, setPrompts] = useState(null)
  const [draft, setDraft] = useState(null)
  const [outline, setOutline] = useState(null)
  const [payload, setPayload] = useState(null)
  const [solution, setSolution] = useState(null)
  const [report, setReport] = useState(null)
  const [work, setWork] = useState(null)
  const [png, setPng] = useState(null)
  const [saved, setSaved] = useState(null)
  const [failure, setFailure] = useState(null)

  const abortRef = useRef(null)
  const runRef = useRef(0)

  useEffect(() => {
    const ac = new AbortController()
    abortRef.current = ac
    return () => ac.abort()
  }, [])

  useEffect(() => {
    let alive = true
    aiClient
      .status()
      .then((s) => alive && setStatus(s))
      .catch((e) => alive && setTopicsError(`拿不到 AI 状态：${e.message}`))
    fsClient
      .read('topics.json')
      .then(({ data, missing }) => {
        if (!alive) return
        if (missing || !Array.isArray(data?.topics)) {
          setTopicsError('library/topics.json 不在或没有 topics 数组，主题得自己打字了')
          return
        }
        setTopics(data.topics)
        setTopicId((cur) => cur || data.topics[0]?.id || '')
      })
      .catch((e) => alive && setTopicsError(`读 topics.json 失败：${e.message}`))
    return () => {
      alive = false
    }
  }, [])

  const isMock = status?.mode === 'mock'
  const picked = topics.find((t) => t.id === topicId) ?? null
  const topic = (topicText.trim() || picked?.topic || '').trim()
  const cols = DEFAULT_CANVAS.cols
  const rows = DEFAULT_CANVAS.rows

  const mark = useCallback((key, patch) => {
    setStages((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  }, [])

  const reset = useCallback(() => {
    setStages(idleStages())
    setPrompts(null)
    setDraft(null)
    setOutline(null)
    setPayload(null)
    setSolution(null)
    setReport(null)
    setWork(null)
    setPng(null)
    setSaved(null)
    setFailure(null)
  }, [])

  const run = useCallback(async () => {
    if (busy) return
    if (!topic) {
      setFailure('先选一个主题，或者自己写一个。空主题会拼出一句没有主语的提示词。')
      return
    }

    reset()
    setBusy(true)
    // 每次开跑换一个号：晚到的响应不许写进新一轮的状态里
    runRef.current += 1
    const runId = runRef.current
    const stale = () => runRef.current !== runId || abortRef.current?.signal.aborted

    const workId = newWorkId()
    const bandObj = AGE_BANDS.find((b) => b.key === band) ?? AGE_BANDS[0]
    const today = new Date().toISOString().slice(0, 10)

    try {
      /* ---------------- 1. 提示词 + 文生图 ---------------- */
      const imagePrompt = buildImagePrompt({ topic, band: bandObj.key, cols, rows })
      setPrompts({ image: imagePrompt, vision: buildVisionPrompt({ cols, rows }) })

      mark('draft', { status: 'running' })
      let t0 = Date.now()
      const { jobId, mode } = await aiClient.imagegen({ workId, prompt: imagePrompt, cols, rows })
      const job = await pollJob(jobId, {
        signal: abortRef.current?.signal,
        onTick: (j) => !stale() && mark('draft', { summary: `任务 ${j.status}` }),
      })
      if (stale()) return
      if (job.status !== 'done') throw new Error(job.error || '出图任务失败了，但没给原因')

      const draftFile = job.file
      const draftMs = Date.now() - t0
      setDraft({ file: draftFile, note: job.note, bytes: job.bytes, ms: draftMs })
      mark('draft', { status: 'done', ms: draftMs, summary: draftFile.split('/').pop() })

      /* ---------------- 2. 视觉理解 → 轮廓 ---------------- */
      mark('outline', { status: 'running' })
      t0 = Date.now()
      const vr = await aiClient.vision({
        imagePath: draftFile,
        prompt: buildVisionPrompt({ cols, rows }),
        variant,
      })
      if (stale()) return

      const text = parseChatText(vr.raw)
      const obj = firstJsonObject(text)
      if (!obj) {
        // 这不是「异常」，是 AI 会给的一种回答（提示词长、图模糊的时候就容易这样）。
        // 页面要把它连同原文一起报出来 —— 只说「失败了」，用户无从下手。
        const outlineMs = Date.now() - t0
        setOutline({
          ok: false,
          path: null,
          poly: [],
          snap: null,
          attempts: null,
          notes: [],
          problems: [],
          reason: 'AI 的回复里一个 JSON 都没找到，没法往下走。',
          text,
          model: vr.model,
          ms: outlineMs,
        })
        mark('outline', { status: 'failed', ms: outlineMs, summary: '回复里没有 JSON' })
        return
      }

      const parsed = parseOutlinePayload(obj, { cols, rows })
      const ex = extractOutline(parsed, { canvas: DEFAULT_CANVAS })
      const outlineMs = Date.now() - t0
      setPayload(parsed)
      setOutline({ ...ex, text, model: vr.model, ms: outlineMs })

      if (!ex.ok) {
        mark('outline', { status: 'failed', ms: outlineMs, summary: ex.reason })
        return
      }
      mark('outline', {
        status: 'done',
        ms: outlineMs,
        summary: ex.path === 'polygon' ? '走的多边形' : '多边形没走通，退到掩码兜底',
      })

      /* ---------------- 3. 求解 ---------------- */
      mark('solve', { status: 'running' })
      t0 = Date.now()
      const stock = stockToShapeMap(lib.stock)
      const sol = solveContour({
        poly: ex.poly,
        stock,
        palette: COLOR_NAMES,
        options: { seedKey: workId },
      })
      if (stale()) return
      const rep = buildReport({ solution: sol })
      const solveMs = Date.now() - t0
      setSolution(sol)
      setReport(rep)

      if (!sol.tiles.length) {
        mark('solve', { status: 'failed', ms: solveMs, summary: sol.reason ?? '一片都放不下' })
        return
      }
      mark('solve', {
        status: 'done',
        ms: solveMs,
        summary: `${sol.level} · ${sol.tiles.length} 片 · 覆盖 ${pct(sol.metrics?.coverage)}`,
      })

      /* ---------------- 4. 组装 work（还没落盘，先算出来才导得出图） ---------------- */
      const analysis = analyzeWork({
        workId,
        canvas: sol.canvas,
        tiles: sol.tiles,
        meta: { title: topic, theme: picked?.label ?? '', ageBand: bandObj.key, createdAt: today, tags: [] },
        // 只存结论。原始响应另外写一份 vision.json 便于复现，不塞进 work.json ——
        // 那份东西几百行，混进作品数据里会让「这个作品是什么」变得很难读。
        solution: {
          level: sol.level,
          seed: sol.seed,
          coverage: sol.metrics?.coverage ?? null,
          overflow: sol.metrics?.overflow ?? null,
          outlinePath: ex.path,
          snap: ex.snap?.stats ?? null,
          promptVersion: PROMPT_VERSION,
          aiMode: mode,
          visionModel: vr.model,
          // 轮廓本体（吸附后、translateToOrigin 之后），M6 的重新求解要拿它当目标区域。
          // `outlinePath` 记的是**走了哪条提取路线**（polygon/mask），不是多边形本身 ——
          // 两者名字像，别弄混。存的就是上面喂给 solveContour 的那个 ex.poly，
          // 配上下面 work 的 canvas，重解时的网格与原子索引与当初逐位相同。
          contour: ex.poly,
        },
        // work.json 里只存引用不存 data URL，这样同一份 JSON 在哪都成立
        assets: {
          draft: draftFile,
          render: `works/${workId}/render.png`,
          renderSvg: `works/${workId}/render.svg`,
          vision: `works/${workId}/vision.json`,
        },
      })
      if (!analysis.ok) {
        // 求解器造出来的数据不该过不了校验。真发生了就是核心的 bug，
        // 与其把一份坏数据写进 library/，不如在这儿停住并把它报出来。
        mark('solve', {
          status: 'failed',
          ms: solveMs,
          summary: `求解结果没通过校验：${analysis.errors.map((e) => e.message).join('；')}`,
        })
        setFailure('求解器给出了一份不合法的 work，已中止（这属于核心 bug，请记下来）。')
        return
      }
      setWork(analysis.work)

      /* ---------------- 5. 出图 ---------------- */
      mark('export', { status: 'running' })
      t0 = Date.now()
      const svg = buildExportSvg({ work: analysis.work, contour: ex.poly })
      const image = await svgToPng(svg)
      if (stale()) return
      const exportMs = Date.now() - t0
      setPng({ ...image, svg })
      mark('export', { status: 'done', ms: exportMs, summary: `${image.width}×${image.height} · ${fmtKB(image.bytes)}` })

      /* ---------------- 6. 落盘 ---------------- */
      mark('save', { status: 'running' })
      t0 = Date.now()
      await fsClient.writeBinary(`works/${workId}/render.png`, image.base64)
      // SVG 走 writeBinary 而不是 write：write 那条路会 JSON.stringify，
      // 把一份文本 SVG 存成带引号和 \n 的 JSON 字符串，之后没有工具读得懂它。
      await fsClient.writeBinary(`works/${workId}/render.svg`, toBase64(svg))
      await fsClient.write(`works/${workId}/work.json`, analysis.work)
      await fsClient.write(`works/${workId}/vision.json`, {
        workId,
        at: new Date().toISOString(),
        mode,
        variant,
        model: vr.model,
        requestId: vr.requestId ?? null,
        usage: vr.usage ?? null,
        prompt: buildVisionPrompt({ cols, rows }),
        // 原文照存：出问题时唯一能复盘的东西就是它
        text,
        payload: parsed,
        extract: {
          ok: ex.ok,
          path: ex.path,
          poly: ex.poly,
          attempts: ex.attempts,
          notes: ex.notes,
          problems: ex.problems,
          reason: ex.reason,
        },
      })
      if (stale()) return
      const saveMs = Date.now() - t0
      mark('save', { status: 'done', ms: saveMs, summary: '4 个文件' })
      setSaved({ workId, bust: Date.now() })
    } catch (err) {
      if (!stale()) setFailure(err.message)
      setStages((prev) =>
        prev.map((s) => (s.status === 'running' ? { ...s, status: 'failed', summary: err.message } : s)),
      )
    } finally {
      if (!stale()) setBusy(false)
    }
  }, [busy, topic, picked, band, variant, cols, rows, lib.stock, mark, reset])

  const bandTopics = useMemo(() => {
    const byBand = topics.filter((t) => t.band === band)
    return byBand.length ? byBand : topics
  }, [topics, band])

  return (
    <PageShell
      title="草稿生成"
      desc="给一个主题，出一张适合拼贴的草稿图，再把它翻译成磁力片能拼的形状。整条链路的每一步都摊在下面：断在哪一步、为什么断，写在那一步上。"
      actions={
        <Space size={8}>
          {status && (
            <Tag
              className="mono"
              color={isMock ? 'warning' : 'success'}
              style={{ marginInlineEnd: 0 }}
              title={isMock ? status.fixtureDir : status.imageModel}
            >
              AI {status.mode}
            </Tag>
          )}
          <Button
            type="primary"
            size="small"
            icon={<PlayCircleOutlined />}
            loading={busy}
            disabled={!topic}
            onClick={run}
          >
            跑一遍
          </Button>
        </Space>
      }
    >
      {isMock && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 14 }}
          title={`当前是 mock：图是 src/mock/ai/ 里手写的夹具，不是模型画的（方舟的模型还没开通）`}
          description="mock 下无论选哪个主题，草稿图和抠出来的轮廓都是同一份夹具（那栋房子），主题只改变提示词文本 —— 上面显示的提示词是真的，图不是。演示失败分支请用右边的「演示分支」开关。"
        />
      )}

      {/* ---------------- 控制台 ---------------- */}
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">出什么</span>
          <span className="faint">
            画布 {cols}×{rows} · 单位 {lib.unit.toFixed(1)}cm
          </span>
        </div>
        <div className="panel-body">
          <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <span className="faint" style={{ width: 56, flex: '0 0 56px' }}>
              年龄档
            </span>
            <Segmented
              size="small"
              value={band}
              onChange={(v) => {
                setBand(v)
                setTopicId('')
              }}
              options={AGE_BANDS.map((b) => ({ label: b.label, value: b.key }))}
            />
            <span className="faint">
              {AGE_BANDS.find((b) => b.key === band)?.minPieces}–
              {AGE_BANDS.find((b) => b.key === band)?.maxPieces} 片，难度上限{' '}
              {AGE_BANDS.find((b) => b.key === band)?.maxDifficulty}
            </span>
          </div>

          <div className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
            <span className="faint" style={{ width: 56, flex: '0 0 56px', paddingTop: 5 }}>
              主题
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Space size={6} wrap style={{ marginBottom: 8 }}>
                {bandTopics.map((t) => (
                  <Tag.CheckableTag
                    key={t.id}
                    checked={t.id === topicId}
                    onChange={() => {
                      setTopicId(t.id)
                      setTopicText('')
                    }}
                  >
                    {t.label}
                  </Tag.CheckableTag>
                ))}
                {topics.length === 0 && (
                  <span className="faint">没读到预设主题，在下面直接写一个也行</span>
                )}
              </Space>
              <Input
                size="small"
                value={topicText}
                onChange={(e) => setTopicText(e.target.value)}
                placeholder={picked?.topic ?? '也可以自己写，比如「一只方形的小狗，三角形的耳朵」'}
                allowClear
              />
            </div>
          </div>

          <div className="row" style={{ marginTop: 12, alignItems: 'flex-start', gap: 8 }}>
            <span className="faint" style={{ width: 56, flex: '0 0 56px', paddingTop: 5 }}>
              演示分支
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Select
                size="small"
                value={variant}
                onChange={setVariant}
                disabled={!isMock}
                style={{ width: 280 }}
                options={VARIANTS.map((v) => ({ value: v.value, label: v.label }))}
              />
              <div className="faint" style={{ marginTop: 4 }}>
                {isMock
                  ? (VARIANTS.find((v) => v.value === variant)?.desc ?? '')
                  : '只有 mock 模式有效 —— live 下走哪条路由模型决定，开关拨不动的'}
              </div>
            </div>
          </div>

          {topicsError && <div className="faint" style={{ marginTop: 8 }}>{topicsError}</div>}
        </div>
      </div>

      {/* ---------------- 链路 ---------------- */}
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">链路</span>
          <span className="faint">断在哪一步，就写在那一步上</span>
        </div>
        <div className="stage-strip">
          {stages.map((s) => (
            <div key={s.key} className={`stage${s.status === 'failed' ? ' stage--failed' : ''}`}>
              <span className="stage__body">
                <span className="row" style={{ gap: 6 }}>
                  <span className="stage__name">{s.name}</span>
                  <Tag color={STAGE_TAG[s.status].color} style={{ marginInlineEnd: 0 }}>
                    {STAGE_TAG[s.status].text}
                  </Tag>
                  {s.ms != null && <span className="faint mono">{s.ms}ms</span>}
                </span>
                <span className="stage__summary">{s.summary || s.hint}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {failure && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 14 }}
          title="这一趟没跑完"
          description={failure}
        />
      )}

      {/* ---------------- 三栏：草稿 · 画布 · 导出 ---------------- */}
      <div className="draft-split">
        <div className="build-col">
          <div className="draft-stack">
            <div className="panel is-flex">
              <div className="panel-head">
                <span className="panel-title">草稿图</span>
                {draft?.note && <span className="faint">夹具</span>}
              </div>
              <div className="panel-body build-canvas">
                {draft ? (
                  <div className="draft-shot">
                    {isMock && <Tag className="draft-shot__badge" color="warning">MOCK 夹具图</Tag>}
                    <img
                      src={fsClient.readRawUrl(draft.file, saved?.bust ?? 0)}
                      alt="草稿图"
                      className="draft-shot__img"
                    />
                  </div>
                ) : (
                  <Empty text="还没出图" />
                )}
              </div>
              {draft?.note && <div className="panel-foot faint">{draft.note}</div>}
            </div>

            <div className="panel is-flex">
              <div className="panel-head">
                <span className="panel-title">抠出来的轮廓</span>
                {outline?.path && (
                  <Tag
                    color={outline.path === 'polygon' ? 'success' : 'warning'}
                    style={{ marginInlineEnd: 0 }}
                  >
                    {outline.path === 'polygon' ? '走的多边形' : '退到掩码兜底'}
                  </Tag>
                )}
              </div>
              <div className="panel-body">
                {outline ? (
                  <>
                    <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                      <ContourThumb poly={outline.poly} size={64} />
                      <div style={{ minWidth: 0 }}>
                        <div className="mono faint">
                          {outline.ok ? `${outline.poly.length} 个顶点 · ${outline.ms}ms` : `中断 · ${outline.ms}ms`}
                        </div>
                        {outline.model && <div className="faint mono">{outline.model}</div>}
                      </div>
                    </div>
                    {!outline.ok && (
                      <Alert
                        type="error"
                        showIcon
                        style={{ marginTop: 10 }}
                        title="这一步就没过去"
                        description={outline.reason}
                      />
                    )}
                    {outline.notes?.length > 0 && (
                      <ul className="draft-list">
                        {outline.notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    )}
                    {outline.problems?.length > 0 && (
                      <ul className="draft-list draft-list--warn">
                        {outline.problems.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    )}
                    {outline.attempts && (
                      <details className="draft-details">
                        <summary>两条路各自的结果</summary>
                        <pre className="draft-pre">
                          {JSON.stringify(outline.attempts, null, 2)}
                        </pre>
                      </details>
                    )}
                  </>
                ) : (
                  <Empty text="还没抠轮廓" />
                )}
              </div>
            </div>

            {prompts && (
              <div className="panel">
                <div className="panel-head">
                  <span className="panel-title">提示词</span>
                  <span className="faint mono">v{PROMPT_VERSION}</span>
                </div>
                <div className="panel-body">
                  <details className="draft-details">
                    <summary>文生图（主题只影响这一份）</summary>
                    <pre className="draft-pre">{prompts.image}</pre>
                  </details>
                  <details className="draft-details">
                    <summary>视觉理解</summary>
                    <pre className="draft-pre">{prompts.vision}</pre>
                  </details>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="build-col">
          <div className="panel is-flex">
            <div className="panel-head">
              <span className="panel-title">工作台画布</span>
              <Space size={8}>
                {solution && (
                  <Tag color={LEVEL_TONE[solution.level]} style={{ marginInlineEnd: 0 }}>
                    {solution.level}
                  </Tag>
                )}
                {work && <span className="faint">{work.tiles.length} 片</span>}
              </Space>
            </div>
            <div className="panel-body build-canvas">
              {work ? (
                <MosaicCanvas work={work} showGrid showAtoms={false} contour={outline?.poly ?? null} />
              ) : (
                <Empty text={solution ? solution.reason ?? '一片都放不下' : '还没求解'} />
              )}
            </div>
            {solution && (
              <div className="panel-foot">
                <div className="row-between" style={{ gap: 12, flexWrap: 'wrap' }}>
                  <Space size={12} wrap>
                    <Stat label="片" value={solution.tiles.length} />
                    <Stat label="覆盖" value={pct(solution.metrics?.coverage)} />
                    <Stat label="溢出" value={`${((solution.metrics?.overflow ?? 0) * 100).toFixed(1)}%`} />
                    {report?.solvable && <Stat label="难度" value={report.difficulty.score} />}
                  </Space>
                  <span className="faint mono">{FALLBACK_LABEL[solution.level]}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="build-col">
          <div className="panel is-flex">
            <div className="panel-head">
              <span className="panel-title">导出预览</span>
              {png && (
                <span className="faint mono">
                  {png.width}×{png.height} · {fmtKB(png.bytes)}
                </span>
              )}
            </div>
            <div className="panel-body build-canvas">
              {saved ? (
                // 图从**磁盘上读回来**，不是把内存里的 base64 直接显示 —— 这一条
                // 才真正证明「导出的 PNG 落盘了、而且内容是对的」。显示内存里那份
                // 只能证明栅格化成功，证明不了落盘那一步。
                <div className="draft-shot">
                  {isMock && <Tag className="draft-shot__badge" color="warning">MOCK</Tag>}
                  <img
                    src={fsClient.readRawUrl(`works/${saved.workId}/render.png`, saved.bust)}
                    alt="导出的拼贴图"
                    className="draft-shot__img"
                  />
                </div>
              ) : (
                <Empty text="求解成功后在这里出图" />
              )}
            </div>
            {saved && (
              <div className="panel-foot row-between" style={{ gap: 12 }}>
                <span className="faint mono" style={{ wordBreak: 'break-all' }}>
                  library/works/{saved.workId}/ · render.png render.svg work.json vision.json
                </span>
                {/* 落盘之后唯一的下一步：拿着 workId 去搭建页。走 query 不走
                    `/produce/build/:id` —— 三级菜单的 key 就是路由 path 那条约定
                    只覆盖静态路由，参数化路径会开出一个 label 解析不到的标签页。 */}
                <Button
                  size="small"
                  type="primary"
                  icon={<ToolOutlined />}
                  onClick={() => navigate(`/produce/build?work=${saved.workId}`)}
                  style={{ flex: 'none' }}
                >
                  去搭建
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---------------- 报告 ---------------- */}
      {report && solution?.tiles.length > 0 && (
        <div className="panel" style={{ marginTop: 14 }}>
          <div className="panel-head">
            <span className="panel-title">可行性报告</span>
            <Space size={8}>
              <Tag color={LEVEL_TONE[solution.level]} style={{ marginInlineEnd: 0 }}>
                {solution.level}
              </Tag>
              <span className="faint mono">seed {solution.seed}</span>
            </Space>
          </div>
          {solution.note && (
            <Alert
              type={solution.level === 'L0' ? 'success' : 'warning'}
              showIcon
              banner
              title={solution.note}
            />
          )}
          <div className="panel-body">
            <Space size={18} wrap>
              <Stat label="年龄带" value={report.ageBand.label} />
              <Stat label="形状种类" value={Object.keys(report.shapeUsage).length} />
              <Stat label="颜色种类" value={Object.keys(report.colorUsage).length} />
              <Stat label="对称度" value={report.symmetry} />
              <Stat label="结构" value={report.connected ? '连成一片' : `${report.componentCount} 块`} />
              <Stat label="轮廓来源" value={outline?.path === 'polygon' ? '多边形' : '掩码兜底'} />
            </Space>
            {report.shortfall.length > 0 && (
              <Alert
                type="warning"
                showIcon
                style={{ marginTop: 14 }}
                title="这份方案超出了现有库存"
                description={`需要补：${report.shortfall
                  .map((s) => `${s.shape} ${s.need - s.have} 片（现有 ${s.have}）`)
                  .join('、')}`}
              />
            )}
          </div>
        </div>
      )}

      {/* 原始响应：出问题时唯一能复盘的东西 */}
      {outline?.text && (
        <div className="panel" style={{ marginTop: 14 }}>
          <div className="panel-head">
            <span className="panel-title">视觉理解的原始回复</span>
            <span className="faint">同时存了一份到 works/&lt;id&gt;/vision.json</span>
          </div>
          <div className="panel-body">
            <pre className="draft-pre draft-pre--tall">{outline.text}</pre>
          </div>
        </div>
      )}

      {payload && (payload.problems?.length > 0 || payload.note) && (
        <div className="panel" style={{ marginTop: 14 }}>
          <div className="panel-head">
            <span className="panel-title">解析结果</span>
            {payload.note && <span className="faint">{payload.note}</span>}
          </div>
          <div className="panel-body">
            <div className="faint mono">
              polygon {payload.polygon.length} 顶点 · mask{' '}
              {payload.mask ? `${payload.mask.length} 行` : '没有'}
            </div>
            {payload.problems.length > 0 && (
              <ul className="draft-list draft-list--warn">
                {payload.problems.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </PageShell>
  )
}

function Empty({ text }) {
  return (
    <div className="draft-figure faint" style={{ flexDirection: 'column', gap: 6 }}>
      <span>{text}</span>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <span className="faint">
      {label}{' '}
      <b className="mono" style={{ color: 'var(--ink)' }}>
        {value}
      </b>
    </span>
  )
}
