// 角色表情映射（不同状态显示不同 emoji）
const CHARACTER_EMOJI = {
  idle: '🦸',
  happy: '😄',
  thinking: '🤔',
  celebrate: '🎉',
  sleep: '😴',
  exercise: '🏃'
}

Component({
  properties: {
    anim: {
      type: String,
      value: 'idle'
    }
  },

  data: {
    emoji: CHARACTER_EMOJI['idle']
  },

  observers: {
    'anim': function (anim) {
      this.setData({
        emoji: CHARACTER_EMOJI[anim] || '🦸'
      })
    }
  }
})
