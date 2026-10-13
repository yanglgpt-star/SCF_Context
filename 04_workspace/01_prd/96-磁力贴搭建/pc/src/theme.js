/**
 * 配色方案 A「纸感工作台」—— 定稿于 2026-09-17
 * 对照页：../../磁力贴工作台-配色方案对比_v1.0.html
 *
 * 这套值是全站唯一色彩来源：
 *   - global.css 通过 CSS 变量消费
 *   - antd ConfigProvider 通过 antdTheme 消费
 * 改色只改这里，不要在任何页面里写死颜色。
 */
export const tokens = {
  ground: '#F5F3EE', // 页面底
  panel: '#FFFFFF', // 面板
  rail: '#FFFFFF', // 左侧菜单栏
  canvas: '#FBFAF6', // 画布底
  rule: '#E4E1D8', // 分隔线 / 边框
  ink: '#1C1B18', // 主文字
  ink2: '#5C5A52', // 次文字
  ink3: '#96938A', // 弱文字 / 占位
  brand: '#B23A2E', // 主色（砖红）
  brandInk: '#FFFFFF',
  brandWash: '#F8E7E4', // 主色浅底（选中态）
  ok: '#2E6B4F', // 通过
  okLine: '#BFD9CB',
  okWash: '#EAF3EE',
  grid: '#E9E6DC', // 画布网格线
}

/**
 * 画布上的磁力片配色。真身在 core/model/palette.js —— 那是作品数据不是界面配色，
 * 求解器和渲染器都要用，所以放 core 里。这里只是转出去，别再写第二份。
 */
export { TILE_PALETTE as tilePalette } from './core/model/palette.js'

export const fontStack =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", sans-serif'

export const monoStack = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

export const antdTheme = {
  token: {
    colorPrimary: tokens.brand,
    colorSuccess: tokens.ok,
    colorError: tokens.brand,
    // 刻意不覆盖 colorInfo：把品牌红套到 info 上会让中性提示看起来像报错
    colorBgLayout: tokens.ground,
    colorBgContainer: tokens.panel,
    colorText: tokens.ink,
    colorTextSecondary: tokens.ink2,
    colorTextTertiary: tokens.ink3,
    colorTextQuaternary: tokens.ink3,
    colorBorder: tokens.rule,
    colorBorderSecondary: tokens.rule,
    colorFillAlter: '#FAF9F5',
    borderRadius: 6,
    fontFamily: fontStack,
    fontSize: 13,
    controlHeight: 30,
    wireframe: false,
  },
  components: {
    Layout: {
      bodyBg: tokens.ground,
      siderBg: tokens.rail,
      headerBg: tokens.panel,
    },
    Menu: {
      itemSelectedBg: tokens.brandWash,
      itemSelectedColor: tokens.brand,
      itemHoverBg: '#F3F1EA',
      itemHeight: 32,
      itemMarginInline: 6,
      subMenuItemBg: 'transparent',
      itemBg: 'transparent',
    },
    Table: {
      headerBg: '#FAF9F5',
      headerColor: tokens.ink2,
      headerSplitColor: tokens.rule,
      rowHoverBg: '#FAF9F5',
      borderColor: tokens.rule,
    },
    Tabs: {
      itemSelectedColor: tokens.brand,
      itemHoverColor: tokens.brand,
      inkBarColor: tokens.brand,
    },
    Card: {
      headerBg: 'transparent',
      paddingLG: 16,
    },
    Button: {
      primaryShadow: 'none',
      defaultShadow: 'none',
    },
  },
}
