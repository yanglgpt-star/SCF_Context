import Home from '../pages/Home'
import OrderList from '../pages/Sales/OrderList'
import ReturnList from '../pages/Sales/ReturnList'
import PurchaseOrder from '../pages/Purchase/Order'
import PurchaseReturn from '../pages/Purchase/Return'
import WarehouseIn from '../pages/Warehouse/In'
import WarehouseOut from '../pages/Warehouse/Out'

export const menuItems = [
  {
    key: 'sales',
    label: '销售中心',
    children: [
      {
        key: 'sales-order',
        label: '商品销售',
        children: [
          { key: '/sales/order', label: '订单列表' },
          { key: '/sales/return', label: '退货单列表' },
        ],
      },
    ],
  },
  {
    key: 'purchase',
    label: '采购中心',
    children: [
      {
        key: 'purchase-order',
        label: '采购管理',
        children: [
          { key: '/purchase/order', label: '采购订单' },
          { key: '/purchase/return', label: '采购退货' },
        ],
      },
    ],
  },
  {
    key: 'warehouse',
    label: '仓储中心',
    children: [
      {
        key: 'warehouse-in',
        label: '入库管理',
        children: [
          { key: '/warehouse/in', label: '入库单' },
          { key: '/warehouse/out', label: '出库单' },
        ],
      },
    ],
  },
]

export const routeConfig = {
  '/home': { label: '首页', component: Home },
  '/sales/order': { label: '订单列表', component: OrderList },
  '/sales/return': { label: '退货单列表', component: ReturnList },
  '/purchase/order': { label: '采购订单', component: PurchaseOrder },
  '/purchase/return': { label: '采购退货', component: PurchaseReturn },
  '/warehouse/in': { label: '入库单', component: WarehouseIn },
  '/warehouse/out': { label: '出库单', component: WarehouseOut },
}
