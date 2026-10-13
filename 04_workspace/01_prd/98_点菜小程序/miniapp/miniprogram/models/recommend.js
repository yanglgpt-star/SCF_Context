/**
 * 条件推荐引擎
 * 根据 想吃啥 + 天气 + 身体条件 → 推荐 3 道菜
 */

const localFoods = require('./local_foods');

// ============ 条件 → 标签映射 ============

const CRAVING_MAP = {
  '肉': ['肉'],
  '素': ['素'],
  '辣': ['辣'],
  '清淡': ['清淡'],
  '汤': ['汤'],
  '快手': ['快手'],
  '下饭': ['下饭'],
  '酸甜': ['酸甜'],
  '想吃肉': ['肉'],
  '想吃素': ['素'],
  '想吃辣': ['辣'],
  '想喝汤': ['汤'],
  '不挑': [],
};

const WEATHER_MAP = {
  '大热天': ['hot'],
  '大冷天': ['cold'],
  '下雨': ['rainy'],
  '干燥': ['dry'],
  '不限': ['all'],
};

const BODY_MAP = {
  '没胃口': ['no_appetite'],
  '减肥': ['diet'],
  '上火': ['上火'],
  '感冒': ['cold'],
  '运动后': ['post_sport'],
  '小孩': ['child'],
  '不限': ['all'],
};

// 天气条件的人话描述
const WEATHER_DESC = {
  'hot': '天热适合',
  'cold': '天冷适合',
  'rainy': '雨天适合',
  'dry': '干燥天气适合',
};

const BODY_DESC = {
  'no_appetite': '开胃',
  'diet': '减脂',
  '上火': '清淡去火',
  'cold': '暖身',
  'post_sport': '补充蛋白质',
  'child': '适合孩子',
};

// ============ 筛选逻辑 ============

/**
 * 条件推荐
 * @param {object} params
 * @param {string} params.craving - 想吃啥（肉/素/辣/清淡/汤/快手/不挑）
 * @param {string} params.weather - 天气（大热天/大冷天/下雨/干燥/不限）
 * @param {string} params.body - 身体状况（没胃口/减肥/上火/感冒/运动后/小孩/不限）
 * @returns {{ dishes: array, reason: string }}
 */
function recommend({ craving, weather, body }) {
  const cravingTags = CRAVING_MAP[craving] || [];
  const weatherTags = WEATHER_MAP[weather] || ['all'];
  const bodyTags = BODY_MAP[body] || ['all'];

  // 第 1 轮：三条件严格筛选
  let candidates = [...localFoods];

  // 筛选天气
  candidates = candidates.filter(d =>
    weatherTags.some(t => d.weather_tags && d.weather_tags.includes(t))
  );

  // 筛选身体
  candidates = candidates.filter(d =>
    bodyTags.some(t => d.body_tags && d.body_tags.includes(t))
  );

  // 筛选想吃啥
  if (cravingTags.length > 0) {
    candidates = candidates.filter(d =>
      cravingTags.some(t => d.craving_tags && d.craving_tags.includes(t))
    );
  }

  // 第 2 轮：候选不足时降级
  const minCount = 3;
  let round = 1;

  while (candidates.length < minCount && round < 3) {
    if (round === 1 && body !== '不限') {
      // 降级 1：去掉身体条件
      candidates = [...localFoods];
      if (cravingTags.length > 0) {
        candidates = candidates.filter(d =>
          cravingTags.some(t => d.craving_tags && d.craving_tags.includes(t))
        );
      }
      candidates = candidates.filter(d =>
        weatherTags.some(t => d.weather_tags && d.weather_tags.includes(t))
      );
    } else if (round === 2 && weather !== '不限') {
      // 降级 2：再去掉天气条件（只保留口味）
      candidates = [...localFoods];
      if (cravingTags.length > 0) {
        candidates = candidates.filter(d =>
          cravingTags.some(t => d.craving_tags && d.craving_tags.includes(t))
        );
      }
    }
    round++;
  }

  // 随机选 3 道
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 3);

  return {
    dishes: selected,
    reason: buildReason(selected, { craving, weather, body }, round),
  };
}

/** 生成推荐理由 */
function buildReason(dishes, { craving, weather, body }, fallbackRound) {
  const parts = [];
  const descMap = { craving: CRAVING_MAP, weather: WEATHER_DESC, body: BODY_DESC };

  if (body && body !== '不限' && fallbackRound <= 1) {
    const label = BODY_MAP[body]?.[0];
    if (label && BODY_DESC[label]) parts.push(BODY_DESC[label]);
  }
  if (weather && weather !== '不限' && fallbackRound <= 2) {
    const label = WEATHER_MAP[weather]?.[0];
    if (label && WEATHER_DESC[label]) parts.push(WEATHER_DESC[label]);
  }
  if (craving && craving !== '不挑') parts.push(`想吃${craving}`);

  const prefix = parts.length > 0 ? `推荐理由：${parts.join('，')}` : '随机推荐';
  const dietTips = dishes.map(d => {
    const tips = [];
    if (d.body_tags?.includes('diet')) tips.push('低卡');
    if (d.tags?.includes('快手菜')) tips.push('快手');
    if (d.calories && d.calories < 300) tips.push(`${d.calories}大卡`);
    return tips.length > 0 ? `${d.name}（${tips.join('·')}）` : d.name;
  }).join('、');

  return `${prefix}：${dietTips}`;
}

module.exports = { recommend };
