/**
 * 资产库 —— 五步链路的最后一站，也是唯一一个「往回看」的页面。
 *
 * 它只读：不写 work.json、不删目录、不搬文件。所以它不需要 store，也不需要
 * 失效协议 —— 每次进来（和点刷新）就重新列一遍 `library/works/`。
 *
 * 三条刻意的设计：
 *
 * 1. **详情是页内视图，不是路由。** 用 `?work=<id>` 驱动。三级菜单的 key 就是路由
 *    path，参数化路由会开出一个 `findLabel` 查不到 label 的标签页 —— 那条坑在
 *    `pc/CLAUDE.md` 里躺着。
 * 2. **不完整的目录照样列出来。** 缺 `work.json`、只剩一张 `draft.svg` 的目录正是
 *    最该被看见的东西（清残留、查「跑挂在哪一步」都靠它）。静默丢掉磁盘上的垃圾，
 *    垃圾就永远查不到了。
 * 3. **列表里不跑求解器。** 难度走 `estimateDifficulty`（只数构成），不是 `buildReport`。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Alert,
  App,
  Button,
  Descriptions,
  Empty,
  Input,
  Progress,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
} from 'antd'
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  ExperimentOutlined,
  PartitionOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import PageShell from '../../components/PageShell'
import { fsClient } from '../../lib/fsClient'
import { listWorkFiles, listWorks, loadWork } from '../../lib/works'
import { AGE_BANDS, estimateDifficulty } from '../../core/api'

/** mock 产出必须一眼看得出 —— 夹具和真产出在图上没有任何区别 */
const isMock = (w) => w?.solution?.aiMode === 'mock'

const basename = (p) => String(p ?? '').split('/').pop()

/** 能直接丢给 `<img src>` 的扩展名。**`.svg` 不算** —— 见 coverOf 的注释 */
const RASTER = /\.(png|jpe?g|webp|gif)$/i

/**
 * 封面用哪张图。
 *
 * **只在位图里挑，绝不把 `.svg` 当 `<img>` 源。** `<img>` 里的 SVG 是独立文档，
 * 读不到页面 CSS 变量 —— 这条在 CLAUDE.md 里，而列表页是最容易犯的地方。
 * 挑不到就画一个「无图」占位，比拿一张必然不对的图强。
 */
function coverOf(w) {
  if (w.incomplete) return null
  const list = [w.assets?.cover, w.assets?.photos?.[0], w.assets?.render, w.assets?.draft]
  return list.find((p) => p && RASTER.test(p)) ?? null
}

/* ---------------- 小件 ---------------- */

function Cover({ path, w = 56 }) {
  const [bad, setBad] = useState(false)
  if (!path || bad) {
    return (
      <span className="lib-cover lib-cover--none" style={{ width: w }}>
        无图
      </span>
    )
  }
  return (
    <span className="lib-cover" style={{ width: w }}>
      <img src={fsClient.readRawUrl(path)} alt="" onError={() => setBad(true)} />
    </span>
  )
}

function MockTag() {
  return (
    <Tooltip title="这份作品是 mock 夹具跑出来的（草稿图不是模型画的，视觉响应是手写的）">
      <Tag color="warning">夹具</Tag>
    </Tooltip>
  )
}

function IncompleteTag({ reason }) {
  return (
    <Tooltip title={reason}>
      <Tag color="error">不完整</Tag>
    </Tooltip>
  )
}

const fmtTime = (ms) => {
  if (!ms) return '—'
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/* ---------------- 列表 ---------------- */

function ListPanel({ works, loading, onOpen, filters, setFilters }) {
  const { kw, theme, band, diffBand, mode } = filters
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }))

  // 每一行的派生字段。`works` 一变就重算一遍 —— 难度是纯函数、片数是数组长度，
  // 几十行不值得再挂一层缓存。
  const rows = useMemo(() => {
    return works.map((w) => {
      if (w.incomplete) {
        return {
          id: w.id,
          incomplete: true,
          reason: w.reason,
          title: '',
          theme: '',
          band: '',
          pieces: 0,
          shapeKinds: 0,
          steps: 0,
          mock: false,
          mtime: w.mtime,
          cover: null,
          difficulty: null,
        }
      }
      const tiles = w.tiles ?? []
      const diff = estimateDifficulty(w)
      return {
        id: w.id,
        incomplete: false,
        title: w.meta?.title ?? '未命名',
        theme: w.meta?.theme ?? '',
        /** 这一栏是「本来做给哪个年龄档的」，来自 meta —— 与难度算出来的档是两件事 */
        band: w.meta?.ageBand ?? diff.ageBand.key,
        pieces: tiles.length,
        shapeKinds: new Set(tiles.map((t) => t.shape)).size,
        steps: (w.steps ?? []).length,
        mock: isMock(w),
        mtime: w.mtime,
        cover: coverOf(w),
        difficulty: diff.score,
        diffBand: diff.ageBand.key,
      }
    })
  }, [works])

  const themes = useMemo(
    () => [...new Set(rows.map((r) => r.theme).filter(Boolean))].sort().map((v) => ({ value: v, label: v })),
    [rows],
  )
  const bands = useMemo(() => [...new Set(rows.map((r) => r.band).filter(Boolean))].sort(), [rows])

  const shown = useMemo(() => {
    const q = kw.trim().toLowerCase()
    return rows.filter((r) => {
      if (q && ![r.id, r.title, r.theme].some((s) => String(s).toLowerCase().includes(q))) return false
      if (theme && r.theme !== theme) return false
      if (band && r.band !== band) return false
      if (diffBand && r.diffBand !== diffBand) return false
      if (mode === 'mock' && !r.mock) return false
      if (mode === 'real' && (r.mock || r.incomplete)) return false
      return true
    })
  }, [rows, kw, theme, band, diffBand, mode])

  const mockCount = rows.filter((r) => r.mock).length
  const badCount = rows.filter((r) => r.incomplete).length

  const columns = [
    {
      title: '封面',
      key: 'cover',
      width: 76,
      render: (_, r) => <Cover path={r.cover} />,
    },
    {
      title: '作品',
      key: 'work',
      render: (_, r) => (
        <div className="lib-name">
          <span className="mono lib-id">{r.id}</span>
          <span className="lib-title">
            {r.incomplete ? <span className="faint">（没有 work.json）</span> : r.title}
          </span>
        </div>
      ),
    },
    {
      title: '题材',
      dataIndex: 'theme',
      width: 96,
      render: (v) => (v ? <Tag>{v}</Tag> : <span className="faint">—</span>),
    },
    {
      title: '年龄档',
      dataIndex: 'band',
      width: 82,
      render: (v, r) =>
        v ? (
          r.diffBand && r.diffBand !== v ? (
            <Tooltip title={`meta 里写的是「${v}」（做给这一档的），但按结构算出来是「${r.diffBand}」`}>
              <Tag color="gold">{v}</Tag>
            </Tooltip>
          ) : (
            <Tag>{v}</Tag>
          )
        ) : (
          <span className="faint">—</span>
        ),
    },
    {
      title: '难度',
      dataIndex: 'difficulty',
      width: 118,
      sorter: (a, b) => (a.difficulty ?? -1) - (b.difficulty ?? -1),
      render: (v, r) =>
        r.difficulty === null ? (
          <span className="faint">—</span>
        ) : (
          <Tooltip
            title={`按片数 / 形状种类 / 颜色种类 / 步骤数四项加权（权重见 core/config.js）。结构上属「${r.diffBand}」档`}
          >
            <span className="lib-diff">
              <Progress
                percent={Math.round(r.difficulty * 100)}
                size="small"
                showInfo={false}
                style={{ width: 52, margin: 0 }}
                strokeColor="var(--brand)"
                railColor="var(--rule)"
              />
              <span className="mono">{r.difficulty.toFixed(2)}</span>
            </span>
          </Tooltip>
        ),
    },
    {
      title: '片数',
      dataIndex: 'pieces',
      width: 68,
      align: 'right',
      sorter: (a, b) => a.pieces - b.pieces,
      render: (v, r) => (r.incomplete ? <span className="faint">—</span> : <span className="mono">{v}</span>),
    },
    {
      title: '形状',
      dataIndex: 'shapeKinds',
      width: 62,
      align: 'right',
      render: (v, r) => (r.incomplete ? <span className="faint">—</span> : <span className="mono">{v}</span>),
    },
    {
      title: '步骤',
      dataIndex: 'steps',
      width: 62,
      align: 'right',
      sorter: (a, b) => a.steps - b.steps,
      render: (v, r) =>
        r.incomplete ? <span className="faint">—</span> : v ? <span className="mono">{v}</span> : <span className="faint">未拆</span>,
    },
    {
      title: '来源',
      key: 'src',
      width: 76,
      render: (_, r) => (r.incomplete ? <IncompleteTag reason={r.reason} /> : r.mock ? <MockTag /> : <Tag color="green">真产出</Tag>),
    },
    {
      title: '更新于',
      dataIndex: 'mtime',
      width: 134,
      defaultSortOrder: 'descend',
      sorter: (a, b) => (a.mtime ?? 0) - (b.mtime ?? 0),
      // nowrap：`2026-09-18 17:19` 正好卡在列宽边缘，换行的话整行会高出一截，
      // 表格看起来在抖
      render: (v) => <span className="mono faint lib-time">{fmtTime(v)}</span>,
    },
    {
      title: '',
      key: 'ops',
      width: 72,
      align: 'right',
      render: (_, r) => (
        <Button size="small" onClick={() => onOpen(r.id)}>
          打开
        </Button>
      ),
    },
  ]

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">作品清单</span>
        <Space size={8} wrap>
          <span className="faint">
            共 {rows.length} 件
            {mockCount ? ` · ${mockCount} 件是夹具` : ''}
            {badCount ? ` · ${badCount} 个目录不完整` : ''}
          </span>
        </Space>
      </div>

      <div className="panel-body lib-filters">
        <Input
          allowClear
          size="small"
          style={{ width: 220 }}
          prefix={<SearchOutlined />}
          placeholder="搜 id / 标题 / 题材"
          value={kw}
          onChange={(e) => set({ kw: e.target.value })}
        />
        <Select
          allowClear
          size="small"
          style={{ width: 130 }}
          placeholder="题材"
          value={theme ?? undefined}
          onChange={(v) => set({ theme: v ?? null })}
          options={themes}
        />
        <Select
          allowClear
          size="small"
          style={{ width: 140 }}
          placeholder="年龄档（做给谁）"
          value={band ?? undefined}
          onChange={(v) => set({ band: v ?? null })}
          options={bands.map((b) => ({ value: b, label: AGE_BANDS.find((x) => x.key === b)?.label ?? b }))}
        />
        {/* 与「年龄档」不是同一个筛选：那个问的是 meta 里当初定给谁，这个问的是结构上
            实际是几档。两者不一致正是值得查的东西（按启蒙档做的其实是进阶的活） */}
        <Select
          allowClear
          size="small"
          style={{ width: 140 }}
          placeholder="难度（结构上）"
          value={diffBand ?? undefined}
          onChange={(v) => set({ diffBand: v ?? null })}
          options={AGE_BANDS.map((b) => ({ value: b.key, label: b.label }))}
        />
        <Select
          allowClear
          size="small"
          style={{ width: 120 }}
          placeholder="来源"
          value={mode ?? undefined}
          onChange={(v) => set({ mode: v ?? null })}
          options={[
            { value: 'real', label: '只看真产出' },
            { value: 'mock', label: '只看夹具' },
          ]}
        />
        <span className="faint">
          {shown.length === rows.length ? '' : `筛出 ${shown.length} 件`}
        </span>
      </div>

      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={shown}
        loading={loading}
        pagination={false}
        locale={{ emptyText: <Empty description="还没有作品。跑一遍草稿生成，这里就有东西了" /> }}
        onRow={(r) => ({ onClick: () => onOpen(r.id), style: { cursor: 'pointer' } })}
      />
    </div>
  )
}

/* ---------------- 详情 ---------------- */

function Figure({ path, label, files }) {
  const ok = path && files.includes(basename(path))
  return (
    <div className="lib-figure">
      <div className="lib-figure__cap">{label}</div>
      <div className="lib-figure__box">
        {ok ? <img src={fsClient.readRawUrl(path)} alt={label} /> : <span className="faint">盘上没有这张图</span>}
      </div>
    </div>
  )
}

function WorkDetail({ id, onBack }) {
  const [state, setState] = useState(null)
  const [err, setErr] = useState('')
  const nav = useNavigate()

  // 换作品靠外面那个 `key={id}` 重挂，**不在这里同步清 state** ——
  // 在 effect 体里直接 setState 会招来一条 lint 错（也确实该避免：那是一次多余的渲染）。
  // 重挂的代价是重新读一遍磁盘，而这是「打开另一件作品」本来就该做的事。
  useEffect(() => {
    let alive = true
    Promise.all([loadWork(id), listWorkFiles(id)])
      .then(([{ work, missing, mtime }, files]) => {
        if (!alive) return
        setState({ work, missing, mtime, files: files.map((f) => f.name) })
      })
      .catch((e) => {
        if (alive) setErr(e.message)
      })
    return () => {
      alive = false
    }
  }, [id])

  const back = (
    <Button size="small" icon={<ArrowLeftOutlined />} onClick={onBack}>
      回列表
    </Button>
  )

  if (err) {
    return (
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">{id}</span>
          {back}
        </div>
        <div className="panel-body">
          <Alert type="error" showIcon title="读不出来" description={err} />
        </div>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="panel">
        <div className="panel-body" style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      </div>
    )
  }

  const { work, missing, files, mtime } = state

  if (missing || !work) {
    return (
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title mono">{id}</span>
          {back}
        </div>
        <div className="panel-body">
          <Alert
            type="warning"
            showIcon
            title="这个目录里没有 work.json"
            description="它可能是一次跑到一半的残留（比如草稿图出来了、抠轮廓那步挂了）。下面列的是目录里现有的文件 —— 要清掉的话在 Finder 里删整个目录，这里不提供删除入口。"
          />
          <div className="assets-list" style={{ marginTop: 12 }}>
            {files.length ? (
              files.map((f) => (
                <span key={f} className="mono">
                  {f}
                </span>
              ))
            ) : (
              <span className="faint">这个目录是空的</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  const assets = work.assets ?? {}
  const tiles = work.tiles ?? []
  const steps = work.steps ?? []
  const has = (p) => Boolean(p) && files.includes(basename(p))

  const plan = [assets.render, assets.draft].find(has) ?? null
  const photos = (assets.photos ?? []).filter(has)
  const stepImgs = (assets.stepImages ?? []).filter(has)
  const stepPngs = stepImgs.filter((p) => /\.png$/i.test(p))
  const downloads = [plan, ...stepImgs].filter(Boolean)

  const shapeUsage = {}
  for (const t of tiles) shapeUsage[t.shape] = (shapeUsage[t.shape] ?? 0) + 1
  const diff = estimateDifficulty(work)

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <Space size={8} wrap>
            {back}
            <span className="panel-title mono">{id}</span>
            {isMock(work) ? <MockTag /> : null}
            <span className="faint">{work.meta?.title ?? '未命名'}</span>
          </Space>
          <Space size={8}>
            <Button size="small" icon={<PartitionOutlined />} onClick={() => nav(`/produce/steps?work=${id}`)}>
              去拆解
            </Button>
            <Button size="small" type="primary" icon={<ExperimentOutlined />} onClick={() => nav(`/produce/build?work=${id}`)}>
              去搭建
            </Button>
          </Space>
        </div>

        <div className="panel-body">
          {isMock(work) ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              title="这是一份 mock 夹具跑出来的作品"
              description="草稿图来自 src/mock/ai/draft.svg，视觉响应是手写的。它在界面上和在磁盘上看起来都与真产出一模一样 —— 这就是这块牌子存在的理由。"
            />
          ) : null}

          <Descriptions size="small" column={4} bordered={false}>
            <Descriptions.Item label="题材">{work.meta?.theme ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="年龄档（做给谁）">{work.meta?.ageBand ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="难度">
              <span className="mono">{diff.score.toFixed(2)}</span>
              <span className="faint"> · 结构上属{diff.ageBand.label}档</span>
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              <span className="mono">{fmtTime(mtime)}</span>
            </Descriptions.Item>
            <Descriptions.Item label="片数">
              <span className="mono">{tiles.length}</span>
            </Descriptions.Item>
            <Descriptions.Item label="形状用量">
              {Object.entries(shapeUsage).map(([k, v]) => (
                <Tag key={k}>
                  {k} × {v}
                </Tag>
              ))}
            </Descriptions.Item>
            <Descriptions.Item label="步骤">
              {steps.length ? <span className="mono">{steps.length} 步</span> : <span className="faint">还没拆</span>}
            </Descriptions.Item>
            <Descriptions.Item label="求解">
              <span className="mono">
                {work.solution?.level ?? '—'} · 覆盖 {Math.round((work.solution?.coverage ?? 0) * 100)}% · {work.solution?.outlinePath ?? '—'}
              </span>
            </Descriptions.Item>
          </Descriptions>

          {work.stepsStale ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 12 }}
              title="步骤与片集对不上"
              description="这份作品存下来的步骤引用了已经不存在的片。步骤图是按当时那份 work.json 出的，照着搭会对不上。去拆解页重新拆一遍再存。"
            />
          ) : null}
        </div>
      </div>

      <div className="lib-split">
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">方案 vs 实物</span>
            <span className="faint">左边是求解器出的拼贴图，右边是搭完拍的照片</span>
          </div>
          <div className="panel-body lib-vs">
            <Figure path={plan} label="方案（render）" files={files} />
            <div className="lib-figure">
              <div className="lib-figure__cap">
                实物（{photos.length} 张）
              </div>
              <div className="lib-figure__box">
                {photos.length ? (
                  <div className="photo-grid">
                    {photos.map((p) => (
                      <a key={p} href={fsClient.readRawUrl(p)} target="_blank" rel="noreferrer">
                        <img src={fsClient.readRawUrl(p)} alt={basename(p)} />
                      </a>
                    ))}
                  </div>
                ) : (
                  <span className="faint">还没回填照片。去「实物搭建」页传一张</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">导出</span>
            <span className="faint">小红书 / 抖音都不吃 SVG，所以主推 PNG</span>
          </div>
          <div className="panel-body">
            {downloads.length === 0 ? (
              <span className="faint">盘上还没有可导出的图</span>
            ) : (
              <Space orientation="vertical" size={10} style={{ display: 'flex' }}>
                <div>
                  <div className="lib-figure__cap">成品图</div>
                  <Space size={8} wrap style={{ marginTop: 6 }}>
                    {[plan].filter(Boolean).map((p) => (
                      <Button
                        key={p}
                        size="small"
                        icon={<DownloadOutlined />}
                        href={fsClient.readRawUrl(p)}
                        download={`${id}-${basename(p)}`}
                      >
                        {basename(p)}
                      </Button>
                    ))}
                    {!plan ? <span className="faint">没有成品图</span> : null}
                  </Space>
                </div>
                <div>
                  <div className="lib-figure__cap">步骤图（{stepImgs.length} 个文件）</div>
                  <Space size={8} wrap style={{ marginTop: 6 }}>
                    {stepImgs.length === 0 ? (
                      <span className="faint">还没拆步骤。去「步骤拆解」页拆完保存</span>
                    ) : (
                      stepImgs.map((p) => (
                        <Button
                          key={p}
                          size="small"
                          icon={<DownloadOutlined />}
                          href={fsClient.readRawUrl(p)}
                          download={`${id}-${basename(p)}`}
                        >
                          {basename(p)}
                        </Button>
                      ))
                    )}
                  </Space>
                </div>
              </Space>
            )}
            <div className="faint" style={{ marginTop: 10 }}>
              下载名固定成 <span className="mono">{id}-…</span>：服务端不发 Content-Disposition，
              文件名由浏览器这边定，用 ASCII 才不会各家乱码。
            </div>
          </div>
        </div>
      </div>

      {stepPngs.length ? (
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">步骤图</span>
            <span className="faint">{stepPngs.length} 张 · 顺序就是搭建顺序</span>
          </div>
          <div className="panel-body lib-steps">
            {stepPngs.map((p) => (
              <figure key={p}>
                <img src={fsClient.readRawUrl(p)} alt={basename(p)} />
                <figcaption className="mono faint">{basename(p)}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      ) : null}

      <div className="lib-split">
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">资产清单</span>
            <span className="faint">work.json 里只存引用，这一栏是盘上真实有的文件</span>
          </div>
          <div className="panel-body">
            <div className="assets-list">
              {files.map((f) => (
                <span key={f} className="mono">
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">work.json</span>
            <span className="faint">原文，只读</span>
          </div>
          <div className="panel-body">
            <pre className="draft-pre draft-pre--tall">{JSON.stringify(work, null, 2)}</pre>
          </div>
        </div>
      </div>
    </>
  )
}

/* ---------------- 页面 ---------------- */

export default function Library() {
  const { message } = App.useApp()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('work')

  const [works, setWorks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ kw: '', theme: null, band: null, diffBand: null, mode: null })

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setWorks(await listWorks())
    } catch (err) {
      message.error(`列作品失败：${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [message])

  // StrictMode 下 effect 跑两遍。`listWorks` 是 N+1 次读，值得挡一下 ——
  // 挡法用一个只置真、从不清回的 ref，没有「记早了」的机会（M6 那个 bug 的形态）。
  const listedRef = useRef(false)
  useEffect(() => {
    if (listedRef.current) return
    listedRef.current = true
    refresh()
  }, [refresh])

  const open = (id) => setSearchParams({ work: id })
  const back = () => setSearchParams({})

  return (
    <PageShell
      title="资产库"
      desc="library/ 才是这个项目的真正资产，代码都是可以重写的。这里不写盘、不删文件，只把 works/ 下真实有的东西列出来。"
      actions={
        <Space size={8}>
          {selectedId ? null : (
            <span className="faint">
              共 {works.length} 个目录 · {works.filter((w) => !w.incomplete).length} 份带 work.json
            </span>
          )}
          <Button size="small" icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
            刷新
          </Button>
        </Space>
      }
    >
      {selectedId ? (
        /* `key` 是必需的：换作品要重挂，否则上一份的 state 会挂在新 id 上显示一轮 */
        <WorkDetail key={selectedId} id={selectedId} onBack={back} />
      ) : (
        <ListPanel works={works} loading={loading} onOpen={open} filters={filters} setFilters={setFilters} />
      )}
    </PageShell>
  )
}
