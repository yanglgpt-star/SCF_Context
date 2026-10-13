import { useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
} from 'antd'
import { DeleteOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, UndoOutlined } from '@ant-design/icons'
import ShapeGlyph from '../../components/ShapeGlyph'
import { useLibrary } from '../../stores/libraryStore'
import { FAMILY_HINT, FAMILY_LABEL, formatEdgeLengths } from '../../data/defaults'
import { tilePalette } from '../../theme'

const FAMILY_TAG = {
  right: { color: 'green', text: '直角族' },
  equilateral: { color: 'gold', text: '等边族' },
  arc: { color: 'default', text: '弧形' },
}

const COLOR_OPTIONS = Object.entries(tilePalette).map(([name, hex]) => ({
  value: name,
  label: (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <i
        style={{
          width: 11,
          height: 11,
          borderRadius: 2,
          background: hex,
          border: '1px solid rgba(0,0,0,.18)',
          display: 'inline-block',
        }}
      />
      {name}
    </span>
  ),
}))

/* ---------------- 形状清单 ---------------- */

function ShapesTable({ lib }) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [editing, setEditing] = useState(null) // null = 关闭；{ mode, shape }

  const openEditor = (mode, shape) => {
    setEditing({ mode, shape })
    form.setFieldsValue(
      shape ?? {
        id: '',
        name: '',
        en: '',
        family: 'right',
        planar: true,
        edges: [{ label: '边长', ratio: 1, count: 4 }],
      },
    )
  }

  const submit = async () => {
    const values = await form.validateFields()
    const shape = {
      ...editing.shape,
      ...values,
      id: values.id.trim().toUpperCase().replace(/\s+/g, '-'),
      name: values.name.trim(),
      edges: values.edges.map((e) => ({
        label: e.label?.trim() || '边长',
        ratio: Number(e.ratio) || 1,
        count: Math.max(1, Math.floor(Number(e.count) || 1)),
      })),
    }
    if (editing.mode === 'create' && lib.shapes.some((s) => s.id === shape.id)) {
      message.error(`形状 ID「${shape.id}」已存在`)
      return
    }
    lib.upsertShape(shape)
    setEditing(null)
    message.success(editing.mode === 'create' ? `已新增 ${shape.name}，记得保存` : `已修改 ${shape.name}，记得保存`)
  }

  const columns = [
    {
      title: '形状',
      dataIndex: 'id',
      width: 64,
      render: (id, record) => (
        <Tooltip title={record.en || record.name}>
          <span style={{ display: 'inline-flex' }}>
            <ShapeGlyph id={id} size={30} color={record.planar ? 'var(--brand)' : 'var(--ink-3)'} />
          </span>
        </Tooltip>
      ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      width: 150,
      render: (name, record) => (
        <span className="cell-edit" onClick={() => openEditor('edit', record)}>
          {name}
        </span>
      ),
    },
    {
      title: 'ID',
      dataIndex: 'id',
      width: 84,
      render: (id) => <span className="mono" style={{ fontSize: 12, color: 'var(--ink-2)' }}>{id}</span>,
    },
    {
      title: '角度族',
      dataIndex: 'family',
      width: 92,
      render: (family) => {
        const tag = FAMILY_TAG[family] ?? FAMILY_TAG.arc
        return (
          <Tooltip title={FAMILY_HINT[family]}>
            <Tag color={tag.color} style={{ marginInlineEnd: 0 }}>
              {FAMILY_LABEL[family] ?? family}
            </Tag>
          </Tooltip>
        )
      },
    },
    {
      title: '实测尺寸',
      dataIndex: 'edges',
      render: (_, record) => (
        <span className="mono" style={{ fontSize: 12 }}>
          {formatEdgeLengths(record, lib.unit)}
        </span>
      ),
    },
    {
      title: '占格（T）',
      dataIndex: 'tCount',
      width: 84,
      align: 'right',
      render: (n) =>
        n === null || n === undefined ? (
          <Tooltip title="该形状不参与平面拼贴，不进 T 网格">
            <span className="faint">不计</span>
          </Tooltip>
        ) : (
          <span className="mono">{n}</span>
        ),
    },
    {
      title: '平面拼贴',
      dataIndex: 'planar',
      width: 104,
      render: (planar, record) => (
        <Switch
          size="small"
          checked={planar}
          onChange={(checked) => lib.upsertShape({ ...record, planar: checked })}
        />
      ),
    },
    {
      title: '',
      key: 'ops',
      width: 58,
      align: 'right',
      render: (_, record) => (
        <Popconfirm
          title={`删除「${record.name}」？`}
          description="该形状的库存条目会一并删除"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={() => lib.removeShape(record.id)}
        >
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">形状清单</span>
          <Space size={8}>
            <span className="faint">共 {lib.shapes.length} 种 · {lib.shapes.filter((s) => s.planar).length} 种可平面拼贴</span>
            <Button size="small" icon={<PlusOutlined />} onClick={() => openEditor('create', null)}>
              新增形状
            </Button>
          </Space>
        </div>
        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={lib.shapes}
          pagination={false}
          loading={lib.loading}
        />
      </div>

      <Modal
        open={Boolean(editing)}
        title={editing?.mode === 'create' ? '新增形状' : `编辑「${editing?.shape?.name ?? ''}」`}
        onCancel={() => setEditing(null)}
        onOk={submit}
        okText="确定"
        cancelText="取消"
        destroyOnHidden
        width={520}
      >
        <Form form={form} layout="vertical" size="small" style={{ marginTop: 12 }}>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="id" label="形状 ID" rules={[{ required: true, message: '必填' }]} style={{ flex: 1 }}>
              <Input placeholder="如 SQ / TRI-R" disabled={editing?.mode === 'edit'} />
            </Form.Item>
            <Form.Item name="name" label="中文名" rules={[{ required: true, message: '必填' }]} style={{ flex: 1 }}>
              <Input placeholder="如 正方形" />
            </Form.Item>
          </Space>

          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="family" label="角度族" style={{ flex: 1 }}>
              <Select
                options={Object.entries(FAMILY_LABEL).map(([value, label]) => ({ value, label }))}
              />
            </Form.Item>
            <Form.Item name="planar" label="参与平面拼贴" valuePropName="checked" style={{ flex: 1 }}>
              <Switch />
            </Form.Item>
          </Space>

          <Form.Item label="边长定义（相对基准单位 a 的倍数）" style={{ marginBottom: 0 }}>
            <Form.List name="edges">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => (
                    <Space key={field.key} size={8} style={{ display: 'flex', marginBottom: 8 }}>
                      <Form.Item name={[field.name, 'label']} noStyle>
                        <Input placeholder="边名" style={{ width: 96 }} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'ratio']} noStyle>
                        <InputNumber placeholder="倍数" step={0.1} min={0.1} style={{ width: 90 }} />
                      </Form.Item>
                      <span className="faint">× a，共</span>
                      <Form.Item name={[field.name, 'count']} noStyle>
                        <InputNumber placeholder="条数" min={1} step={1} style={{ width: 72 }} />
                      </Form.Item>
                      <span className="faint">条</span>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                    </Space>
                  ))}
                  <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => add({ label: '', ratio: 1, count: 1 })}>
                    加一条边
                  </Button>
                </>
              )}
            </Form.List>
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

/* ---------------- 库存 ---------------- */

function StockTable({ lib }) {
  const rows = useMemo(
    () =>
      lib.shapes.map((shape) => {
        const item = lib.stock.find((it) => it.shapeId === shape.id) ?? {
          shapeId: shape.id,
          count: 0,
          colors: [],
        }
        return { ...item, shape }
      }),
    [lib.shapes, lib.stock],
  )

  const total = rows.reduce((sum, r) => sum + r.count, 0)

  const columns = [
    {
      title: '形状',
      key: 'shape',
      width: 210,
      render: (_, row) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
          <ShapeGlyph id={row.shapeId} size={24} color={row.shape.planar ? 'var(--brand)' : 'var(--ink-3)'} />
          <span>{row.shape.name}</span>
          {!row.shape.planar && (
            <Tooltip title={FAMILY_HINT[row.shape.family] ?? '不参与平面拼贴'}>
              <Tag style={{ marginInlineEnd: 0 }} color="default">
                平面不可用
              </Tag>
            </Tooltip>
          )}
        </span>
      ),
    },
    {
      title: '数量',
      dataIndex: 'count',
      width: 130,
      render: (count, row) => (
        <InputNumber
          size="small"
          min={0}
          step={1}
          value={count}
          style={{ width: 92 }}
          onChange={(value) => lib.setStockItem(row.shapeId, { count: Math.max(0, Math.floor(value || 0)) })}
        />
      ),
    },
    {
      title: '占比',
      key: 'share',
      width: 110,
      render: (_, row) => {
        const pct = total > 0 ? (row.count / total) * 100 : 0
        return <span className="mono" style={{ fontSize: 12, color: 'var(--ink-2)' }}>{pct.toFixed(1)}%</span>
      },
    },
    {
      title: '手上有哪些颜色',
      dataIndex: 'colors',
      render: (colors, row) => (
        <Select
          size="small"
          mode="multiple"
          allowClear
          placeholder="选该形状实际有的颜色"
          style={{ width: '100%', minWidth: 200 }}
          value={colors}
          options={COLOR_OPTIONS}
          onChange={(value) => lib.setStockItem(row.shapeId, { colors: value })}
        />
      ),
    },
  ]

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">库存清单</span>
        <span className="faint">
          合计 <b className="mono" style={{ color: 'var(--ink)' }}>{total}</b> 片 ·
          {' '}
          {rows.filter((r) => r.count > 0).length} 种有货
        </span>
      </div>
      <Table rowKey="shapeId" size="small" columns={columns} dataSource={rows} pagination={false} loading={lib.loading} />
      <div className="panel-foot">
        <div className="row-between">
          <span className="faint">
            求解器以「形状 × 数量」为硬约束；颜色是第二遍软约束，配不齐只会降分，不会判无解。
          </span>
          <Input
            size="small"
            value={lib.stockSource}
            onChange={(e) => lib.setStockSource(e.target.value)}
            style={{ width: 300 }}
            placeholder="库存来源说明"
          />
        </div>
      </div>
    </div>
  )
}

/* ---------------- 页面 ---------------- */

export default function Shapes() {
  const lib = useLibrary()
  const { message } = App.useApp()

  const onSave = async () => {
    const ok = await lib.save()
    if (ok) message.success('已写入 library/shapes.json 与 library/stock.json')
    else message.error('保存失败，看页面上方的错误提示')
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">形状库</div>
          <div className="page-desc">
            零件体系是后面所有「能不能拼成功」判断的基准。先用卡尺量一块正方形的边长作为基准单位 a，
            其余形状的尺寸都由它换算。默认值是标准通用套装，务必按实测改一遍。
          </div>
        </div>
        <Space size={8}>
          <Button size="small" icon={<ReloadOutlined />} onClick={lib.reload} loading={lib.loading}>
            重新载入
          </Button>
          <Popconfirm
            title="恢复为标准套装默认值？"
            description="当前未保存的改动会丢失"
            okText="恢复"
            cancelText="取消"
            onConfirm={() => {
              lib.resetToDefaults()
              message.info('已恢复默认值，确认无误后保存')
            }}
          >
            <Button size="small" icon={<UndoOutlined />}>
              恢复默认
            </Button>
          </Popconfirm>
          <Button
            size="small"
            type="primary"
            icon={<SaveOutlined />}
            loading={lib.saving}
            disabled={!lib.dirty}
            onClick={onSave}
          >
            {lib.dirty ? '保存到 library' : '已保存'}
          </Button>
        </Space>
      </div>

      {lib.error && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          title="读写出错"
          description={`${lib.error} —— 确认 npm run dev 已启动，且 04_workspace/01_prd/96-磁力贴搭建/library/ 目录存在。`}
        />
      )}

      {lib.notice && !lib.error && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }} title={lib.notice} closable />
      )}

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">基准尺寸</span>
          <span className="faint">
            {lib.loadedFrom === 'disk' ? '来自 library/shapes.json' : '当前是内置默认值，尚未落盘'}
            {lib.savedAt ? ` · ${lib.savedAt}` : ''}
          </span>
        </div>
        <div className="panel-body">
          <Space size={20} align="center" wrap>
            <Space size={8} align="center">
              <span className="muted">基准单位 a（正方形边长）</span>
              <InputNumber
                size="small"
                min={1}
                max={30}
                step={0.1}
                value={lib.unit}
                precision={2}
                style={{ width: 96 }}
                onChange={lib.setUnit}
                addonAfter="cm"
              />
            </Space>
            <span className="faint">
              市面常见 6 / 7 / 7.5 —— 以卡尺实测为准，这个数错一点，求解出来的方案实物就搭不上。
            </span>
          </Space>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <Tabs
          items={[
            { key: 'shapes', label: '形状清单', children: <ShapesTable lib={lib} /> },
            { key: 'stock', label: '库存', children: <StockTable lib={lib} /> },
          ]}
        />
      </div>
    </div>
  )
}
