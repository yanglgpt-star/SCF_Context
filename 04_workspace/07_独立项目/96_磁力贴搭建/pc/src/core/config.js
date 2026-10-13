/**
 * 全局常量。core/ 层只依赖这个文件里的数字，不依赖任何 UI。
 */

export const SCHEMA_VERSION = 1

/** 每格拆成几个原子。4 = 两条对角线切出的 4 个象限三角形。 */
export const ATOMS_PER_CELL = 4

/** 几何容差。面积、点在线段上、比例比较都用它。 */
export const ATOM_EPS = 1e-6

/**
 * 象限采样的阶数：把每个象限三角形切成 k² 个子三角形，取子三角形重心做点内测试。
 * k=5 → 15 个采样点，边界分辨率 1/15 ≈ 0.067 个象限面积。
 * 调大能更准，代价是栅格化耗时按 k² 涨 —— 而栅格化只跑一次，求解才是热点，所以给够。
 */
export const RASTER_SAMPLES = 5

/** 画布默认值。unit 是物理尺寸（cm），只在算实物边长和出图时用，渲染另有一套像素比例。 */
export const DEFAULT_CANVAS = {
  unit: 7.5,
  cols: 12,
  rows: 10,
  background: '#FBFAF6',
}

/** 覆盖率阈值。≥ 0.95 算通过，≥ 0.99 算优。 */
export const COVERAGE_PASS = 0.95
export const COVERAGE_EXCELLENT = 0.99

/** 允许的溢出比例（拼贴超出轮廓的面积占比）。 */
export const OVERFLOW_MAX = 0.05

/**
 * 求解降级阶梯，L0 最严格，数字越大越松。**这里只放标签和阈值**，
 * 每级到底放松了哪个约束、怎么放松，写在 `solver/strategies.js` 里。
 *
 * 与方案文档 §4.5 的差异（有意为之）：
 * 文档那套 L0–L5 混了三类东西 —— 求解器能放松的约束、改**目标区域**的动作
 * （换网格原点 L1、简化轮廓 L3）、以及回退到上游重新生成草稿（L4）。
 * 后两类不属于求解器，硬塞进这个阶梯会让「降到 L3 了」这种日志无法解释到底是
 * 求解器不行还是轮廓不行。所以这里只保留求解器真正能放松的约束，
 * 换原点/简化轮廓/重新生成归 M4 的轮廓管线。
 *
 * 另外文档没覆盖「库存不够」这个一定会撞上的情况：用户手上只有 24 片正方形时，
 * 判「不可拼」是错的，正确回答是「再补 6 片正方形就够」。这就是 L3。
 */
export const FALLBACK_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5']

export const FALLBACK_LABEL = {
  L0: '严格匹配：轮廓全部填满，只用库存内的形状与数量',
  L1: '允许留白：轮廓里最多 5% 的窄缝补不上',
  L2: '允许溢出：允许少量磁力片压出轮廓外（≤5%）',
  L3: '需要补料：现有库存不够，报告会列出该补哪些片',
  L4: '大幅留白：覆盖率降到 85%，只能当参考图',
  L5: '判为不可拼：给出不可拼的原因',
}

/** 各级的说明，写进可行性报告给用户看。键与 FALLBACK_LEVELS 一致。 */
export const FALLBACK_NOTE = {
  L0: '这套轮廓能用手上的磁力片严丝合缝地拼出来。',
  L1: '轮廓里有几处细缝，现有形状补不上，其余部分完整。',
  L2: '为了把轮廓填满，有几片会稍微压出轮廓边线，实物上不影响观感。',
  // 注意不能说成「拼不满」：L3 的轮廓是填满了的（覆盖率就是 100%），
  // 只是用掉的片数超过了库存。两句话意思正好相反，报告里那个 100% 就摆在旁边。
  L3: '现有库存的片数不够，报告里列了要补哪些形状、各几片。',
  L4: '只能拼出轮廓的大致样子，细节会缺失，建议当示意图用。',
  L5: '这套轮廓用直角系列磁力片拼不出来，报告里给了原因。',
}

/**
 * 求解器参数。
 * ATTEMPTS 是每一级的重试次数：DLX 第一次失败很可能只是搜索顺序不好，
 * 换个种子再来一次常常就出来了。种子固定，所以「同一份输入给同一张图」这条不破。
 */
export const SOLVER_ATTEMPTS = 6
export const SOLVER_MAX_NODES = 400000
/** 每次尝试最多收几个解，用来打分挑最好的 */
export const SOLVER_TOP_K = 8

/** 留白/溢出的分级额度（占目标原子的比例） */
export const GAP_BUDGET = { L0: 0, L1: 0.05, L2: 0.05, L3: 0.05, L4: 0.1, L5: 1 }
export const OVERFLOW_BUDGET = { L0: 0, L1: 0, L2: 0.05, L3: 0.05, L4: 0.05, L5: 1 }

/** 年龄分段的难度带（片数区间 + 难度分上限）。 */
export const AGE_BANDS = [
  { key: '启蒙', label: '启蒙 3-4 岁', minPieces: 5, maxPieces: 12, maxDifficulty: 0.35 },
  { key: '进阶', label: '进阶 5-6 岁', minPieces: 12, maxPieces: 30, maxDifficulty: 0.62 },
  { key: '挑战', label: '挑战 7-8 岁', minPieces: 30, maxPieces: 60, maxDifficulty: 1 },
]

/** 难度分的权重构成，加起来是 1。 */
export const DIFFICULTY_WEIGHTS = {
  pieces: 0.4, // 片数
  shapeVariety: 0.25, // 形状种类
  colorVariety: 0.15, // 颜色种类
  stepCount: 0.2, // 步骤数
}

/**
 * 难度分各项的归一化分母 —— 到多少就算「满难度」。
 * 取的是这套库存拼得出来的上限，不是理论值：片数 48 就是标准套装的平面总量。
 */
export const DIFFICULTY_NORMS = {
  pieces: 48,
  shapeKinds: 3, // 平面只有 SQ / TRI-R / RECT
  colorKinds: 9, // TILE_PALETTE 的长度
  steps: 12,
}

/**
 * 步骤合并的目标区间。60 片分 60 步的视频没人看，所以要把「一条连通合法序列上的
 * 连续段」合并成几组；但也不能合成两三步（那样每步的图跟上一步几乎一样，等于没拆）。
 */
export const MIN_STEPS = 6
export const MAX_STEPS = 12
/** 每步大约放几片，只用来推步数 —— 真的片数不够时以下限为准，见 planSizes */
export const DEFAULT_PIECES_PER_STEP = 4

/**
 * 步骤镜头（`steps[].camera`）的取景跨度，单位是格。
 * 包围盒跨度除以它得到 zoom —— 跨度越大离得越远。**现在没有任何地方消费它**
 * （视频二期才用），写了是为了让四套策略的产物形状一致、也让「只算不消费」
 * 这件事有个明确的落点，而不是含糊地欠着。
 */
export const CAMERA_SPAN = 8
