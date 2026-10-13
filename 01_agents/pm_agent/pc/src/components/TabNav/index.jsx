import { useNavigate, useLocation } from 'react-router-dom'
import { Tabs, Dropdown } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import { useTab } from '../../stores/tabStore'
import { menuItems } from '../../router'

function findLabel(key, items) {
  for (const item of items) {
    if (item.key === key) return item.label
    if (item.children) {
      const found = findLabel(key, item.children)
      if (found) return found
    }
  }
  return key
}

export default function TabNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const { state, setActive, closeTab, closeOther, closeLeft, closeRight, closeAll } = useTab()

  const items = state.tabs.map(tab => ({
    key: tab.key,
    label: (
      <span
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {tab.label}
        {tab.closable && <CloseOutlined style={{ fontSize: 10 }} />}
      </span>
    ),
  }))

  const onTabClick = (key) => {
    setActive(key)
    navigate(key)
  }

  const onTabClose = (key, e) => {
    e.stopPropagation()
    closeTab(key)
    const remainingTabs = state.tabs.filter(t => t.key !== key)
    if (remainingTabs.length > 0) {
      const activeTab = remainingTabs[remainingTabs.length - 1]
      navigate(activeTab.key)
    }
  }

  const renderContextMenu = (key) => ({
    items: [
      { key: 'closeAll', label: '关闭所有', onClick: () => closeAll() },
      { key: 'closeOther', label: '关闭其他', onClick: () => closeOther(key) },
      { key: 'closeLeft', label: '关闭左侧', onClick: () => closeLeft(key) },
      { key: 'closeRight', label: '关闭右侧', onClick: () => closeRight(key) },
    ],
  })

  return (
    <div
      style={{
        background: '#fff',
        padding: '8px 16px 0',
        borderBottom: '1px solid #f0f0f0',
      }}
    >
      <Tabs
        activeKey={state.activeKey}
        onChange={onTabClick}
        items={items}
        hideAdd
        size="small"
        tabBarStyle={{ marginBottom: 0 }}
        renderTabBar={(tabBarProps, DefaultTabBar) => (
          <DefaultTabBar {...tabBarProps}>
            {(node) => {
              const key = node.key
              const isActive = state.activeKey === key
              return (
                <Dropdown
                  menu={renderContextMenu(key)}
                  trigger={['contextMenu']}
                >
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '4px 12px',
                      marginRight: 4,
                      cursor: 'pointer',
                      background: isActive ? '#fff' : 'transparent',
                      border: isActive ? '1px solid #f0f0f0' : '1px solid transparent',
                      borderBottom: isActive ? 'none' : '1px solid transparent',
                      borderRadius: '4px 4px 0 0',
                      position: 'relative',
                      top: 1,
                    }}
                    onMouseEnter={(e) => {
                      if (state.tabs.find(t => t.key === key)?.closable) {
                        const closeBtn = e.currentTarget.querySelector('.close-btn')
                        if (closeBtn) closeBtn.style.display = 'inline'
                      }
                    }}
                    onMouseLeave={(e) => {
                      const closeBtn = e.currentTarget.querySelector('.close-btn')
                      if (closeBtn) closeBtn.style.display = 'none'
                    }}
                    onClick={() => onTabClick(key)}
                  >
                    <span
                      style={{
                        color: isActive ? '#FF6B00' : '#666',
                        fontWeight: isActive ? 500 : 400,
                      }}
                    >
                      {state.tabs.find(t => t.key === key)?.label}
                    </span>
                    {state.tabs.find(t => t.key === key)?.closable && (
                      <CloseOutlined
                        className="close-btn"
                        style={{
                          fontSize: 10,
                          marginLeft: 8,
                          display: 'none',
                          color: '#999',
                        }}
                        onClick={(e) => onTabClose(key, e)}
                      />
                    )}
                  </div>
                </Dropdown>
              )
            }}
          </DefaultTabBar>
        )}
      />
    </div>
  )
}
