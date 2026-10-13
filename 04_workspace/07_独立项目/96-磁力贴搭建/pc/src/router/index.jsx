import { DatabaseOutlined, ExperimentOutlined, FolderOpenOutlined } from '@ant-design/icons'

import Home from '../pages/Home'
import Shapes from '../pages/Shapes'
import Measure from '../pages/Measure'
import Draft from '../pages/Draft'
import Solve from '../pages/Solve'
import Build from '../pages/Build'
import Steps from '../pages/Steps'
import Library from '../pages/Library'

/**
 * 菜单配置
 *
 * 三级菜单的 key **就是**路由 path（含前导斜杠），
 * 这是菜单 / 路由 / 标签页三者联动的唯一约定，改动时三处必须同步。
 */
export const menuItems = [
  {
    key: 'base',
    label: '基础数据',
    icon: <DatabaseOutlined />,
    children: [
      {
        key: 'base-parts',
        label: '零件体系',
        children: [
          { key: '/base/shapes', label: '形状库' },
          { key: '/base/measure', label: '实测录入' },
        ],
      },
    ],
  },
  {
    key: 'produce',
    label: '内容生产',
    icon: <ExperimentOutlined />,
    children: [
      {
        key: 'produce-draft',
        label: '草稿与求解',
        children: [
          { key: '/produce/draft', label: '草稿生成' },
          { key: '/produce/solve', label: '模拟求解' },
        ],
      },
      {
        key: 'produce-build',
        label: '搭建与拆解',
        children: [
          { key: '/produce/build', label: '实物搭建' },
          { key: '/produce/steps', label: '步骤拆解' },
        ],
      },
    ],
  },
  {
    key: 'asset',
    label: '资产中心',
    icon: <FolderOpenOutlined />,
    children: [
      {
        key: 'asset-archive',
        label: '成果归档',
        children: [{ key: '/asset/library', label: '资产库' }],
      },
    ],
  },
]

export const routeConfig = {
  '/base/shapes': { label: '形状库', component: Shapes },
  '/base/measure': { label: '实测录入', component: Measure },
  '/produce/draft': { label: '草稿生成', component: Draft },
  '/produce/solve': { label: '模拟求解', component: Solve },
  '/produce/build': { label: '实物搭建', component: Build },
  '/produce/steps': { label: '步骤拆解', component: Steps },
  '/asset/library': { label: '资产库', component: Library },
}

export const HomeComponent = Home

/**
 * 递归查找菜单 label。
 * 找不到必须返回 null —— 返回 key 是 truthy，会让调用方的 `if (found)` 提前返回。
 */
export function findLabel(key, items) {
  for (const item of items) {
    if (item.key === key) return item.label
    if (item.children) {
      const found = findLabel(key, item.children)
      if (found) return found
    }
  }
  return null
}

/** 默认展开的一二级菜单 */
export const defaultOpenKeys = ['base', 'base-parts', 'produce', 'produce-draft', 'produce-build', 'asset', 'asset-archive']
