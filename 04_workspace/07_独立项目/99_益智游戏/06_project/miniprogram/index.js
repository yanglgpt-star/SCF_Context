module.exports = {
  createWebAudio: () => {
    return wx.createWebAudioContext()
  },
  // 腾讯云语音合成配置（留空则使用测试模式，每天5次免费调用）
  getConfig() {
    return {
      AppId: '',
      SecretId: '',
      Secretkey: ''
    }
  }
}
