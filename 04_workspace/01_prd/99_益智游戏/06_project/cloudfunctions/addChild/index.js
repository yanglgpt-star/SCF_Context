const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const users = db.collection('users')

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { childName } = event

  if (!childName || childName.length > 20) {
    return { success: false, message: '请输入有效的孩子姓名' }
  }

  // 查找家长
  const parentRes = await users.where({ openId: OPENID }).get()
  if (parentRes.data.length === 0) {
    return { success: false, message: '家长账号不存在' }
  }
  const parent = parentRes.data[0]

  // 创建孩子记录
  const childId = OPENID + '_child_' + Date.now()
  await users.add({
    data: {
      openId: childId,
      parentOpenId: OPENID,
      role: 'child',
      nickName: childName,
      stars: 0,
      currentStars: 0,
      level: 1,
      treeGrowth: 0,
      badges: [],
      streak: 0,
      lastCompleteDate: '',
      createdAt: db.serverDate()
    }
  })

  return { success: true }
}
