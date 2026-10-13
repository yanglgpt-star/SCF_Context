// 任务分类
const TASK_CATEGORIES = {
  COLOR_SHAPE: {
    key: 'color_shape',
    label: '颜色形状侦探',
    icon: '/images/icons/color_shape.png',
    emoji: '🎨'
  },
  SORTING: {
    key: 'sorting',
    label: '小小搬运工',
    icon: '/images/icons/sorting.png',
    emoji: '📦'
  },
  SOUND: {
    key: 'sound',
    label: '声音采集家',
    icon: '/images/icons/sound.png',
    emoji: '🔊'
  },
  TREASURE: {
    key: 'treasure',
    label: '藏宝图寻宝',
    icon: '/images/icons/treasure.png',
    emoji: '🗺️'
  }
}

// 任务难度
const DIFFICULTY_LEVELS = [
  { value: 1, label: '非常简单', stars: 1 },
  { value: 2, label: '比较简单', stars: 2 },
  { value: 3, label: '有点挑战', stars: 3 },
  { value: 4, label: '比较困难', stars: 4 },
  { value: 5, label: '超级挑战', stars: 5 }
]

// 验证方式
const VERIFY_TYPES = {
  PHOTO: 'photo',
  AUDIO: 'audio',
  NFC: 'nfc',
  QRCODE: 'qrcode',
  PARENT_CONFIRM: 'parent_confirm'
}

// 任务记录状态
const TASK_LOG_STATUS = {
  PENDING: 'pending',
  REVIEWING: 'reviewing',
  APPROVED: 'approved',
  REJECTED: 'rejected'
}

// 用户角色
const USER_ROLES = {
  CHILD: 'child',
  PARENT: 'parent'
}

// 勋章-成就定义
const BADGES = {
  FIRST_ADVENTURE: {
    id: 'first_adventure',
    name: '初次冒险',
    desc: '完成第一个任务',
    icon: '/images/badges/first_adventure.png'
  },
  LITTLE_DETECTIVE: {
    id: 'little_detective',
    name: '小侦探',
    desc: '完成10个任务',
    icon: '/images/badges/detective.png'
  },
  SUPER_HERO: {
    id: 'super_hero',
    name: '超级英雄',
    desc: '完成50个任务',
    icon: '/images/badges/super_hero.png'
  },
  COLOR_MASTER: {
    id: 'color_master',
    name: '颜色大师',
    desc: '完成5个颜色形状类任务',
    icon: '/images/badges/color_master.png'
  }
}

// 安全宣誓默认文案
const SAFETY_TEXT = `亲爱的小勇士，在开始冒险之前，我们一起记住：
  ❺ 不可以碰插座和电线
  ❹ 不可以碰厨房的热水壶和灶台
  ❸ 不可以碰剪刀、刀具等锋利物品
  ❷ 不可以碰药品和清洁剂
  ❶ 一定要在爸爸妈妈看得见的地方冒险！`

module.exports = {
  TASK_CATEGORIES,
  DIFFICULTY_LEVELS,
  VERIFY_TYPES,
  TASK_LOG_STATUS,
  USER_ROLES,
  BADGES,
  SAFETY_TEXT
}
