# 家庭大冒险 - O2O任务驱动型益智游戏

微信小程序，面向 3-8 岁儿童的线上发布任务 → 线下执行 → 线上反馈奖励的游戏化学习工具。

## 技术栈

- 微信小程序原生框架
- 微信云开发（数据库、云存储、云函数）
- Node.js 云函数

## 项目结构

```
miniprogram/          # 小程序代码
├── pages/            # 10个页面
│   ├── index/        # 首页（冒险入口）
│   ├── task/         # 任务卡片
│   ├── submit/       # 任务提交
│   ├── review/       # 审核中心（家长端）
│   ├── success/      # 完成庆祝
│   ├── safety/       # 安全宣誓
│   ├── achievement/  # 成就勋章
│   ├── wishes/       # 愿望清单
│   ├── admin/        # 家长管理
│   └── admin-task/   # 任务管理
├── components/       # 3个复用组件
│   ├── star-effect/  # 星星特效
│   ├── character/    # 角色形象
│   └── progress-bar/ # 进度条
├── utils/            # 工具函数
│   ├── util.js       # 通用工具
│   ├── format.js     # 格式化
│   └── constants.js  # 常量定义
└── images/           # 图片资源（需自行准备）

cloudfunctions/       # 6个云函数
├── login/            # 用户登录
├── getDailyTask/     # 每日任务
├── submitTask/       # 任务提交
├── reviewTask/       # 任务审核
├── getStats/         # 统计数据
└── addTask/          # 任务管理
```

## 快速开始

1. 在 `project.config.json` 中填写你的微信小程序 AppID
2. 在 `miniprogram/app.js` 中填写云环境 ID
3. 在微信开发者工具中上传并部署所有云函数
4. 在云数据库中创建 4 个集合：`users`、`tasks`、`task_logs`、`wishes`
5. 在 `tasks` 集合中导入初始任务数据

## 开发阶段

参见 [02-MVP开发路线图.md](../02-MVP开发路线图.md)

- 阶段一（基石版）：跑通任务闭环
- 阶段二（反馈增强）：拍照/录音验证
- 阶段三（激励系统）：勋章/愿望/虚拟树
- 阶段四（进阶玩法）：NFC/扫码/多孩子
