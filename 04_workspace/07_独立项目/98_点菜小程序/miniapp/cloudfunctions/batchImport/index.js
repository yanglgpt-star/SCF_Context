/**
 * 云函数：批量导入菜品数据
 * 部署方式：在 cloudfunctions/ 目录右键 → 新建云函数 → batchImport
 * 将本代码粘贴到 index.js
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { data } = event;
  if (!data || !Array.isArray(data)) {
    return { code: -1, message: '数据格式错误，需要数组' };
  }

  let success = 0, fail = 0;
  for (const item of data) {
    // 去掉 _id 和 _source 字段（_source 是本地路径，不需要入库）
    const { _id, _source, ...rest } = item;
    try {
      await db.collection('foods').add({ data: rest });
      success++;
    } catch (err) {
      console.error('导入失败:', item.name, err);
      fail++;
    }
  }

  return { code: 0, success, fail, total: data.length };
};
