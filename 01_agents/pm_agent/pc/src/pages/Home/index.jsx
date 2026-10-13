import { Card, Row, Col, Statistic } from 'antd'
import { RiseOutlined, FallOutlined, ShoppingOutlined, InboxOutlined, DollarOutlined, TeamOutlined } from '@ant-design/icons'

export default function Home() {
  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日销售额"
              value={12800}
              prefix={<DollarOutlined style={{ color: '#FF6B00' }} />}
              suffix="元"
              styles={{ content: { color: '#FF6B00' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日订单数"
              value={256}
              prefix={<ShoppingOutlined style={{ color: '#1890ff' }} />}
              suffix="单"
              styles={{ content: { color: '#1890ff' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="待处理入库"
              value={18}
              prefix={<InboxOutlined style={{ color: '#52c41a' }} />}
              suffix="单"
              styles={{ content: { color: '#52c41a' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="客户总数"
              value={1024}
              prefix={<TeamOutlined style={{ color: '#722ed1' }} />}
              suffix="家"
              styles={{ content: { color: '#722ed1' } }}
            />
          </Card>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Card title="销售趋势" style={{ height: 300 }}>
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc' }}>
              图表区域
            </div>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="待办事项" style={{ height: 300 }}>
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc' }}>
              待办列表
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
