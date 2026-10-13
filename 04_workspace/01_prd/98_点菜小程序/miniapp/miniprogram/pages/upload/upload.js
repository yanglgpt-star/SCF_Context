/**
 * 图片上传工具页
 */
Page({
  data: {
    stats: { total: 0, success: 0, failed: 0 },
    isUploading: false,
    progressPercent: 0,
    progressText: '',
    logs: [],
    queue: [],
    debugDump: '',
  },

  onLoad() {
    this.testDatabase();
  },

  /** 直接用 _id 查询单条记录 */
  async testDatabase() {
    this.addLog('info', '测试 _id 查询...');
    const db = wx.cloud.database();

    try {
      // 用 doc(_id) 查询——最快的查询方式
      const res = await db.collection('foods').doc('7d17c2c66a18ef7e0129aeb8158b5357').get();
      const dish = res.data;
      if (dish) {
        this.addLog('info', `✅ 查询成功！菜名: ${dish.name}`);
        this.addLog('info', `包含 images 字段: ${JSON.stringify(dish.images)}`);
        this.addLog('info', `包含 images_url 字段: ${JSON.stringify(dish.images_url)}`);
      } else {
        this.addLog('error', '查询返回无数据');
      }
    } catch (err) {
      this.addLog('error', `_id 查询也超时: ${err.message}`);
      this.addLog('warn', '这是云环境连接问题，非代码问题');
    }
  },

  /** 查看第一条菜的完整字段，诊断数据格式 */
  async debugFirstDish() {
    this.addLog('info', '诊断模式：查看数据库中的数据结构...');
    const db = wx.cloud.database();

    try {
      const res = await db.collection('foods').where({ category: 'meat_dish' }).limit(1).get();
      if (res.data.length === 0) {
        this.addLog('error', '数据库中没有数据');
        return;
      }
      const dish = res.data[0];
      this.addLog('info', `菜名: ${dish.name}`);

      // 输出所有字段名
      const keys = Object.keys(dish);
      this.addLog('info', `字段数: ${keys.length}`);
      this.addLog('info', `所有字段: ${keys.join(', ')}`);

      // 逐一输出每个字段的值
      for (const key of keys) {
        const val = dish[key];
        const type = Array.isArray(val) ? 'array' : typeof val;
        let str;
        if (type === 'array') str = JSON.stringify(val).slice(0, 200);
        else if (type === 'string') str = `"${val.slice(0, 100)}"`;
        else str = String(val);
        this.addLog('info', `  ${key} (${type}): ${str}`);
      }
    } catch (err) {
      this.addLog('error', `查询失败: ${err.message}`);
    }
  },

  /** 扫描需要上传图片的菜品 */
  async scanDishes() {
    this.addLog('info', '正在按分类逐批扫描...');
    const db = wx.cloud.database();
    const CATEGORIES = ['meat_dish', 'vegetable_dish', 'aquatic', 'staple', 'soup', 'breakfast', 'dessert', 'drink', 'condiment', 'semi-finished'];
    const needUpload = [];

    for (const cat of CATEGORIES) {
      try {
        const res = await db.collection('foods').where({ category: cat }).limit(200).get();
        const list = res.data || [];

        const matches = list.filter(d => {
          return d.images
            && Array.isArray(d.images)
            && d.images.length > 0
            && typeof d.images[0] === 'string'
            && d.images[0].indexOf('cloud://') !== 0
            && !d.images_url;
        });

        needUpload.push(...matches);
        this.addLog('info', `  ${cat}: ${list.length} 道菜，${matches.length} 个有图片`);
      } catch (err) {
        this.addLog('error', `  ${cat}: 查询失败 ${err.message}`);
      }
    }

    if (needUpload.length === 0) {
      this.addLog('warn', '没有需要上传图片的菜品');
      this.setData({ 'stats.total': 0 });
      return;
    }

    this.setData({
      queue: needUpload,
      'stats.total': needUpload.length,
    });
    this.addLog('info', `总计找到 ${needUpload.length} 道菜需要上传`);
  },

  /** 开始批量上传 */
  async startUpload() {
    if (this.data.isUploading || this.data.queue.length === 0) return;

    this.setData({ isUploading: true });
    const queue = [...this.data.queue];
    const fs = wx.getFileSystemManager();

    for (let i = 0; i < queue.length; i++) {
      const dish = queue[i];
      const localPath = dish.images && dish.images[0];
      if (!localPath) continue;

      const localFileName = localPath.replace(/^\.\.\//, 'images/');

      try {
        const base64 = fs.readFileSync(localFileName, 'base64');
        const fileName = localPath.split('/').pop();
        const cloudPath = `${dish.category}/${dish._id}/${fileName}`;
        const res = await wx.cloud.callFunction({
          name: 'imageUploader',
          data: { cloudPath, base64 },
        });

        if (res.result && res.result.code === 0) {
          const fileID = res.result.fileID;
          const db2 = wx.cloud.database();
          await db2.collection('foods').doc(dish._id).update({
            data: { images_url: fileID, images: [fileID] }
          });
          this.setData({ 'stats.success': this.data.stats.success + 1 });
          this.addLog('success', `[${i+1}/${queue.length}] ${dish.name} ✓`);
        } else {
          throw new Error(res.result?.message || '上传失败');
        }
      } catch (err) {
        this.setData({ 'stats.failed': this.data.stats.failed + 1 });
        this.addLog('error', `[${i+1}/${queue.length}] ${dish.name} ✗ ${err.message}`);
      }

      const percent = Math.round(((i + 1) / queue.length) * 100);
      this.setData({
        progressPercent: percent,
        progressText: `${i + 1} / ${queue.length} (${percent}%)`,
      });
    }

    this.setData({ isUploading: false });
    this.addLog('info', `上传完成！成功 ${this.data.stats.success}，失败 ${this.data.stats.failed}`);
  },

  addLog(type, msg) {
    const logs = [...this.data.logs, { type, msg }];
    this.setData({ logs });
  },

  clearStorage() {
    wx.showModal({
      title: '确认清除',
      content: '将清除所有已上传的云存储图片',
      success: (res) => {
        if (!res.confirm) return;
        this.addLog('warn', '清除功能请在云存储控制台手动操作');
      }
    });
  },

  onShareAppMessage() {
    return { title: '图片上传工具' };
  },
});
