App({
  onLaunch() {
    // 初始化云开发环境
    wx.cloud.init({
      env: 'cloud1-4gk9uga539a7186b',
      traceUser: true
    })

    // 获取系统信息
    const systemInfo = {
      ...wx.getSystemSetting(),
      ...wx.getAppBaseInfo()
    }
    this.globalData.systemInfo = systemInfo
  },

  globalData: {
    systemInfo: null,
    // 当前用户信息，login 后填充
    userInfo: null,
    // 角色: child | parent
    userRole: null,
    // 孩子列表（家长账号下关联的孩子）
    children: [],
    // 当前选中的孩子 openId（家长替孩子操作时使用）
    activeChild: null
  }
})
