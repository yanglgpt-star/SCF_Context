import { useCallback, useState } from 'react'
import { Layout, Menu } from 'antd'
import { BellOutlined, SettingOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { findLabel, menuItems as rawMenuItems } from '../../router'
import { useTab } from '../../stores/tabStore'
import { HOME_KEY, HOME_LABEL } from '../../lib/constants'

const { Sider } = Layout

/** 返回从一级菜单到 key 的整条链路，找不到返回 null */
function findChain(key, items, trail = []) {
  for (const item of items) {
    if (item.key === key) return [...trail, item.key]
    if (item.children) {
      const found = findChain(key, item.children, [...trail, item.key])
      if (found) return found
    }
  }
  return null
}

/** 一级 15 / 二级 14 / 三级 13，与 page-structure 规范一致 */
function withLevelStyle(items, level = 1) {
  return items.map((item) => {
    const next = {
      ...item,
      style: { fontSize: level === 1 ? 15 : level === 2 ? 14 : 13, fontWeight: level === 1 ? 500 : 400 },
    }
    if (item.children) next.children = withLevelStyle(item.children, level + 1)
    return next
  })
}

const styledItems = withLevelStyle(rawMenuItems)

function BrandMark() {
  return (
    <svg className="app-brand__mark" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1.4" y="1.4" width="12.4" height="12.4" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M13.8 12.6 22 20.8H13.8Z" fill="currentColor" opacity="0.9" />
      <path d="M13.8 1.4 22 9.6H13.8Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export default function SideMenu() {
  const navigate = useNavigate()
  const location = useLocation()
  const { addTab } = useTab()

  const path = location.pathname
  const chain = findChain(path, rawMenuItems)
  const selectedKeys = chain ? [path] : [HOME_KEY]
  const ancestorKeys = chain ? chain.slice(0, -1) : ['base', 'base-parts']

  // 受控展开：点开就记住。路由变化时在渲染期把当前路径的祖先菜单补开
  // （用「记录上一次的 path」而不是 useEffect，避免多一轮级联渲染）
  const [openKeys, setOpenKeys] = useState(ancestorKeys)
  const [syncedPath, setSyncedPath] = useState(path)
  if (path !== syncedPath) {
    setSyncedPath(path)
    setOpenKeys((prev) => Array.from(new Set([...prev, ...ancestorKeys])))
  }

  const handleClick = useCallback(
    ({ key }) => {
      // findLabel 找不到返回 null，此处回退到 key，绝不静默显示 undefined
      const label = findLabel(key, rawMenuItems) ?? key
      navigate(key)
      addTab({ key, label })
    },
    [addTab, navigate],
  )

  return (
    <Sider width={208} className="app-sider" style={{ background: 'var(--rail)' }}>
      <div className="app-brand">
        <BrandMark />
        <span className="app-brand__name">磁力贴工作台</span>
        <span className="app-brand__sub">v0.1</span>
      </div>

      <Menu
        className="app-sider__menu"
        mode="inline"
        items={styledItems}
        selectedKeys={selectedKeys}
        openKeys={openKeys}
        onOpenChange={setOpenKeys}
        onClick={handleClick}
      />

      <div className="app-sider__foot">
        <SettingOutlined style={{ cursor: 'pointer' }} title="设置（未实现）" />
        <BellOutlined style={{ cursor: 'pointer' }} title="消息（未实现）" />
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-3)' }}>一期 · PC 端</span>
      </div>
    </Sider>
  )
}
