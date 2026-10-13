import { createContext, useContext, useReducer } from 'react'

const TabContext = createContext()

const initialState = {
  tabs: [{ key: '/home', label: '首页', closable: false }],
  activeKey: '/home',
}

function tabReducer(state, action) {
  switch (action.type) {
    case 'ADD_TAB':
      if (state.tabs.find(tab => tab.key === action.payload.key)) {
        return { ...state, activeKey: action.payload.key }
      }
      return {
        ...state,
        tabs: [...state.tabs, { ...action.payload, closable: true }],
        activeKey: action.payload.key,
      }
    case 'CLOSE_TAB':
      if (action.payload === '/home') return state
      const newTabs = state.tabs.filter(tab => tab.key !== action.payload)
      const newActiveKey = state.activeKey === action.payload
        ? newTabs[newTabs.length - 1]?.key || '/home'
        : state.activeKey
      return { ...state, tabs: newTabs, activeKey: newActiveKey }
    case 'CLOSE_OTHER':
      return {
        ...state,
        tabs: state.tabs.filter(tab => tab.key === '/home' || tab.key === action.payload),
        activeKey: action.payload,
      }
    case 'CLOSE_LEFT':
      const leftIndex = state.tabs.findIndex(tab => tab.key === action.payload)
      return {
        ...state,
        tabs: state.tabs.filter((_, index) => index >= leftIndex || _.key === '/home'),
        activeKey: action.payload,
      }
    case 'CLOSE_RIGHT':
      const rightIndex = state.tabs.findIndex(tab => tab.key === action.payload)
      return {
        ...state,
        tabs: state.tabs.filter((_, index) => index <= rightIndex || _.key === '/home'),
        activeKey: action.payload,
      }
    case 'CLOSE_ALL':
      return { ...state, tabs: [state.tabs[0]], activeKey: '/home' }
    case 'SET_ACTIVE':
      return { ...state, activeKey: action.payload }
    default:
      return state
  }
}

export function TabProvider({ children }) {
  const [state, dispatch] = useReducer(tabReducer, initialState)

  const addTab = (tab) => dispatch({ type: 'ADD_TAB', payload: tab })
  const closeTab = (key) => dispatch({ type: 'CLOSE_TAB', payload: key })
  const closeOther = (key) => dispatch({ type: 'CLOSE_OTHER', payload: key })
  const closeLeft = (key) => dispatch({ type: 'CLOSE_LEFT', payload: key })
  const closeRight = (key) => dispatch({ type: 'CLOSE_RIGHT', payload: key })
  const closeAll = () => dispatch({ type: 'CLOSE_ALL' })
  const setActive = (key) => dispatch({ type: 'SET_ACTIVE', payload: key })

  return (
    <TabContext.Provider value={{ state, addTab, closeTab, closeOther, closeLeft, closeRight, closeAll, setActive }}>
      {children}
    </TabContext.Provider>
  )
}

export function useTab() {
  const context = useContext(TabContext)
  if (!context) {
    throw new Error('useTab must be used within TabProvider')
  }
  return context
}
