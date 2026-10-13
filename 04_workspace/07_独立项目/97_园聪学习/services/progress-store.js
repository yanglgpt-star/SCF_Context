const KEYS = {
  profile: 'yc_profile_v1', settings: 'yc_settings_v1',
  progress: 'yc_progress_v1', logs: 'yc_question_logs_v1', active: 'yc_active_session_v1'
}
const defaults = {
  profile: { nickname: '小聪', avatar: '🐻', ready: false },
  settings: { voiceOn: true, musicOn: false, dailySessions: 1 },
  progress: { stars: 0, sessionsCompleted: 0, rewardedSessions: [] }
}
function get(name) { try { return wx.getStorageSync(KEYS[name]) || defaults[name] || null } catch (e) { return defaults[name] || null } }
function set(name, value) { wx.setStorageSync(KEYS[name], value); return value }
function ensureDefaults() { ['profile', 'settings', 'progress'].forEach((name) => { if (!wx.getStorageSync(KEYS[name])) set(name, defaults[name]) }) }
function appendLogs(items) { const logs = get('logs') || []; set('logs', logs.concat(items).slice(-200)) }
function clearLearning() { set('progress', defaults.progress); set('logs', []); wx.removeStorageSync(KEYS.active) }
module.exports = { KEYS, defaults, get, set, ensureDefaults, appendLogs, clearLearning }
