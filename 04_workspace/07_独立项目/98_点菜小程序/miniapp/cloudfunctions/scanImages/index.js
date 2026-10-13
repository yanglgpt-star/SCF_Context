/**
 * 云函数：扫描需要上传图片的菜品
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  try {
    // 先返回一条数据验证数据库连通性
    const test = await db.collection('foods').limit(1).get();
    const total = test.data.length;

    // 再获取全部
    const all = await db.collection('foods').limit(500).get();

    // 过滤有本地图片路径且未上传的
    const dishes = (all.data || []).filter(d => {
      return d.images
        && Array.isArray(d.images)
        && d.images.length > 0
        && typeof d.images[0] === 'string'
        && d.images[0].startsWith('../')
        && !d.images_url;
    }).map(d => ({
      _id: d._id,
      name: d.name,
      category: d.category,
      images: d.images,
    }));

    return {
      code: 0,
      data: dishes,
      total: dishes.length,
      dbTotal: all.data.length,
      testOk: total > 0,
    };
  } catch (err) {
    console.error('scanImages error', err);
    return { code: -1, message: err.message, stack: err.stack };
  }
};
