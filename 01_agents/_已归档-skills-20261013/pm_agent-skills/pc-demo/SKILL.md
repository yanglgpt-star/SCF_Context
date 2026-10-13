---
name: pc-demo
description: PC端供应链管理后台构建专家。使用 React + Ant Design + Vite 技术栈构建企业级后台管理系统 demo。当用户提到"PC后台"、"供应链后台"、"后台页面"、"新增页面"、"添加菜单"、"PC端开发"、"后台列表"、"后台详情"、"管理后台"、"新建页面"、"开发页面"、"页面模板"等关键词时，必须使用此 skill。即使用户只是简单提到要做一个后台页面或管理界面，也应该触发此 skill。
---

# PC 端供应链管理后台构建专家

## 项目定位

本 skill 用于通过代码构建 PC 端供应链管理后台 demo，所有产出代码放在 `./pc` 目录下。这是一个前端 demo 项目，使用模拟数据，重点在于界面还原和交互体验。

---

## 技术栈

| 技术 | 用途 |
|------|------|
| React 18 + Hooks | 视图层 |
| React Router 6 | 路由（createBrowserRouter） |
| Ant Design 5 | UI 组件库 |
| Vite | 构建工具 |
| dayjs | 日期处理 |

主题色：**#FF6B00**（橙白主色调）

---

## 目录结构

```
pc/src/
├── main.jsx              # 入口
├── App.jsx               # 根组件
├── router/index.jsx      # 路由 + 菜单配置
├── layouts/MainLayout.jsx
├── components/
│   ├── SideMenu/         # 左侧菜单
│   └── TabNav/           # 导航标签
├── pages/
│   ├── Home/
│   └── [模块名]/index.jsx
├── mock/                  # 模拟数据
└── stores/tabStore.jsx   # 标签页状态
```

---

## 核心规范索引

| 规范 | 文件 |
|------|------|
| 项目初始化 | [references/pc-init.md](./references/pc-init.md) |
| 菜单配置 | [references/menu-config.md](./references/menu-config.md) |
| Mock 数据 | [references/mock-data.md](./references/mock-data.md) |
| 页面结构（布局/菜单/导航） | [references/page-structure.md](./references/page-structure.md) |
| 页面类型（列表/详情/看板） | [references/page-types.md](./references/page-types.md) |
| 代码风格 | [references/code-style.md](./references/code-style.md) |
| 常见问题修复记录 | [references/faq.md](./references/faq.md) |

---

## 开发工作流

新增页面时按以下步骤执行：

1. **确认需求**：页面类型（列表/详情/看板）、所属菜单位置、核心字段
2. **创建文件**：按目录结构创建页面和 mock 文件
3. **注册路由**：App.jsx 中添加 Route，path 必须与菜单 key 一致（含前导斜杠）
4. **注册菜单**：router/index.jsx 的 menuItems 中添加菜单项
5. **创建 Mock 数据**：mock/ 目录下创建模拟数据文件

---

## 验证

启动开发服务器检查页面是否正常渲染：

```bash
cd ./pc && npm run dev
```

---

## 注意事项

- 这是一个 demo 项目，重点在于界面展示和交互体验，不需要真实后端接口
- 所有数据使用 mock 模拟，mock 数据要贴合业务实际
- 不需要登录认证、权限控制等复杂逻辑
- 新增页面时必须同步更新菜单配置和路由配置
- 保持代码简洁，避免过度工程化
