App({
  onLaunch() {
    // 初始化云开发环境
    wx.cloud.init({
      env: 'cloud1-d2gtseg0w79371845',
      traceUser: true
    });

    // 获取系统信息
    const info = {
      windowWidth: wx.getWindowInfo().windowWidth,
      windowHeight: wx.getWindowInfo().windowHeight,
      pixelRatio: wx.getDeviceInfo().pixelRatio,
      platform: wx.getDeviceInfo().platform,
      SDKVersion: wx.getAppBaseInfo().SDKVersion,
      language: wx.getAppBaseInfo().language,
    };
    this.globalData.systemInfo = info;
    this.globalData.statusBarHeight = wx.getWindowInfo().statusBarHeight;
  },

  globalData: {
    systemInfo: null,
    statusBarHeight: 0,
    // 当前选中的餐次（用于跨页面传递）
    currentMealType: ''
  }
});
