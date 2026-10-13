# 菜单配置规范

## 数据结构

菜单配置使用嵌套数组结构，与 antd Menu 的 `items` 属性兼容：

```js
// config/menu.js 或 router/index.jsx 中导出

const menuConfig = [
  {
    key: 'sales',           // 唯一标识，一级菜单
    label: '销售中心',       // 显示文字
    icon: <ShoppingOutlined />,  // antd 图标
    children: [
      {
        key: 'product-sales',    // 二级菜单
        label: '商品销售',
        children: [
          {
            key: '/sales/order/list',     // 三级菜单，key 即路由路径
            label: '订单列表',            // 同时作为标签页文字
          },
          {
            key: '/sales/order/return',
            label: '退货单列表',
          },
        ],
      },
      {
        key: 'sales-report',
        label: '销售报表',
        children: [
          {
            key: '/sales/report/daily',
            label: '日报表',
          },
        ],
      },
    ],
  },
  {
    key: 'purchase',
    label: '采购中心',
    icon: <ShopOutlined />,
    children: [
      // ... 二级、三级菜单
    ],
  },
];
```

## 配置规则

1. **key 命名规则**：
   - 一级菜单：英文单词，如 `sales`、`purchase`、`warehouse`
   - 二级菜单：`一级-描述`，如 `product-sales`、`purchase-order`
   - 三级菜单：**必须是路由路径**，如 `/sales/order/list`，因为点击三级菜单会导航到该路由

2. **label 字段**：
   - 使用简洁中文名称
   - 三级菜单的 label 会作为导航标签页的显示文字，保持一致

3. **icon 字段**：
   - 仅一级菜单需要配置图标
   - 使用 `@ant-design/icons` 提供的图标

4. **路由与菜单联动**：
   - 菜单配置和路由配置保持同步
   - 新增菜单项时同步新增路由
   - 三级菜单的 key 必须与路由 path 完全一致

## 示例：供应链管理菜单

```js
const menuConfig = [
  {
    key: 'sales',
    label: '销售中心',
    icon: <ShoppingCartOutlined />,
    children: [
      {
        key: 'product-sales',
        label: '商品销售',
        children: [
          { key: '/sales/order/list', label: '订单列表' },
          { key: '/sales/contract/list', label: '合同列表' },
          { key: '/sales/customer/list', label: '客户列表' },
        ],
      },
      {
        key: 'sales-return',
        label: '销售退货',
        children: [
          { key: '/sales/return/list', label: '退货单列表' },
        ],
      },
    ],
  },
  {
    key: 'purchase',
    label: '采购中心',
    icon: <ShopOutlined />,
    children: [
      {
        key: 'purchase-order',
        label: '采购订单',
        children: [
          { key: '/purchase/order/list', label: '采购单列表' },
          { key: '/purchase/plan/list', label: '采购计划' },
        ],
      },
      {
        key: 'supplier-mgmt',
        label: '供应商管理',
        children: [
          { key: '/purchase/supplier/list', label: '供应商列表' },
        ],
      },
    ],
  },
  {
    key: 'warehouse',
    label: '仓储中心',
    icon: <InboxOutlined />,
    children: [
      {
        key: 'inventory',
        label: '库存管理',
        children: [
          { key: '/warehouse/inventory/list', label: '库存查询' },
          { key: '/warehouse/inbound/list', label: '入库单列表' },
          { key: '/warehouse/outbound/list', label: '出库单列表' },
        ],
      },
    ],
  },
  {
    key: 'finance',
    label: '财务中心',
    icon: <AccountBookOutlined />,
    children: [
      {
        key: 'receivable',
        label: '应收管理',
        children: [
          { key: '/finance/receivable/list', label: '应收账单' },
        ],
      },
      {
        key: 'payable',
        label: '应付管理',
        children: [
          { key: '/finance/payable/list', label: '应付账单' },
        ],
      },
    ],
  },
];
```
