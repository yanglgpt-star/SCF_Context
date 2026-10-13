const app = getApp()

Page({
  data: {
    loggedIn: false,
    password: '',
    role: '',
    children: [],
    childName: '',
    showAddChild: false,
    activeChildIndex: -1,
    stats: {
      totalTasks: 0,
      pendingReview: 0,
      todayCompleted: 0
    }
  },

  onShow() {
    const logged = wx.getStorageSync('admin_logged')
    if (logged) {
      this.setData({ loggedIn: true })
      this.loadChildren()
      this.loadStats()
    }
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value })
  },

  async login() {
    if (this.data.password === '1234') {
      this.setData({ loggedIn: true })
      wx.setStorageSync('admin_logged', true)
      await this.loadChildren()
      this.loadStats()
    } else {
      wx.showToast({ title: '密码错误', icon: 'none' })
    }
  },

  async loadChildren() {
    try {
      const res = await wx.cloud.callFunction({ name: 'login' })
      const role = res.result.role || ''
      const children = res.result.children || []
      // 如果不是家长但已经登录，把当前用户作为单个孩子
      if (role !== 'parent') {
        this.setData({ role, children: [] })
      } else {
        this.setData({ role, children })
      }
      app.globalData.children = children
    } catch (err) {
      console.error('加载孩子列表失败', err)
    }
  },

  toggleAddChild() {
    this.setData({
      showAddChild: !this.data.showAddChild,
      childName: ''
    })
  },

  onChildNameInput(e) {
    this.setData({ childName: e.detail.value })
  },

  async addChild() {
    const name = this.data.childName.trim()
    if (!name) {
      wx.showToast({ title: '请输入孩子姓名', icon: 'none' })
      return
    }
    if (name.length > 20) {
      wx.showToast({ title: '姓名不超过20个字', icon: 'none' })
      return
    }
    wx.showLoading({ title: '添加中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'addChild',
        data: { childName: name }
      })
      if (res.result.success) {
        wx.showToast({ title: '添加成功！', icon: 'success' })
        this.setData({ showAddChild: false, childName: '' })
        await this.loadChildren()
      } else {
        wx.showToast({ title: res.result.message || '添加失败', icon: 'none' })
      }
    } catch (err) {
      console.error('添加孩子失败', err)
      wx.showToast({ title: '添加失败，请重试', icon: 'none' })
    }
    wx.hideLoading()
  },

  selectChild(e) {
    const { index } = e.currentTarget.dataset
    const child = this.data.children[index]
    if (!child) return
    app.globalData.activeChild = child.openId
    this.setData({ activeChildIndex: index })
    wx.showToast({ title: `已切换到 ${child.nickName}`, icon: 'success' })
  },

  async loadStats() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getStats',
        data: { type: 'admin' }
      })
      this.setData({ stats: res.result || this.data.stats })
    } catch (err) {
      console.error('加载统计数据失败', err)
    }
  },

  goReview() {
    wx.navigateTo({ url: '/pages/review/review' })
  },

  goTaskManage() {
    wx.navigateTo({ url: '/pages/admin-task/admin-task' })
  },

  goReport() {
    wx.navigateTo({ url: '/pages/report/report' })
  },

  logout() {
    wx.removeStorageSync('admin_logged')
    app.globalData.activeChild = null
    this.setData({
      loggedIn: false,
      password: '',
      children: [],
      activeChildIndex: -1
    })
  }
})
