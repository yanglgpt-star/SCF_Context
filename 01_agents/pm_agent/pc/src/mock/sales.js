import dayjs from 'dayjs'

const customers = ['张三', '李四', '王五', '赵六', '钱七', '孙八', '周九', '吴十', '郑十一', '冯十二']
const sellers = ['小明', '小红', '小刚', '小丽', '小华']
const statuses = ['待审核', '已审核', '已完成', '已取消']

function generateOrders(count = 100) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    orderNo: `SO202604${String(i + 1).padStart(4, '0')}`,
    customerName: customers[Math.floor(Math.random() * customers.length)],
    seller: sellers[Math.floor(Math.random() * sellers.length)],
    productCount: Math.floor(Math.random() * 50) + 1,
    amount: Math.floor(Math.random() * 100000) + 1000,
    status: statuses[Math.floor(Math.random() * statuses.length)],
    orderDate: dayjs().subtract(Math.floor(Math.random() * 30), 'day').format('YYYY-MM-DD HH:mm'),
  }))
}

export const orderList = generateOrders(100)

export function getOrderById(id) {
  return orderList.find(order => order.id === id)
}
