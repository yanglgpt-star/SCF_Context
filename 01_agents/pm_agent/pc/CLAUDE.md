# PC 端供应链管理后台

## 项目概述

基于 React + Ant Design + Vite 的 PC 端供应链管理后台 Demo，重点在于界面展示和交互体验，所有数据使用 Mock 模拟。

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18/19 | 视图层 |
| React Router | 6/7 | 路由管理 |
| Ant Design | 5/6 | UI 组件库 |
| Vite | 8 | 构建工具 |
| dayjs | 1.x | 日期处理 |

## 目录结构

```
pc/
├── src/
│   ├── main.jsx              # 入口文件
│   ├── App.jsx              # 根组件，包含所有路由配置
│   ├── router/
│   │   └── index.jsx        # 路由配置 + 菜单配置（menuItems）
│   ├── layouts/
│   │   └── MainLayout.jsx   # 主布局（固定高度 100vh）
│   ├── components/
│   │   ├── SideMenu/        # 左侧菜单组件
│   │   │   └── index.jsx    # 包含 findLabel 递归函数
│   │   └── TabNav/          # 顶部标签导航组件
│   │       └── index.jsx
│   ├── pages/
│   │   ├── Home/            # 首页
│   │   ├── Sales/           # 销售模块
│   │   │   ├── OrderList/   # 订单列表
│   │   │   └── ReturnList/  # 退货单列表
│   │   ├── Purchase/        # 采购模块
│   │   │   ├── Order/       # 采购订单
│   │   │   └── Return/      # 采购退货
│   │   └── Warehouse/       # 仓储模块
│   │       ├── In/          # 入库单
│   │       └── Out/         # 出库单
│   ├── stores/
│   │   └── tabStore.jsx     # 标签页状态管理
│   ├── styles/
│   │   └── global.css       # 全局样式
│   └── mock/
│       └── sales.js         # 销售模块模拟数据
├── index.html
├── vite.config.js
└── package.json
```

## 启动命令

```bash
cd pc
npm install     # 首次运行或添加依赖后执行
npm run dev     # 启动开发服务器
```

## UI 风格

- **主题色**：橙色 #FF6B00
- **风格**：简约企业风，橙白主色调
- **按钮**：主操作按钮使用主题色背景（`ant-btn-primary`）
- **选中效果**：一二级菜单选中显示橙色

## 布局规范

- **整体**：固定高度 `height: 100vh; overflow: hidden`
- **菜单**：固定不滚动，高度 calc(100vh - 116px)
- **导航栏**：固定不滚动
- **内容区**：flex 布局，内部滚动
- **分页**：固定在页面底部，不随列表滚动
- **列表 Table**：表头固定，内容区域滚动 `scroll={{ x, y: 'calc(100vh - 300px)' }}`

## 菜单结构

```
├── 销售中心
│   └── 商品销售
│       ├── 订单列表 (/sales/order)
│       └── 退货单列表 (/sales/return)
├── 采购中心
│   └── 采购管理
│       ├── 采购订单 (/purchase/order)
│       └── 采购退货 (/purchase/return)
└── 仓储中心
    └── 入库管理
        ├── 入库单 (/warehouse/in)
        └── 出库单 (/warehouse/out)
```

## 开发规范

### 新增页面

1. 在 `pages/` 下创建模块目录和页面文件
2. 在 `App.jsx` 添加 Route，**path 必须与菜单 key 一致（带前导斜杠）**
3. 在 `router/index.jsx` 的 `menuItems` 添加菜单项
4. 在 `mock/` 下创建模拟数据文件（列表页需要）

### 菜单与标签联动

- 点击菜单时调用 `addTab({ key, label })` 添加标签
- `findLabel` 函数递归查找菜单 label，找不到返回 `null`
- 标签名、菜单名、页面标题三者必须一致

### 分页规范

- 默认每页 20 条
- 可选 10/20/50 条
- 模拟数据 100 条

## Mock 数据规范

- 使用工厂函数生成 100 条数据
- 字段贴合业务实际
- 导出列表数据和详情查询函数

## 注意事项

- Demo 项目，不需要真实后端接口
- 不需要登录认证、权限控制
- 保持代码简洁，避免过度工程化
