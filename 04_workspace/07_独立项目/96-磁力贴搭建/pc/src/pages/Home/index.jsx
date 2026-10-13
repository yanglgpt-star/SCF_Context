import { Alert, Button, Space, Tag } from 'antd'
import { ArrowRightOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import PageShell from '../../components/PageShell'
import { AGE_BANDS } from '../../core/api'
import { summarize, useLibrary } from '../../stores/libraryStore'

const FLOW = [
  {
    step: '01',
    title: '草稿生成',
    path: '/produce/draft',
    milestone: 'M4',
    state: 'todo',
    desc: '给主题出草稿图，提示词里带上可拼性约束',
  },
  {
    step: '02',
    title: '模拟求解',
    path: '/produce/solve',
    milestone: 'M3',
    state: 'todo',
    desc: '吸附到网格 + DLX 精确覆盖，算准能不能拼出来',
  },
  {
    step: '03',
    title: '实物搭建',
    path: '/produce/build',
    milestone: 'M6',
    state: 'todo',
    desc: '照方案搭、分步拍照、记录实际偏差',
  },
  {
    step: '04',
    title: '步骤拆解',
    path: '/produce/steps',
    milestone: 'M7',
    state: 'todo',
    desc: '生成满足连通性约束的有序搭建序列',
  },
  {
    step: '05',
    title: '资产入库',
    path: '/asset/library',
    milestone: 'M8',
    state: 'todo',
    desc: '作品、步骤数据、素材归档，供批量出片',
  },
]

function Stat({ label, value, unit, hint }) {
  return (
    <div className="panel" style={{ flex: 1, minWidth: 150 }}>
      <div className="panel-body" style={{ padding: '12px 14px' }}>
        <div className="faint" style={{ marginBottom: 4 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span className="mono" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.1 }}>
            {value}
          </span>
          {unit && <span className="faint">{unit}</span>}
        </div>
        {hint && <div className="faint" style={{ marginTop: 4 }}>{hint}</div>}
      </div>
    </div>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const lib = useLibrary()
  const stats = summarize(lib)

  const ready = lib.loadedFrom === 'disk'

  return (
    <PageShell
      title="工作台"
      desc="磁力贴搭建内容工厂 · 一期跑通「草稿 → 模拟 → 实物 → 步骤 → 入库」这条链路，先不做小程序和视频。"
      actions={
        <Space size={8}>
          <Button size="small" icon={<ReloadOutlined />} onClick={lib.reload} loading={lib.loading}>
            重新载入
          </Button>
          <Button size="small" type="primary" onClick={() => navigate('/base/shapes')}>
            去形状库
          </Button>
        </Space>
      }
    >
      {!ready && !lib.loading && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 14 }}
          title="零件体系还没落盘"
          description="当前用的是标准套装默认值。求解器的所有库存约束都以 library/shapes.json 和 stock.json 为准，先去形状库按实测核对一遍。"
          action={
            <Button size="small" onClick={() => navigate('/base/shapes')}>
              去核对
            </Button>
          }
        />
      )}

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Stat
          label="形状种类"
          value={stats.shapeKinds}
          unit="种"
          hint={`${stats.planarShapes} 种可参与平面拼贴`}
        />
        <Stat label="库存片数" value={stats.total} unit="片" hint={`${stats.kinds} 种有货`} />
        <Stat label="基准单位 a" value={lib.unit.toFixed(1)} unit="cm" hint="正方形边长，须卡尺实测" />
        <Stat label="已入库作品" value={0} unit="个" hint="M8 之后开始累积" />
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head">
          <span className="panel-title">生产流程</span>
          <span className="faint">点任意一步进入对应页面</span>
        </div>
        <div>
          {FLOW.map((item, index) => (
            <div
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 14px',
                borderTop: index === 0 ? 'none' : '1px solid var(--rule)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--brand-wash)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <span
                className="mono"
                style={{
                  fontSize: 12,
                  color: 'var(--ink-3)',
                  width: 22,
                  flex: '0 0 22px',
                }}
              >
                {item.step}
              </span>
              <span style={{ width: 90, flex: '0 0 90px', fontWeight: 500 }}>{item.title}</span>
              <Tag
                style={{ marginInlineEnd: 0, background: 'var(--brand-wash)', color: 'var(--brand)', border: 'none' }}
              >
                {item.milestone}
              </Tag>
              <span className="muted" style={{ flex: 1 }}>{item.desc}</span>
              <ArrowRightOutlined style={{ color: 'var(--ink-3)', fontSize: 11 }} />
            </div>
          ))}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head">
          <span className="panel-title">内容定位</span>
          <span className="faint">亲子向 · 一周 10 条</span>
        </div>
        <div className="panel-body">
          <Space size={26} wrap>
            {AGE_BANDS.map((band) => (
              <div key={band.key}>
                <div style={{ fontWeight: 500, marginBottom: 2 }}>{band.label}</div>
                <div className="faint">
                  {band.minPieces}-{band.maxPieces} 片 · 难度 ≤ {band.maxDifficulty}
                </div>
              </div>
            ))}
            <div style={{ borderLeft: '1px solid var(--rule)', paddingLeft: 26 }}>
              <div className="faint" style={{ lineHeight: 1.9 }}>
                平面拼贴只用直角族（正方形 / 等腰直角三角形 / 长方形）。
                <br />
                等边三角形的 60° 角和正方形的 90° 角在同一平面无法无缝共边，留给二期立体搭建。
              </div>
            </div>
          </Space>
        </div>
      </div>
    </PageShell>
  )
}
