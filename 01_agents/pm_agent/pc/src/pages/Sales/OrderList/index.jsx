import { useState, useMemo } from 'react'
import { Table, Button, Space, Input, Select, DatePicker, Drawer, Form, Row, Col, Pagination, Tag, message } from 'antd'
import { PlusOutlined, ExportOutlined, SearchOutlined, FilterOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { orderList } from '../../../mock/sales'

const { RangePicker } = DatePicker
const { Option } = Select

const statusColors = {
  '待审核': 'orange',
  '已审核': 'blue',
  '已完成': 'green',
  '已取消': 'default',
}

export default function OrderList() {
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [form] = Form.useForm()
  const [queryForm] = Form.useForm()

  const [queryParams, setQueryParams] = useState({
    customerName: '',
    status: undefined,
    dateRange: [],
  })

  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
  })

  const filteredData = useMemo(() => {
    return orderList.filter(order => {
      if (queryParams.customerName && !order.customerName.includes(queryParams.customerName)) {
        return false
      }
      if (queryParams.status && order.status !== queryParams.status) {
        return false
      }
      if (queryParams.dateRange && queryParams.dateRange.length === 2) {
        const orderDate = dayjs(order.orderDate)
        const [start, end] = queryParams.dateRange
        if (orderDate.isBefore(start, 'day') || orderDate.isAfter(end, 'day')) {
          return false
        }
      }
      return true
    })
  }, [queryParams])

  const pagedData = useMemo(() => {
    const start = (pagination.current - 1) * pagination.pageSize
    return filteredData.slice(start, start + pagination.pageSize)
  }, [filteredData, pagination])

  const handleSearch = () => {
    setPagination({ ...pagination, current: 1 })
  }

  const handleReset = () => {
    queryForm.resetFields()
    setQueryParams({ customerName: '', status: undefined, dateRange: [] })
    setPagination({ ...pagination, current: 1 })
  }

  const handleExport = () => {
    message.success(`已导出 ${selectedRowKeys.length} 条订单`)
  }

  const columns = [
    {
      title: '订单号',
      dataIndex: 'orderNo',
      width: 140,
    },
    {
      title: '客户名称',
      dataIndex: 'customerName',
      width: 100,
    },
    {
      title: '销售人员',
      dataIndex: 'seller',
      width: 80,
    },
    {
      title: '商品数量',
      dataIndex: 'productCount',
      width: 80,
      align: 'right',
    },
    {
      title: '订单金额',
      dataIndex: 'amount',
      width: 120,
      align: 'right',
      render: (val) => `¥${val.toLocaleString()}`,
    },
    {
      title: '订单状态',
      dataIndex: 'status',
      width: 90,
      render: (val) => <Tag color={statusColors[val]}>{val}</Tag>,
    },
    {
      title: '下单时间',
      dataIndex: 'orderDate',
      width: 160,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: () => (
        <Space size="small">
          <Button type="link" size="small">查看</Button>
          <Button type="link" size="small">编辑</Button>
          <Button type="link" size="small" danger>删除</Button>
        </Space>
      ),
    },
  ]

  const rowSelection = {
    selectedRowKeys,
    onChange: setSelectedRowKeys,
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 16, gap: 12, overflow: 'hidden' }}>
      {/* 页面标题 */}
      <div style={{ fontSize: 16, fontWeight: 500, color: '#333', marginBottom: 8 }}>订单列表</div>

      {/* 筛选区 */}
      <div style={{ flex: 'none' }}>
        <Form form={queryForm} layout="inline" size="middle">
          <Form.Item label="客户名称" name="customerName">
            <Input
              placeholder="请输入客户名称"
              style={{ width: 160 }}
              allowClear
              onChange={(e) => setQueryParams({ ...queryParams, customerName: e.target.value })}
            />
          </Form.Item>
          <Form.Item label="订单状态" name="status">
            <Select
              placeholder="请选择"
              style={{ width: 120 }}
              allowClear
              onChange={(val) => setQueryParams({ ...queryParams, status: val })}
            >
              <Option value="待审核">待审核</Option>
              <Option value="已审核">已审核</Option>
              <Option value="已完成">已完成</Option>
              <Option value="已取消">已取消</Option>
            </Select>
          </Form.Item>
          <Form.Item label="下单日期" name="dateRange">
            <RangePicker
              onChange={(val) => setQueryParams({ ...queryParams, dateRange: val })}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查询</Button>
              <Button onClick={handleReset}>重置</Button>
              <Button icon={<FilterOutlined />} onClick={() => setDrawerVisible(true)}>更多筛选</Button>
            </Space>
          </Form.Item>
        </Form>
      </div>

      {/* 操作按钮区 */}
      <div style={{ flex: 'none' }}>
        <Space>
          <Button type="primary" icon={<PlusOutlined />}>新增订单</Button>
          <Button icon={<ExportOutlined />} onClick={handleExport} disabled={selectedRowKeys.length === 0}>
            批量导出{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
          </Button>
        </Space>
      </div>

      {/* 列表区 - 表头固定，区域滚动 */}
      <Table
        rowSelection={rowSelection}
        columns={columns}
        dataSource={pagedData}
        rowKey="id"
        scroll={{ x: 1000, y: 'calc(100vh - 300px)' }}
        pagination={false}
        style={{ flex: 1, overflow: 'hidden' }}
      />

      {/* 分页区 */}
      <div style={{ flex: 'none', display: 'flex', justifyContent: 'flex-end', paddingTop: 12 }}>
        <Pagination
          current={pagination.current}
          pageSize={pagination.pageSize}
          total={filteredData.length}
          onChange={(page, pageSize) => setPagination({ current: page, pageSize })}
          showSizeChanger
          showQuickJumper
          pageSizeOptions={['10', '20', '50']}
          showTotal={(total) => `共 ${total} 条`}
        />
      </div>

      <Drawer
        title="更多筛选条件"
        placement="right"
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item label="客户名称">
                <Input placeholder="请输入客户名称" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="订单状态">
                <Select placeholder="请选择" allowClear>
                  <Option value="待审核">待审核</Option>
                  <Option value="已审核">已审核</Option>
                  <Option value="已完成">已完成</Option>
                  <Option value="已取消">已取消</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="销售人员">
                <Select placeholder="请选择" allowClear>
                  <Option value="小明">小明</Option>
                  <Option value="小红">小红</Option>
                  <Option value="小刚">小刚</Option>
                  <Option value="小丽">小丽</Option>
                  <Option value="小华">小华</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="下单日期">
                <RangePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="订单金额">
                <Space>
                  <Input placeholder="最小金额" style={{ width: 120 }} />
                  <span>至</span>
                  <Input placeholder="最大金额" style={{ width: 120 }} />
                </Space>
              </Form.Item>
            </Col>
          </Row>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => form.resetFields()}>重置</Button>
            <Button type="primary">查询</Button>
          </div>
        </Form>
      </Drawer>
    </div>
  )
}
