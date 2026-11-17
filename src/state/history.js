import { createDocument, parseDocument } from './document.js'
// 每个编辑器会话独立，最多20步且总快照不超过8MB；不进入存档。
export function createHistory(rawSet, get) {
  let past = [], future = [], group, changedAt = 0
  const snapshot = state => JSON.stringify(createDocument(state))
  const trim = () => { while (past.length > 20 || past.reduce((n,s)=>n+s.length,0) + future.reduce((n,s)=>n+s.length,0) > 4 * 1024 * 1024) { if (past.length) past.shift(); else future.shift() } }
  const counts = () => ({ undoCount: past.length, redoCount: future.length })
  return {
    set(patch, key) {
      const before = get(), update = typeof patch === 'function' ? patch(before) : patch
      const next = { ...before, ...update }
      if (next.trip.id !== before.trip.id || next.documentEpoch !== before.documentEpoch) { past = []; future = []; group = null }
      else if (['trip','places','visits','days','cityInfo','routeMode'].some(field => before[field] !== next[field])) {
        const a = snapshot(before), b = snapshot(next)
        // 选中日期/概览变化不形成编辑历史。
        const meaningful = doc => { const d = JSON.parse(doc); delete d.settings.activeDayId; delete d.settings.routeScope; return JSON.stringify(d) }
        if (meaningful(a) !== meaningful(b)) {
          if (!key || key !== group || Date.now() - changedAt > 800) past.push(a)
          future = []; group = key; changedAt = Date.now(); trim()
        }
      }
      rawSet({ ...update, ...counts() })
    },
    move(direction) {
      const from = direction === 'undo' ? past : future, to = direction === 'undo' ? future : past
      if (!from.length) return false
      const state = get(), data = parseDocument(from.at(-1))
      to.push(snapshot(state)); from.pop(); group = null; trim()
      rawSet({ ...data, ...counts(), documentEpoch: state.documentEpoch + 1, planRevision: state.planRevision + 1,
        focusPlaceId: null, focusRevision: state.focusRevision + 1, route: { status: 'unavailable' },
        notice: direction === 'undo' ? '已撤销上一步编辑。' : '已重做编辑。' })
      return true
    },
  }
}
