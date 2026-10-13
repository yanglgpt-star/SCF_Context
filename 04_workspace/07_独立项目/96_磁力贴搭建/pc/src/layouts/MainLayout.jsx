import { Layout } from 'antd'
import { Outlet } from 'react-router-dom'
import SideMenu from '../components/SideMenu'
import TabNav from '../components/TabNav'

const { Content } = Layout

export default function MainLayout() {
  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <SideMenu />
      <Layout style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <TabNav />
        <Content style={{ flex: 1, minHeight: 0, background: 'var(--ground)', overflow: 'hidden' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
