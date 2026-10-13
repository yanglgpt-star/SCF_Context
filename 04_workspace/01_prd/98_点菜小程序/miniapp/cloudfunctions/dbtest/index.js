/** 极简云函数：不查数据库，只返回固定值 */
exports.main = async () => {
  return { status: 'ok', time: Date.now() };
};
