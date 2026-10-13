import { Layout } from 'antd'
import { Outlet } from 'react-router-dom'
import SideMenu from '../components/SideMenu'
import TabNav from '../components/TabNav'

const { Content } = Layout

export default function MainLayout() {
  return (
    <Layout style={{ minHeight: '100vh', height: '100vh', overflow: 'hidden' }}>
      <SideMenu />
      <Layout style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <TabNav />
        <Content
          style={{
            flex: 1,
            margin: 0,
            padding: 0,
            background: '#f5f5f5',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
