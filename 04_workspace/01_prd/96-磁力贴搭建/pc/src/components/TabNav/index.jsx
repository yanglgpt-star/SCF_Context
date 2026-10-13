import { useEffect } from 'react'
import { Dropdown, Tabs } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { findLabel, menuItems } from '../../router'
import { HOME_KEY } from '../../lib/constants'
import { useTab } from '../../stores/tabStore'

export default function TabNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const { state, addTab, setActive, closeTab, closeOther, closeLeft, closeRight, closeAll } = useTab()

  const path = location.pathname
  const current = state.tabs.find((tab) => tab.key === path)

  // 直接输地址或刷新进来时，把标签补上，三处（菜单/路由/标签）不会脱节
  useEffect(() => {
    if (current) return
    if (path === '/' || path === HOME_KEY) {
      setActive(HOME_KEY)
      return
    }
    const label = findLabel(path, menuItems)
    if (label) addTab({ key: path, label })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, current])

  const goTo = (key) => {
    setActive(key)
    navigate(key === HOME_KEY ? HOME_KEY : key)
  }

  const handleClose = (key, event) => {
    if (event) event.stopPropagation()
    if (key === HOME_KEY) return
    const remaining = state.tabs.filter((tab) => tab.key !== key)
    closeTab(key)
    // 关掉的是当前标签时，落到最后一个存活标签上——绝不指向已关闭的 key
    if (state.activeKey === key) {
      const fallback = remaining[remaining.length - 1]
      navigate(fallback ? fallback.key : HOME_KEY)
    }
  }

  const contextMenu = (key) => ({
    items: [
      { key: 'closeOther', label: '关闭其他', disabled: key === HOME_KEY, onClick: () => closeOther(key) },
      { key: 'closeLeft', label: '关闭左侧', onClick: () => closeLeft(key) },
      { key: 'closeRight', label: '关闭右侧', onClick: () => closeRight(key) },
      { type: 'divider' },
      { key: 'closeAll', label: '关闭全部', onClick: () => { closeAll(); navigate(HOME_KEY) } },
    ],
  })

  const items = state.tabs.map((tab) => ({ key: tab.key, label: tab.label }))

  const renderTabBar = (tabBarProps, DefaultTabBar) => (
    <DefaultTabBar {...tabBarProps}>
      {(node) => {
        const key = node.key
        const tab = state.tabs.find((t) => t.key === key)
        if (!tab) return null
        const isActive = state.activeKey === key

        return (
          <Dropdown key={key} menu={contextMenu(key)} trigger={['contextMenu']}>
            <div
              className={`app-tab${isActive ? ' is-active' : ''}`}
              onMouseEnter={(e) => {
                const btn = e.currentTarget.querySelector('.app-tab__close')
                if (btn) btn.style.opacity = '1'
              }}
              onMouseLeave={(e) => {
                const btn = e.currentTarget.querySelector('.app-tab__close')
                if (btn) btn.style.opacity = '0'
              }}
              onClick={() => goTo(key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                marginRight: 4,
                cursor: 'pointer',
                borderRadius: '5px 5px 0 0',
                background: isActive ? 'var(--brand-wash)' : 'transparent',
                color: isActive ? 'var(--brand)' : 'var(--ink-2)',
                fontWeight: isActive ? 500 : 400,
              }}
            >
              <span>{tab.label}</span>
              {tab.closable && (
                <CloseOutlined
                  className="app-tab__close"
                  style={{ fontSize: 9, opacity: 0, transition: 'opacity .12s', color: 'inherit' }}
                  onClick={(e) => handleClose(key, e)}
                />
              )}
            </div>
          </Dropdown>
        )
      }}
    </DefaultTabBar>
  )

  return (
    <div className="app-tabnav">
      <Tabs
        size="small"
        activeKey={state.activeKey === '/' ? HOME_KEY : state.activeKey}
        items={items}
        onChange={goTo}
        onEdit={handleClose}
        renderTabBar={renderTabBar}
        hideAdd
        tabBarStyle={{ marginBottom: 0 }}
      />
    </div>
  )
}
