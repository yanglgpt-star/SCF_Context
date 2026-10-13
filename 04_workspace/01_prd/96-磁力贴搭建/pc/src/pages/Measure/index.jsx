import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Empty,
  InputNumber,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Upload,
} from 'antd'
import {
  AimOutlined,
  DeleteOutlined,
  InboxOutlined,
  ReloadOutlined,
  SaveOutlined,
  UndoOutlined,
} from '@ant-design/icons'
import {
  SPREAD_WARN_PCT,
  applyMeasurements,
  makeScale,
  summarizeMarks,
} from '../../core/api.js'
import { fsClient } from '../../lib/fsClient'
import { EXT_BY_TYPE, PHOTO_ACCEPT, fileToBase64, photoReject } from '../../lib/photo'
import { useLibrary } from '../../stores/libraryStore'

/**
 * 实测录入（M5）：拍一张俯拍照，标一条已知长度的边，其余尺寸自己算出来。
 *
 * **这个页面在赌一件事，所以把它写在最上面：卡尺那一次测量会自己约掉。**
 * 同一张照片里所有东西都在同一个比例尺下，斜边/a 就等于「斜边的像素长 / a 的像素长」，
 * cm-per-px 在分子分母里是同一个数。于是比例只靠像素就能定，卡尺只负责绝对尺寸。
 * 数学在 core/measure/scale.js，证明在 bench-measure.mjs 的三条全局性质里。
 *
 * 它赌的第二件事是**照片是正对俯拍的**。斜着拍会近大远小，离镜头远的那块形状被算小。
 * 这件事模块检测不了 —— 能做的是把「同一条边标了多次，几次差多少」摆出来，
 * 散得大通常就是拍歪了或手抖了。
 *
 * 坐标一律存**照片的原始像素**（naturalWidth 那套）。页面把照片显示成多大都行、
 * 放大几倍都行，点击时换算回原始像素再进 core —— 这样换台电脑换个窗口宽度，
 * 已经标好的点不会全部错位。
 */
const MEASURE_PATH = 'measure.json'

/** 上传的照片固定叫这个名字，最多在磁盘上留 3 个（每种扩展名一个），不会越攒越多 */
const SHOT_BASE = 'shots/measure'

const SOURCE_NOTE = '卡尺实测 + 照片标定（实测录入页）'

/** 点在图上的坐标舍到 0.1 像素 —— 再细没有意义，只会让 measure.json 里全是浮点尾巴 */
const round1 = (n) => Math.round(n * 10) / 10

export default function Measure() {
  const lib = useLibrary()
  const { message, modal } = App.useApp()

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const [photo, setPhoto] = useState(null) // { path, w, h, bust }
  const [ref, setRef] = useState(null) // { a, b, cm }
  const [marks, setMarks] = useState([])
  const [mode, setMode] = useState('ref') // 'ref' | 'mark'
  const [pending, setPending] = useState(null) // 一条边只点了第一个点时的那个点
  const [target, setTarget] = useState({ shapeId: null, edgeLabel: null })
  const [zoom, setZoom] = useState(1)
  const [savedAt, setSavedAt] = useState(null)

  const imgRef = useRef(null)
  const idRef = useRef(0)
  const nextId = useCallback(() => {
    idRef.current += 1
    return `m${idRef.current}`
  }, [])

  /* ------------------------------------------------------------ 读盘 --- */

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, missing } = await fsClient.read(MEASURE_PATH)
      if (missing || !data) {
        // 头一次进来：没有实测记录是正常状态，不是错误
        setPhoto(null)
        setRef(null)
        setMarks([])
        setMode('ref')
        setPending(null)
        setSavedAt(null)
        return
      }
      setPhoto(
        data.photo && data.imageW && data.imageH
          ? { path: data.photo, w: data.imageW, h: data.imageH, bust: Date.now() }
          : null,
      )
      setRef(data.ref ?? null)
      setMarks((Array.isArray(data.marks) ? data.marks : []).map((m) => ({ ...m, id: nextId() })))
      setMode(data.ref ? 'mark' : 'ref')
      setPending(null)
      setSavedAt(data.updatedAt ?? null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [nextId])

  const loadedRef = useRef(false)
  useEffect(() => {
    // StrictMode 下 effect 会跑两次，这里挡掉重复请求
    if (loadedRef.current) return
    loadedRef.current = true
    load()
  }, [load])

  /* -------------------------------------------------------- 比例与归纳 --- */

  const scale = useMemo(
    () => makeScale(ref ?? { a: null, b: null, cm: 0 }),
    [ref],
  )
  const summary = useMemo(() => summarizeMarks({ scale, marks }), [scale, marks])

  /** 下标 → 这条标注为什么不合格。core 报的是 marks 数组的下标，和渲染顺序一致 */
  const problemByIndex = useMemo(() => {
    const map = {}
    for (const p of summary.problems) map[p.index] = p
    return map
  }, [summary])

  const shapeOptions = useMemo(
    () => lib.shapes.map((s) => ({ value: s.id, label: `${s.name}（${s.id}）` })),
    [lib.shapes],
  )
  const targetShape = lib.shapes.find((s) => s.id === target.shapeId) ?? null

  /* --------------------------------------------------------- 点图标注 --- */

  const toNatural = (e) => {
    const img = imgRef.current
    if (!img || !photo) return null
    const r = img.getBoundingClientRect()
    if (!r.width || !r.height) return null
    return {
      x: round1((e.clientX - r.left) * (photo.w / r.width)),
      y: round1((e.clientY - r.top) * (photo.h / r.height)),
    }
  }

  const onStageClick = (e) => {
    if (!photo || busy) return
    const p = toNatural(e)
    if (!p) return

    if (mode === 'ref') {
      if (!pending) {
        setPending(p)
        return
      }
      setRef({ a: pending, b: p, cm: ref?.cm ?? lib.unit })
      setPending(null)
      setMode('mark')
      return
    }

    if (!target.shapeId || !target.edgeLabel) {
      message.warning('先选这次标的是哪个形状的哪条边')
      return
    }
    if (!pending) {
      setPending(p)
      return
    }
    // 短得离谱的标注照样收下、在列表里标红，而不是悄悄丢掉 ——
    // 用户点了一下就该看到结果，哪怕结果是「这条不算数」。
    setMarks((m) => [...m, { id: nextId(), shapeId: target.shapeId, edgeLabel: target.edgeLabel, a: pending, b: p }])
    setPending(null)
  }

  const onImgLoad = (e) => {
    const img = e.currentTarget
    if (!photo) return
    const w = img.naturalWidth
    const h = img.naturalHeight
    if (photo.w === w && photo.h === h) return

    // 磁盘上记的尺寸和真读出来的对不上，说明坐标是在另一个像素空间里标的 ——
    // 留着那些点只会得到一份看起来正常、其实全错的换算。
    const hadRecord = photo.w > 0 && photo.h > 0
    setPhoto((p) => ({ ...p, w, h }))
    if (!hadRecord) return // 刚传上来的照片，尺寸本来就是空的

    if (ref || marks.length) {
      setMarks([])
      setRef(null)
      setPending(null)
      setMode('ref')
    }
    message.warning(
      `照片尺寸和实测记录里存的对不上（记录 ${photo.w}×${photo.h}，实际 ${w}×${h}），已清空标注。`,
    )
  }

  /* ---------------------------------------------------------- 上传照片 --- */

  const beforeUpload = async (file) => {
    const reject = photoReject(file)
    if (reject) {
      message.error(reject)
      return Upload.LIST_IGNORE
    }

    const hasWork = marks.length > 0 || ref
    const path = `${SHOT_BASE}.${EXT_BY_TYPE[file.type]}`
    const go = async () => {
      setBusy(true)
      setError(null)
      try {
        const base64 = await fileToBase64(file)
        await fsClient.writeBinary(path, base64)
        setPhoto({ path, w: 0, h: 0, bust: Date.now() })
        setRef(null)
        setMarks([])
        setPending(null)
        setMode('ref')
        setSavedAt(null)
        message.success('照片已存到 library/shots/，先标参考边')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy(false)
      }
    }

    if (hasWork) {
      modal.confirm({
        title: '换照片会清空现在的标注',
        content: '参考边和所有已标的边都会没有 —— 新照片的像素空间和旧的不一样，坐标搬不过去。',
        okText: '换掉',
        cancelText: '算了',
        okButtonProps: { danger: true },
        onOk: go,
      })
    } else {
      await go()
    }
    return Upload.LIST_IGNORE
  }

  /* ------------------------------------------------------------ 落盘 --- */

  const onSave = async () => {
    setBusy(true)
    try {
      const bytes = await fsClient.write(MEASURE_PATH, {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        photo: photo?.path ?? null,
        imageW: photo?.w ?? null,
        imageH: photo?.h ?? null,
        ref,
        // id 是给 React 列表用的，不进磁盘 —— 读回来会重新发一遍
        marks: marks.map((m) => ({ shapeId: m.shapeId, edgeLabel: m.edgeLabel, a: m.a, b: m.b })),
      })
      setSavedAt(`刚刚 · ${bytes} 字节`)
      message.success('标注已存到 library/measure.json')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  /* --------------------------------------------------------- 应用入库 --- */

  const onApply = async () => {
    if (!scale.ok) {
      message.error(scale.reason ?? '参考边还没建立')
      return
    }
    const res = applyMeasurements({ shapes: lib.shapes, unit: ref.cm, summary })
    if (res.applied.length === 0) {
      message.warning('还没有标到任何一条边，没什么可应用的')
      return
    }

    const rough = Object.values(summary.byShape)
      .flatMap((byLabel) => Object.values(byLabel))
      .filter((e) => !e.consistent)
    const lines = res.applied.map(
      (a) => `${a.name}：` + a.labels.map((l) => `${l} → ${a.samples[l].ratio} a`).join('、'),
    )

    modal.confirm({
      title: `把实测结果写进 library/shapes.json？`,
      width: 520,
      okText: '写入',
      cancelText: '取消',
      content: (
        <div style={{ fontSize: 12, lineHeight: 1.7 }}>
          <div>
            基准单位 a = <b className="mono">{ref.cm}</b> cm（参考边 {scale.px.toFixed(0)} 像素，
            每像素 {scale.cmPerPx.toFixed(4)} cm）
          </div>
          <ul className="measure-confirm">
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {res.untouched.length > 0 && (
            <div className="measure-confirm__warn">
              这些没标到，保持原值不动：{res.untouched.map((u) => `${u.name}（${u.labels.join('、')}）`).join('；')}
            </div>
          )}
          {rough.length > 0 && (
            <div className="measure-confirm__warn">
              有 {rough.length} 条边名标了多次、几次差得超过 {SPREAD_WARN_PCT}% —— 多半是照片拍歪了或手抖，
              建议回去看一眼再写。
            </div>
          )}
        </div>
      ),
      onOk: async () => {
        const r = await lib.applyMeasured({ shapes: res.shapes, unit: ref.cm, source: SOURCE_NOTE })
        if (r.ok) message.success(`已写入 library/shapes.json（${r.bytes} 字节）`)
        else message.error(`写入失败：${r.error}`)
      },
    })
  }

  /* ------------------------------------------------------------ 渲染 --- */

  const overlayFont = photo ? Math.max(photo.w, photo.h) / 58 : 20
  const overlayStroke = photo ? Math.max(photo.w, photo.h) / 480 : 1.5

  const rows = useMemo(
    () =>
      lib.shapes
        .map((shape) => {
          const measured = summary.byShape?.[shape.id]
          if (!measured) return null
          return {
            shape,
            labels: shape.edges
              .filter((e) => measured[e.label])
              .map((e) => ({ label: e.label, ...measured[e.label] })),
          }
        })
        .filter(Boolean),
    [lib.shapes, summary],
  )

  if (loading) {
    return (
      <div className="page">
        <div className="panel" style={{ padding: 48, textAlign: 'center' }}>
          <Spin />
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">实测录入</div>
          <div className="page-desc">
            把整套积木平铺在浅色底上，**正对着俯拍**一张，传进来。先标正方形的一条边、填上卡尺量到的厘米数，
            再标其余形状的边 —— 长度自动算出来。同一张照片里所有东西共用一个比例尺，所以
            「斜边 ÷ 正方形边长」就等于两条边的像素长度之比，卡尺那一次读数会自己约掉。
            换句话说说：<b>比例靠照片，绝对尺寸靠卡尺那一下</b>。
          </div>
        </div>
        <Space size={8}>
          <Button size="small" icon={<ReloadOutlined />} onClick={load} disabled={busy}>
            重新载入
          </Button>
          <Button size="small" icon={<SaveOutlined />} onClick={onSave} disabled={!photo || busy} loading={busy}>
            保存标注
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<InboxOutlined />}
            onClick={onApply}
            disabled={!photo || !scale.ok || busy}
          >
            应用并入库
          </Button>
        </Space>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          closable
          style={{ marginBottom: 12 }}
          title="读写出错"
          description={`${error} —— 确认 npm run dev 已启动、library/ 目录存在。`}
        />
      )}

      <div className="measure-split">
        <div className="build-col">
          <div className="panel is-flex">
            <div className="panel-head">
              <span className="panel-title">实物照片</span>
              <Space size={8}>
                {photo && (
                  <Segmented
                    size="small"
                    value={zoom}
                    onChange={setZoom}
                    options={[
                      { value: 1, label: '适应' },
                      { value: 2, label: '2×' },
                      { value: 4, label: '4×' },
                    ]}
                  />
                )}
                <Upload beforeUpload={beforeUpload} showUploadList={false} accept={PHOTO_ACCEPT}>
                  <Button size="small" icon={<AimOutlined />} loading={busy}>
                    {photo ? '换一张' : '上传照片'}
                  </Button>
                </Upload>
              </Space>
            </div>

            <div className="panel-body measure-body">
              {!photo ? (
                <Upload.Dragger
                  beforeUpload={beforeUpload}
                  showUploadList={false}
                  accept={PHOTO_ACCEPT}
                  className="measure-drop"
                >
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">点这里，或者把照片拖进来</p>
                  <p className="ant-upload-hint">
                    整整齐齐平铺、镜头正对、光别斜 —— 拍歪了远处那块会被算小。
                    jpg / png / webp，15MB 以内。
                  </p>
                </Upload.Dragger>
              ) : (
                <div className="measure-host">
                  <div className="measure-stage" style={{ width: `${zoom * 100}%` }}>
                    <img
                      ref={imgRef}
                      className="measure-img"
                      src={fsClient.readRawUrl(photo.path, photo.bust)}
                      alt="待测量的实物照片"
                      onLoad={onImgLoad}
                      draggable={false}
                    />
                    <svg
                      className="measure-overlay"
                      viewBox={photo.w && photo.h ? `0 0 ${photo.w} ${photo.h}` : '0 0 100 100'}
                      preserveAspectRatio="none"
                      onClick={onStageClick}
                    >
                      {ref?.a && ref?.b && (
                        <g className="measure-seg measure-seg--ref">
                          <line x1={ref.a.x} y1={ref.a.y} x2={ref.b.x} y2={ref.b.y} strokeWidth={overlayStroke} />
                          <circle cx={ref.a.x} cy={ref.a.y} r={overlayStroke * 1.8} />
                          <circle cx={ref.b.x} cy={ref.b.y} r={overlayStroke * 1.8} />
                        </g>
                      )}
                      {marks.map((m, i) => (
                        <g
                          key={m.id}
                          className={`measure-seg${problemByIndex[i] ? ' measure-seg--bad' : ''}`}
                        >
                          <line x1={m.a.x} y1={m.a.y} x2={m.b.x} y2={m.b.y} strokeWidth={overlayStroke} />
                          <circle cx={m.a.x} cy={m.a.y} r={overlayStroke * 1.4} />
                          <circle cx={m.b.x} cy={m.b.y} r={overlayStroke * 1.4} />
                          <text
                            className="measure-seg__no"
                            x={(m.a.x + m.b.x) / 2}
                            y={(m.a.y + m.b.y) / 2 - overlayStroke * 2}
                            fontSize={overlayFont}
                          >
                            {i + 1}
                          </text>
                        </g>
                      ))}
                      {pending && (
                        <circle
                          className="measure-pending"
                          cx={pending.x}
                          cy={pending.y}
                          r={overlayStroke * 2.2}
                          strokeWidth={overlayStroke}
                        />
                      )}
                    </svg>
                  </div>
                </div>
              )}
            </div>

            <div className="panel-foot">
              <span className="faint">
                {pending
                  ? '已落第一个点 —— 再点一下就是这条边的另一端。'
                  : mode === 'ref'
                    ? '在照片上点正方形一条边的两端。'
                    : '点一条边的两端，长度就出来了。'}
              </span>
            </div>
          </div>
        </div>

        <div className="measure-col">
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">参考边</span>
              <Tag style={{ marginInlineEnd: 0 }} color={scale.ok ? 'success' : 'default'}>
                {scale.ok ? '已建立比例尺' : '待标'}
              </Tag>
            </div>
            <div className="panel-body">
              <Segmented
                block
                size="small"
                value={mode}
                onChange={(v) => {
                  setMode(v)
                  setPending(null)
                }}
                options={[
                  { value: 'ref', label: '标参考边' },
                  { value: 'mark', label: '标形状边' },
                ]}
              />

              {ref && (
                <div className="measure-ref">
                  <div className="row-between">
                    <span className="faint">
                      照片上 {scale.ok ? `${scale.px.toFixed(0)} 像素` : '太短'}
                    </span>
                    {pending === null && (
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => {
                          setRef(null)
                          setMode('ref')
                        }}
                      />
                    )}
                  </div>
                  <Space size={6} align="center" style={{ marginTop: 6 }}>
                    <span className="muted">实测</span>
                    <InputNumber
                      size="small"
                      min={0.5}
                      max={30}
                      step={0.1}
                      precision={2}
                      style={{ width: 92 }}
                      value={ref.cm}
                      onChange={(v) => setRef((r) => (r ? { ...r, cm: v } : r))}
                      addonAfter="cm"
                    />
                  </Space>
                  {scale.ok ? (
                    <div className="faint" style={{ marginTop: 6 }}>
                      每像素 <b className="mono">{scale.cmPerPx.toFixed(4)}</b> cm —— 这个 cm 同时就是
                      shapes.json 里的基准单位 a。
                    </div>
                  ) : (
                    <Alert type="warning" showIcon style={{ marginTop: 8 }} title={scale.reason} />
                  )}
                </div>
              )}

              {!ref && (
                <div className="faint" style={{ marginTop: 10, lineHeight: 1.7 }}>
                  还没有参考边。用卡尺量一块正方形的边长，在照片上把它标出来，把厘米数填进来 ——
                  这一下是唯一的绝对测量，其余全靠它推。
                </div>
              )}
            </div>
          </div>

          <div className="panel" style={{ marginTop: 14 }}>
            <div className="panel-head">
              <span className="panel-title">这次标哪条边</span>
              <span className="faint">{marks.length} 条</span>
            </div>
            <div className="panel-body">
              <Space size={6} style={{ display: 'flex' }}>
                <Select
                  size="small"
                  style={{ flex: 1 }}
                  placeholder="形状"
                  value={target.shapeId}
                  options={shapeOptions}
                  onChange={(v) => {
                    const s = lib.shapes.find((x) => x.id === v)
                    setTarget({ shapeId: v, edgeLabel: s?.edges[0]?.label ?? null })
                  }}
                />
                <Select
                  size="small"
                  style={{ flex: 1 }}
                  placeholder="边名"
                  value={target.edgeLabel}
                  disabled={!targetShape}
                  options={(targetShape?.edges ?? []).map((e) => ({ value: e.label, label: e.label }))}
                  onChange={(v) => setTarget((t) => ({ ...t, edgeLabel: v }))}
                />
              </Space>
              <div className="faint" style={{ marginTop: 8, lineHeight: 1.7 }}>
                同一条边名标多次会取平均（正方形有四条边，随便标两条更准），同时报出几次差多少 ——
                散得大就回去看看是不是拍歪了。
              </div>

              {marks.length > 0 && (
                <ul className="measure-list">
                  {marks.map((m, i) => {
                    const bad = problemByIndex[i]
                    const hit = summary.byShape?.[m.shapeId]?.[m.edgeLabel]
                    const shape = lib.shapes.find((s) => s.id === m.shapeId)
                    return (
                      <li key={m.id} className={bad ? 'is-bad' : ''}>
                        <span className="measure-list__no">{i + 1}</span>
                        <span className="measure-list__what">
                          {shape?.name ?? m.shapeId} · {m.edgeLabel}
                        </span>
                        <span className="measure-list__val mono">
                          {bad ? <Tooltip title={bad.reason}>不算数</Tooltip> : `${hit ? hit.ratio.toFixed(4) : '—'} a`}
                        </span>
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => setMarks((x) => x.filter((y) => y.id !== m.id))}
                        />
                      </li>
                    )
                  })}
                </ul>
              )}

              {pending && (
                <Button size="small" type="text" icon={<UndoOutlined />} onClick={() => setPending(null)} block>
                  取消这个点
                </Button>
              )}
            </div>
          </div>

          <div className="panel" style={{ marginTop: 14 }}>
            <div className="panel-head">
              <span className="panel-title">算出来的尺寸</span>
              <span className="faint">
                {summary.sampledLabels} 条边名
                {savedAt ? ` · ${savedAt}` : ''}
              </span>
            </div>
            <div className="panel-body">
              {rows.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没标到任何一条边" />
              ) : (
                rows.map(({ shape, labels }) => (
                  <div key={shape.id} className="measure-result">
                    <div className="measure-result__shape">{shape.name}</div>
                    {labels.map((l) => (
                      <div key={l.label} className="measure-result__row">
                        <span className="faint">{l.label}</span>
                        <span className="mono">
                          {l.ratio.toFixed(4)} a
                          <span className="muted"> · {(l.ratio * lib.unit).toFixed(2)}cm</span>
                        </span>
                        <span className="measure-result__n">
                          {l.n > 1 ? (
                            <Tooltip title={`标了 ${l.n} 次，最小 ${l.min.toFixed(4)}、最大 ${l.max.toFixed(4)}`}>
                              <Tag
                                style={{ marginInlineEnd: 0 }}
                                color={l.consistent ? 'success' : 'warning'}
                              >
                                {l.n} 次 · 差 {l.spreadPct.toFixed(1)}%
                              </Tag>
                            </Tooltip>
                          ) : (
                            <Tooltip title="只标了一次，散度无从谈起 —— 标两次才能看出准不准">
                              <Tag style={{ marginInlineEnd: 0 }}>1 次</Tag>
                            </Tooltip>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
            {rows.length > 0 && (
              <div className="panel-foot">
                <span className="faint">
                  括号里的厘米数按<b>当前库里的 a = {lib.unit}cm</b> 折算，只作参考 ——
                  点「应用并入库」才会把 a 改成参考边那个读数。
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
