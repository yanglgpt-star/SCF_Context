# PC 端供应链管理后台初始化指南

## 项目定位

本项目用于通过代码构建 PC 端供应链管理后台 demo，所有产出代码放在 `./pc` 目录下。这是一个前端 demo 项目，使用模拟数据，重点在于界面还原和交互体验。

---

## 技术栈

| 技术 | 用途 | 说明 |
|------|------|------|
| React 18 + Hooks | 视图层 | 函数组件 + Hooks，不使用 class 组件 |
| React Router 6 | 路由 | 使用 `createBrowserRouter`，支持嵌套路由 |
| Ant Design 5 | UI 组件库 | 企业后台标配，直接使用 antd 组件 |
| Vite | 构建工具 | 开发服务器 + 构建，配合 `@vitejs/plugin-react` |
| dayjs | 日期处理 | antd 5 默认日期库 |

---

## 初始化项目

如果 `./pc` 目录下还没有项目，按以下步骤初始化：

### 1. 创建项目

```bash
cd ./pc
npm create vite@latest . -- --template react
```

### 2. 安装依赖

```bash
npm install antd @ant-design/icons react-router-dom dayjs
```

### 3. 启动开发服务器

```bash
npm run dev
```

---

## 目录结构

```
pc/
├── public/
├── src/
│   ├── main.jsx            # 入口文件
│   ├── App.jsx             # 根组件，包含整体布局
│   ├── router/
│   │   └── index.jsx       # 路由配置 + 菜单配置
│   ├── layouts/
│   │   └── MainLayout.jsx  # 主布局（菜单 + 导航 + 内容）
│   ├── components/
│   │   ├── SideMenu/       # 左侧菜单组件
│   │   └── TabNav/         # 导航标签组件
│   ├── pages/
│   │   ├── Home/           # 首页
│   │   └── [模块名]/       # 按业务模块组织页面
│   │       └── index.jsx   # 页面入口
│   ├── mock/               # 模拟数据
│   │   └── [模块名].js
│   ├── stores/             # 状态管理（标签页状态等）
│   │   └── tabStore.jsx
│   └── styles/             # 全局样式
│       └── global.css
├── index.html
├── vite.config.js
└── package.json
```

---

## 状态管理

标签页状态使用 React Context + useReducer 管理，不引入额外状态管理库。核心状态：

```js
{
  tabs: [{ key: '/home', label: '首页', closable: false }, ...],
  activeKey: '/home'
}
```
