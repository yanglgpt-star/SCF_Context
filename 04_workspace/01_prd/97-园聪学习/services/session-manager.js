const KEY = 'yc_child_session_started_v1'
const LIMIT = 10 * 60 * 1000
function read() {
  const value = wx.getStorageSync(KEY)
  if (!value || typeof value === 'number') return { elapsed: 0, resumedAt: null, locked: false }
  return value
}
function write(state) { wx.setStorageSync(KEY, state); return state }
function start() { const state = read(); if (!state.locked && !state.resumedAt) state.resumedAt = Date.now(); return write(state) }
function pause() { const state = read(); if (state.resumedAt) { state.elapsed += Date.now() - state.resumedAt; state.resumedAt = null; write(state) } return state }
function elapsed() { const state = read(); return state.elapsed + (state.resumedAt ? Date.now() - state.resumedAt : 0) }
function isLocked() { return Boolean(read().locked) }
function shouldRest() { return isLocked() || elapsed() >= LIMIT }
function reset() { write({ elapsed: 0, resumedAt: Date.now(), locked: false }) }
function lock() { const state = pause(); state.locked = true; write(state) }
function clear() { wx.removeStorageSync(KEY) }
module.exports = { KEY, LIMIT, start, pause, elapsed, isLocked, shouldRest, reset, lock, clear }
