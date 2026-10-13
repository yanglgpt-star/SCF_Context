# Mock 数据规范

## 设计原则

1. 每个列表页对应一个 mock 数据文件，放在 `src/mock/` 目录下
2. 使用工厂函数生成数据，默认生成 100 条
3. 数据字段要贴合业务实际，不要使用 "test1"、"aaa" 等无意义数据
4. ID 使用递增数字或带业务前缀的编号（如 `SO20260401001`）
5. 日期使用合理的时间范围（如近 3 个月内）
6. 金额使用合理的数值范围
7. 状态字段使用枚举值，并配备对应的中文映射

## 数据生成模板

```js
// mock/orderList.js

// 状态枚举
export const ORDER_STATUS = {
  DRAFT: { value: 'draft', label: '草稿', color: 'default' },
  PENDING: { value: 'pending', label: '待审核', color: 'processing' },
  APPROVED: { value: 'approved', label: '已审核', color: 'success' },
  REJECTED: { value: 'rejected', label: '已驳回', color: 'error' },
  COMPLETED: { value: 'completed', label: '已完成', color: 'success' },
  CANCELLED: { value: 'cancelled', label: '已取消', color: 'default' },
};

// 模拟客户名称池
const CUSTOMERS = [
  '华润万家', '沃尔玛', '永辉超市', '大润发', '盒马鲜生',
  '天虹商场', '万达广场', '银泰百货', '苏宁易购', '国美电器',
  '中石化', '中石油', '比亚迪', '格力电器', '美的集团',
];

// 模拟商品名称池
const PRODUCTS = [
  '矿泉水550ml', '纯净水5L', '碳酸饮料330ml', '果汁1L',
  '方便面桶装', '饼干礼盒', '牛奶250ml*12', '酸奶100g*6',
];

// 随机工具函数
const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomDate = (startDays, endDays) => {
  const now = new Date();
  const start = new Date(now.getTime() - startDays * 86400000);
  const end = new Date(now.getTime() - endDays * 86400000);
  const d = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return d.toISOString().slice(0, 10);
};

// 生成订单号
const genOrderNo = (index) => {
  const date = new Date();
  const prefix = 'SO';
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}${dateStr}${String(index + 1).padStart(3, '0')}`;
};

// 生成数据
export const generateOrderList = (count = 100) => {
  const statusValues = Object.values(ORDER_STATUS);
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    orderNo: genOrderNo(i),
    customerName: randomItem(CUSTOMERS),
    productName: randomItem(PRODUCTS),
    quantity: random(10, 500),
    unitPrice: (random(500, 5000) / 100).toFixed(2),
    totalAmount: 0,  // 下面计算
    status: randomItem(statusValues).value,
    createTime: randomDate(90, 0),
    createBy: randomItem(['张三', '李四', '王五', '赵六']),
    remark: '',
  })).map(item => ({
    ...item,
    totalAmount: (item.quantity * parseFloat(item.unitPrice)).toFixed(2),
  }));
};
```

## 分页逻辑

列表页需要实现前端分页，在页面组件中处理：

```js
const [currentPage, setCurrentPage] = useState(1);
const [pageSize, setPageSize] = useState(10);
const [allData] = useState(() => generateOrderList(100));

// 当前页数据
const currentData = useMemo(() => {
  const start = (currentPage - 1) * pageSize;
  return allData.slice(start, start + pageSize);
}, [allData, currentPage, pageSize]);

// 筛选逻辑
const filteredData = useMemo(() => {
  let data = allData;
  if (filters.status) {
    data = data.filter(item => item.status === filters.status);
  }
  if (filters.keyword) {
    data = data.filter(item =>
      item.orderNo.includes(filters.keyword) ||
      item.customerName.includes(filters.keyword)
    );
  }
  return data;
}, [allData, filters]);
```

## 命名约定

| 业务模块 | 文件名 | 导出函数 |
|---------|--------|---------|
| 销售订单 | `orderList.js` | `generateOrderList` |
| 客户管理 | `customerList.js` | `generateCustomerList` |
| 采购单 | `purchaseList.js` | `generatePurchaseList` |
| 供应商 | `supplierList.js` | `generateSupplierList` |
| 库存 | `inventoryList.js` | `generateInventoryList` |
| 入库单 | `inboundList.js` | `generateInboundList` |
| 出库单 | `outboundList.js` | `generateOutboundList` |
