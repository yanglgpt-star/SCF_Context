import { createContext, useContext, useReducer } from 'react'
import { HOME_KEY, HOME_LABEL } from '../lib/constants'

const TabContext = createContext(null)

const initialState = {
  tabs: [{ key: HOME_KEY, label: HOME_LABEL, closable: false }],
  activeKey: HOME_KEY,
}

/** 关掉当前标签之后，activeKey 该落到哪里——永远回退到最后一个存活标签 */
function fallbackKey(tabs) {
  const last = tabs[tabs.length - 1]
  return last ? last.key : HOME_KEY
}

function tabReducer(state, action) {
  const key = action.payload
  switch (action.type) {
    case 'ADD_TAB': {
      const { key: tabKey, label } = action.payload
      if (state.tabs.some((tab) => tab.key === tabKey)) {
        return { ...state, activeKey: tabKey }
      }
      return {
        ...state,
        tabs: [...state.tabs, { key: tabKey, label, closable: true }],
        activeKey: tabKey,
      }
    }

    case 'CLOSE_TAB': {
      // 首页不可关闭
      if (key === HOME_KEY) return state
      const tabs = state.tabs.filter((tab) => tab.key !== key)
      return {
        ...state,
        tabs,
        activeKey: state.activeKey === key ? fallbackKey(tabs) : state.activeKey,
      }
    }

    case 'CLOSE_OTHER': {
      const tabs = state.tabs.filter((tab) => tab.key === HOME_KEY || tab.key === key)
      return { ...state, tabs, activeKey: key }
    }

    case 'CLOSE_LEFT': {
      const index = state.tabs.findIndex((tab) => tab.key === key)
      if (index < 0) return state
      const tabs = state.tabs.filter((tab, i) => i >= index || tab.key === HOME_KEY)
      return { ...state, tabs, activeKey: tabs.some((t) => t.key === state.activeKey) ? state.activeKey : key }
    }

    case 'CLOSE_RIGHT': {
      const index = state.tabs.findIndex((tab) => tab.key === key)
      if (index < 0) return state
      const tabs = state.tabs.filter((tab, i) => i <= index || tab.key === HOME_KEY)
      return { ...state, tabs, activeKey: tabs.some((t) => t.key === state.activeKey) ? state.activeKey : key }
    }

    case 'CLOSE_ALL': {
      const tabs = state.tabs.filter((tab) => tab.key === HOME_KEY)
      return { ...state, tabs, activeKey: HOME_KEY }
    }

    case 'SET_ACTIVE': {
      // 防止 activeKey 指向一个已经不存在的标签
      if (!state.tabs.some((tab) => tab.key === key)) return state
      return { ...state, activeKey: key }
    }

    default:
      return state
  }
}

export function TabProvider({ children }) {
  const [state, dispatch] = useReducer(tabReducer, initialState)

  const value = {
    state,
    addTab: (tab) => dispatch({ type: 'ADD_TAB', payload: tab }),
    closeTab: (key) => dispatch({ type: 'CLOSE_TAB', payload: key }),
    closeOther: (key) => dispatch({ type: 'CLOSE_OTHER', payload: key }),
    closeLeft: (key) => dispatch({ type: 'CLOSE_LEFT', payload: key }),
    closeRight: (key) => dispatch({ type: 'CLOSE_RIGHT', payload: key }),
    closeAll: () => dispatch({ type: 'CLOSE_ALL' }),
    setActive: (key) => dispatch({ type: 'SET_ACTIVE', payload: key }),
  }

  return <TabContext.Provider value={value}>{children}</TabContext.Provider>
}

export function useTab() {
  const context = useContext(TabContext)
  if (!context) throw new Error('useTab 必须在 TabProvider 内部使用')
  return context
}
