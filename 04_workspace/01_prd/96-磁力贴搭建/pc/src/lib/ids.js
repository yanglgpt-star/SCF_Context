/**
 * 作品 id 的生成规则。Draft（生成新作品）与 Build（另存为新作品）都要用，
 * 所以从页面里提出来 —— 两份各写一遍的结果是两边格式迟早不一样，
 * 而 `works/<id>/` 这个目录名是磁盘上的事实，格式一漂就有作品读不出来。
 */

/**
 * `W-20260917-183005`。
 *
 * 带时分秒而不是只带日期：这个工作台一天会产出十几条内容，只到日的 id
 * 撞车撞得毫不意外，而撞车的表现是**默默覆盖上一件作品**。
 *
 * 只允许 `[A-Za-z0-9_-]` —— 服务端 `resolveSafe` 的白名单正则认这个形状，
 * 多一个字符作品就写不进 library/。
 */
export function newWorkId(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  const d = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`
  return `W-${d}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
}
