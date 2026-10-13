import { Navigate, Route, Routes } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import { HomeComponent, routeConfig } from './router'
import { HOME_KEY } from './lib/constants'

// 路由 path 直接取自 routeConfig 的 key，与菜单三级 key 是同一份字符串，
// 不可能出现「菜单 key 带斜杠、路由不带」这类不一致。
const routes = Object.entries(routeConfig)

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<HomeComponent />} />
        <Route path={HOME_KEY} element={<HomeComponent />} />
        {routes.map(([path, { component: Component }]) => (
          <Route key={path} path={path} element={<Component />} />
        ))}
        <Route path="*" element={<Navigate to={HOME_KEY} replace />} />
      </Route>
    </Routes>
  )
}
