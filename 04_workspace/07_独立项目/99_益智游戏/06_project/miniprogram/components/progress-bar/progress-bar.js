Component({
  properties: {
    percent: {
      type: Number,
      value: 0
    },
    height: {
      type: String,
      value: '24rpx'
    }
  },

  data: {
    displayPercent: 0
  },

  observers: {
    'percent': function (percent) {
      this.setData({ displayPercent: Math.min(percent, 100) })
    }
  }
})
