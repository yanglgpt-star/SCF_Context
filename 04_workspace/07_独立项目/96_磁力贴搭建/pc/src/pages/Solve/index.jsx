import { useMemo, useState } from 'react'
import { Alert, Space, Table, Tag } from 'antd'
import ContourThumb from '../../components/ContourThumb'
import MosaicCanvas from '../../components/MosaicCanvas'
import {
  COLOR_NAMES,
  CONTOURS,
  FALLBACK_LABEL,
  buildReport,
  normalizeWork,
  solveContour,
  stockToShapeMap,
} from '../../core/api.js'
import { useLibrary } from '../../stores/libraryStore'

/** 每级的色彩：能直接用的一路绿，勉强能用是黄，不能用是红 */
const LEVEL_TONE = { L0: 'success', L1: 'success', L2: 'warning', L3: 'warning', L4: 'warning', L5: 'error' }

export default function Solve() {
  const lib = useLibrary()
  const [selectedId, setSelectedId] = useState(CONTOURS[0].id)

  // 库存 → 求解器要的形状映射。store 只在库存真变了的时候换数组引用，
  // 所以按引用做依赖就够，不用序列化成字符串去比。
  const stock = useMemo(() => stockToShapeMap(lib.stock), [lib.stock])

  const contour = CONTOURS.find((c) => c.id === selectedId) ?? CONTOURS[0]

  /**
   * 求解是同步的，最慢一次约 0.7 秒（超库存的 8×8）。塞 Worker 之前先量：
   * 计划里写的门槛是「测出 >1s 就塞」，现在还没到。
   *
   * 耗时直接用求解器自己算的 `elapsedMs`，不在渲染里另掐一个表 ——
   * `performance.now()` 在渲染期是不纯调用（重渲就会得到不同的数），
   * react-hooks/purity 会拦，而且两个数本来就该是同一个。
   */
  const { sol, report, work } = useMemo(() => {
    const s = solveContour({ poly: contour.poly, stock, palette: COLOR_NAMES, options: { seedKey: contour.id } })
    const w = s.tiles.length
      ? normalizeWork({
          workId: `W-solve-${contour.id}`,
          canvas: s.canvas,
          tiles: s.tiles,
          meta: { title: contour.name },
        })
      : null
    return { sol: s, report: buildReport({ solution: s }), work: w }
  }, [contour, stock])

  const tone = LEVEL_TONE[sol.level] ?? 'default'

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">模拟求解</div>
          <div className="page-desc">
            「能不能拼成功」是求解问题不是生成问题：答案唯一可验证，对就是对、错就是错。
            左边选一个轮廓，右边就是求解器给出的每一片——形状、位置、旋转、颜色。
            拼不满时按 L0→L5 逐级放松，降级到了哪一级、为什么，写在下方的报告里。
          </div>
        </div>
        <Space size={8}>
          <Tag className="mono" style={{ marginInlineEnd: 0 }}>
            库存 {Object.values(stock).reduce((a, c) => a + Object.values(c).reduce((x, y) => x + y, 0), 0)} 片
          </Tag>
          <Tag style={{ marginInlineEnd: 0 }} color={tone}>
            {sol.level} · {sol.elapsedMs}ms
          </Tag>
        </Space>
      </div>

      <div className="build-split">
        <div className="build-col">
          <div className="panel is-flex">
            <div className="panel-head">
              <span className="panel-title">内置轮廓</span>
              <span className="faint">{CONTOURS.length} 个用例</span>
            </div>
            <div className="solve-list">
              {CONTOURS.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className={`solve-item${c.id === contour.id ? ' is-on' : ''}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <ContourThumb poly={c.poly} />
                  <span className="solve-meta">
                    <span className="solve-name">{c.name}</span>
                    <span className="faint mono" style={{ fontSize: 11 }}>
                      {c.id} · {c.area} a²
                    </span>
                  </span>
                  <Tag style={{ marginInlineEnd: 0 }} color={LEVEL_TONE[c.expect]}>
                    {c.expect}
                  </Tag>
                </button>
              ))}
            </div>
            <div className="panel-foot">
              <span className="faint">
                用例自带预期落点，对不上就说明求解器退步了（跑 <code className="mono">npm run bench</code> 看全量）
              </span>
            </div>
          </div>
        </div>

        <div className="build-col">
          <div className="panel is-flex">
            <div className="panel-head">
              <span className="panel-title">{contour.name} 的拼法</span>
              <Space size={8} wrap>
                <Tag style={{ marginInlineEnd: 0 }} color={tone}>
                  {sol.level}
                </Tag>
                <span className="faint">{FALLBACK_LABEL[sol.level]}</span>
              </Space>
            </div>

            {sol.note && (
              <Alert
                type={sol.level === 'L0' ? 'success' : sol.level === 'L5' ? 'error' : 'warning'}
                showIcon
                banner
                title={sol.note}
              />
            )}

            {work ? (
              <div className="panel-body build-canvas">
                <MosaicCanvas work={work} showGrid showAtoms={false} contour={contour.poly} />
              </div>
            ) : (
              <div className="panel-body build-canvas">
                <div className="placeholder">
                  <span className="milestone">L5</span>
                  <h3>这个轮廓一片都放不下</h3>
                  <p>{sol.reason}</p>
                </div>
              </div>
            )}

            <div className="panel-foot">
              <div className="row-between" style={{ gap: 12 }}>
                <Space size={12} wrap>
                  <Stat label="片" value={sol.tiles.length} />
                  <Stat label="覆盖" value={`${Math.round((sol.metrics?.coverage ?? 0) * 100)}%`} />
                  <Stat label="溢出" value={`${((sol.metrics?.overflow ?? 0) * 100).toFixed(1)}%`} />
                  <Stat label="缺口原子" value={sol.metrics?.gapAtoms ?? 0} />
                  {report.solvable && <Stat label="难度" value={report.difficulty.score} />}
                </Space>
                <span className="mono faint" style={{ whiteSpace: 'nowrap' }}>
                  seed {sol.seed}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">可行性报告</span>
          {!report.solvable && (
            <Tag color="error" style={{ marginInlineEnd: 0 }}>
              不可拼
            </Tag>
          )}
        </div>

        {sol.reason && (
          <Alert
            type={report.solvable ? 'info' : 'error'}
            showIcon
            banner
            title={sol.reason}
            description="这句话是按「能改的程度」排序挑出来的：先说改轮廓就能救的（窄缝），再说只能换草图的（斜边太缓），最后才是笼统的。"
          />
        )}

        <div className="panel-body">
          <Space size={18} wrap style={{ marginBottom: 14 }}>
            <Stat label="落点" value={sol.level} />
            {report.solvable && (
              <>
                <Stat label="年龄带" value={report.ageBand.label} />
                <Stat label="形状种类" value={Object.keys(report.shapeUsage).length} />
                <Stat label="颜色种类" value={Object.keys(report.colorUsage).length} />
                <Stat label="对称度" value={report.symmetry} />
                <Stat label="结构" value={report.connected ? '连成一片' : `${report.componentCount} 块`} />
              </>
            )}
          </Space>

          {report.shortfall.length > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 14 }}
              title="这份方案超出了现有库存"
              description={`需要补：${report.shortfall.map((s) => `${s.shape} ${s.need - s.have} 片（现有 ${s.have}）`).join('、')}`}
            />
          )}

          <Table
            size="small"
            pagination={false}
            rowKey="level"
            dataSource={sol.ladder ?? []}
            columns={LADDER_COLUMNS}
            locale={{ emptyText: '没有阶梯记录' }}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * 降级阶梯表。**这张表就是「降级策略逐级触发」这件事本身的证据** ——
 * 每一级为什么没成、搜了多少节点、摘了几个原子，全在这儿。
 */
const LADDER_COLUMNS = [
  {
    title: '级',
    dataIndex: 'level',
    width: 58,
    render: (level) => (
      <Tag color={LEVEL_TONE[level]} style={{ marginInlineEnd: 0 }}>
        {level}
      </Tag>
    ),
  },
  {
    title: '这一步放松了什么',
    dataIndex: 'level',
    render: (level) => <span className="faint">{FALLBACK_LABEL[level]}</span>,
  },
  {
    title: '片',
    dataIndex: 'pieces',
    width: 52,
    align: 'right',
    render: (n) => <span className="mono">{n ?? '—'}</span>,
  },
  {
    title: '缺口原子',
    dataIndex: 'gaps',
    width: 84,
    align: 'right',
    render: (n) => <span className="mono">{n ?? '—'}</span>,
  },
  {
    title: '补料',
    dataIndex: 'extra',
    width: 66,
    align: 'right',
    // 只在**通过**的那一行显示：没通过的级别记的是「试到顶的额度」，
    // 拿它当答案看会以为要补 64 片，而正确答案（8 片）是从实际用量算出来的。
    render: (n, row) => <span className="mono">{row.accepted ? (n ?? 0) : '—'}</span>,
  },
  {
    title: '搜过的节点',
    dataIndex: 'nodes',
    width: 98,
    align: 'right',
    render: (n) => <span className="mono faint">{(n ?? 0).toLocaleString('en-US')}</span>,
  },
  {
    title: '结果',
    key: 'verdict',
    render: (_, row) =>
      row.accepted ? (
        <Tag color="success" style={{ marginInlineEnd: 0 }}>
          通过
        </Tag>
      ) : (
        <span className="faint">{row.reason ?? '没搜到解'}</span>
      ),
  },
]

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
