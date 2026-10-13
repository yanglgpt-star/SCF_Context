/**
 * 云函数：上传图片到云存储并更新数据库
 * 接收 base64 编码的图片数据，上传到云存储，返回 fileID
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { cloudPath, base64 } = event;
  if (!cloudPath || !base64) {
    return { code: -1, message: '缺少 cloudPath 或 base64' };
  }

  try {
    const buffer = Buffer.from(base64, 'base64');
    const result = await cloud.uploadFile({
      cloudPath: `dishes/${cloudPath}`,
      fileContent: buffer,
    });

    return {
      code: 0,
      fileID: result.fileID,
    };
  } catch (err) {
    console.error('上传图片失败', err);
    return { code: -1, message: err.message };
  }
};
