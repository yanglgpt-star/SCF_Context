const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const users = db.collection('users')

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()

  // 查找是否已有用户
  let user = await users.where({ openId: OPENID }).get()

  if (user.data.length === 0) {
    // 新用户，默认创建为孩子角色
    await users.add({
      data: {
        openId: OPENID,
        role: 'child',
        nickName: '小勇士',
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
    return { isNew: true, role: 'child', children: [] }
  }

  const currentUser = user.data[0]

  // 如果是家长，查询关联的孩子
  let children = []
  if (currentUser.role === 'parent') {
    const childRes = await users.where({ parentOpenId: OPENID }).get()
    children = childRes.data.map(c => ({
      openId: c.openId,
      nickName: c.nickName,
      stars: c.stars || 0,
      treeGrowth: c.treeGrowth || 0
    }))
  }

  return {
    isNew: false,
    role: currentUser.role,
    userInfo: currentUser,
    children
  }
}
