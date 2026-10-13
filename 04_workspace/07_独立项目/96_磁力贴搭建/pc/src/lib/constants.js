/** 首页标签固定存在、不可关闭。放在独立模块里，避免 store 与 router 相互 import 成环。 */
export const HOME_KEY = '/home'
export const HOME_LABEL = '工作台'

/*
 * 年龄档不在这里 —— 在 core/config.js 的 AGE_BANDS。
 * 那份带 minPieces/maxPieces/maxDifficulty，提示词和可行性报告都要用；
 * 这里曾经有过第二份（只有展示用的 label/range/pieces，键还叫 enlighten/advanced/challenge），
 * 两个真相来源，将来一定有人把没有片数区间的那份拿去用。要展示就 import core/api.js。
 */
