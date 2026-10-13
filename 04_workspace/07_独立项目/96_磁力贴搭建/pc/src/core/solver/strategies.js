/**
 * 降级阶梯的每一级到底放松了什么。
 *
 * 一级一个**纯数据**描述，`solve.js` 照着它配 DLX。之所以不写成「一级一个函数」，
 * 是因为这些级的差别全在参数上，写成函数只会得到六个几乎一样的函数体；
 * 而参数写成数据之后，报告里能直接把「这级放松了什么」原样吐给用户看。
 *
 * 每一级只比上一级多放松**一件事**，这样「降到了 L2」这句话才解释得清：
 *   L0  全填满 · 不出界 · 不超库存
 *   L1  允许 ≤5% 的原子空着       （轮廓的窄缝补不上）
 *   L2  允许 ≤5% 的原子出界       （为了填满，边角压出去一点）
 *   L3  允许超库存，列出要补的片   （库存不够时这是正确的回答，不是「不可拼」）
 *   L4  留白放宽到 10%
 *   L5  放弃，给归因
 */
import { COVERAGE_PASS, FALLBACK_LABEL, FALLBACK_NOTE, GAP_BUDGET, OVERFLOW_BUDGET, OVERFLOW_MAX } from '../config.js'

/** 库存不再是硬约束的级别 —— 到了 L3 就允许超量，代价是报告里要列补料清单 */
const STOCK_FREE = new Set(['L3', 'L4', 'L5'])

/**
 * 超库存时，每种形状能多用几片 —— 从小到大试，**第一个能拼出来的额度
 * 就是最小的补料量**。
 *
 * 为什么不直接「库存在 L3 不再限制」：那样求解器会贪大地拿长方形凑体积
 * （8 个原子一片，片数最少），最后报出「需要补 24 片长方形」这种答案 ——
 * 而正确答案是「再补 8 片正方形 + 8 片长方形」。用户要的是**最少补多少**，
 * 不是随便一个能拼的方案。
 *
 * 额度是「每种形状各自可以多用几片」，不是总额：分到每种形状上算不准，
 * 但报出来的 shortfall 是按实际用量算的，所以最终数字仍然准。
 * 真正的「最少究竟是多少」要精确求解，一期不做 —— 这版给的是上界附近的好答案。
 */
const EXTRA_STEPS = [0, 1, 2, 4, 8, 16, 32, 64]

export function levelSpec(level) {
  const stockLimited = !STOCK_FREE.has(level)
  return {
    level,
    label: FALLBACK_LABEL[level],
    note: FALLBACK_NOTE[level],

    /** 允许多大比例的目标原子空着 */
    gapBudget: GAP_BUDGET[level],
    /** 允许多大比例的原子越出轮廓（这块空间在 allow 掩码里放开多少） */
    overflowBudget: OVERFLOW_BUDGET[level],
    /** 用量是否受库存限制 */
    stockLimited,
    /** 每种形状的额外额度阶梯；受库存限制的级别只有 0 这一档 */
    extraSteps: stockLimited ? [0] : EXTRA_STEPS,

    /**
     * 过了这两道才算「这级的结果可用」。
     *
     * L4 的门槛是 0.85 而不是 0.90：**斜边轮廓的覆盖率有几何上限**。
     * 2:1 坡度的边切过的象限补不满，覆盖率天然落在 0.86–0.92 这一段，
     * 而这一段恰好是「能拼出大致形状、边缘有锯齿」—— 正是 L4 想表达的意思。
     * 门槛卡在 0.90 会让这些轮廓直接掉到「不可拼」，那是个过于绝对的判断。
     */
    coverageFloor: level === 'L4' ? 0.85 : level === 'L5' ? 0 : COVERAGE_PASS,
    overflowCeiling: level === 'L0' || level === 'L1' ? 0 : OVERFLOW_MAX,
  }
}

/**
 * 一个解在这级算不算通过。
 * 注意覆盖率的分母包含 partial 原子的权重，所以「full 原子全盖上」时覆盖率
 * 天然接近 1；这两道闸门拦住的是别的情况（比如为了填满而大范围出界）。
 */
export function acceptSolution(sol, spec) {
  if (!sol) return false
  if (sol.coverage + 1e-9 < spec.coverageFloor) return false
  if (sol.overflow - 1e-9 > spec.overflowCeiling) return false
  if (spec.stockLimited && sol.overStock) return false
  return true
}

/**
 * 从整条阶梯反推「为什么拼不满」，给用户看的那一句话。
 *
 * 按**能改的程度**从具体到笼统排：先看有没有硬缺口（改轮廓就能救），
 * 再看是不是斜边太斜（换草图或接受锯齿），最后才说笼统的话。
 * 只说「不可拼」等于没说 —— 用户既不知道差多少，也不知道该改哪儿。
 */
export function explainFailure(summary) {
  const ladder = summary.ladder ?? []
  const bumped = ladder.filter((l) => l.reason)

  const gaps = bumpNoCandidate(ladder)
  if (gaps > 0) {
    return `轮廓边上有 ${gaps} 处比最小的磁力片还窄，放不进任何形状 —— 把这几处抹平或加宽就能拼`
  }

  const best = summary.bestCoverage
  if (typeof best === 'number' && best > 0) {
    return `最好的方案只盖住轮廓的 ${Math.round(best * 100)}%。斜得太缓的边（不是 45° 或直角）切出来的碎片补不满，换张轮廓更方正的草图会好很多`
  }

  const shortfall = bumped.find((l) => l.extra > 0)
  if (shortfall) {
    return `现有库存怎么排都盖不住这个轮廓，需要补料`
  }

  return '轮廓的形状用整块的直角系列磁力片围不出来，建议简化轮廓或换一张草图'
}

function bumpNoCandidate(ladder) {
  let worst = 0
  for (const l of ladder) {
    if (typeof l.noCandidateAtoms === 'number' && l.noCandidateAtoms > worst) worst = l.noCandidateAtoms
  }
  return worst
}
