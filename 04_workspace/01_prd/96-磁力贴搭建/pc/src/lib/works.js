/**
 * `library/works/` 的读取。Build / Steps / Library 三页共用 —— 它们要的是同一个
 * 「磁盘上有哪些作品」，各写一份的话，三页对「什么算一个作品」的判断迟早会漂。
 *
 * 按页取数，**不加 works store**。`libraryStore` 装的是形状与库存：小、唯一、
 * 各自只被一个页面编辑。作品是一个会增长的列表，而且会被 Build 和 Steps **写**——
 * 加 store 就得在每次保存后做失效通知，天真版本会在重解之后给列表页端出过期统计。
 * 一个需要失效协议却没有失效协议的 store，比对着十几个小 JSON 做 Promise.all 更糟。
 * 等真有第二个页面要求「保存完列表立刻更新」时再加。
 */
import { fsClient } from './fsClient'

/**
 * 每个作品目录读一次 `work.json`。N+1 次读，但 N 是这个人的作品数（几十），
 * 不是请求量 —— 加批量接口是在解决一个不存在的问题。
 *
 * **缺 `work.json` 或读坏的目录不静默丢掉**，而是带着 `incomplete` 与原因照样返回。
 * 丢掉的话磁盘上的垃圾就永远看不见了，而那正是最该被看见的东西。M8 清那 15 个
 * 测试残留靠的就是这份名单。
 */
export async function listWorks() {
  let entries = []
  try {
    entries = await fsClient.list('works')
  } catch (err) {
    throw new Error(`读不到 works/ 目录：${err.message}`)
  }

  const dirs = entries.filter((e) => e.dir)
  return Promise.all(
    dirs.map(async (d) => {
      try {
        const { data, missing, mtime } = await fsClient.read(`works/${d.name}/work.json`)
        if (missing || !data) {
          return { id: d.name, incomplete: true, reason: '这个目录里没有 work.json', mtime: null }
        }
        // `mtime` 就是 work.json 的写入时间 = 这份作品最后一次保存。资产库拿它排序、
        // 显示「更新于」。不完整的行为 null —— 没有 work.json 就没有可说的保存时间。
        return { ...data, id: d.name, incomplete: false, mtime }
      } catch (err) {
        return { id: d.name, incomplete: true, reason: `work.json 读不出来：${err.message}`, mtime: null }
      }
    }),
  )
}

/**
 * 单独取一份。`{ work, missing, mtime }` —— 调用方要能区分「没有」和「读坏了」，
 * 而资产库还要拿 `mtime` 显示「最后一次保存」。
 */
export async function loadWork(id) {
  const { data, missing, mtime } = await fsClient.read(`works/${id}/work.json`)
  return { work: data, missing, mtime }
}

/** 这个作品目录里现在有哪些文件。给「只给确实存在的文件出下载链接」用 */
export async function listWorkFiles(id) {
  try {
    return await fsClient.list(`works/${id}`)
  } catch {
    return []
  }
}

/**
 * 下拉里显示的一行。`incomplete` 的条目也要能选 —— 选进去以后页面会说明
 * 「这份没有 work.json」，比在下拉里凭空消失好。
 */
export function workLabel(w) {
  if (w.incomplete) return `${w.id}（不完整）`
  const title = w.meta?.title ?? '未命名'
  return `${w.id}｜${title}${w.solution?.aiMode === 'mock' ? '〔mock〕' : ''}`
}
