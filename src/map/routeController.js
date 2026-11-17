import { dayStops, dayLegs } from '../state/dayRoute.js'
import { dayColor } from './routeStyle.js'
export function routeSnapshot(state) {
  const days = (state.routeScope === 'all' ? state.days : state.days.filter((day) => day.id === state.activeDayId))
    .map((day) => ({ dayId: day.id, color: dayColor(state.days.indexOf(day)),
      modes: dayLegs(state, day).map(leg => leg.mode), points: dayStops(state, day).map(stop => [...stop.place.coordinates]) }))
  return { days, points: days[0]?.points ?? [], mode: state.routeMode,
    signature: JSON.stringify([state.documentEpoch ?? 0, state.routeScope ?? 'selected', state.routeMode, days.map(({ dayId, points, color, modes }) => [dayId, points, color, modes])]) }
}
// 同步使旧结果失效；只保留当前计算批次的数据，不持久化服务道路。
export function createRouteController({ store, request, clear, draw, delayMs = 200, minIntervalMs = 0 }) {
  let generation = 0, signature, timer, abortController, lastStart = 0
  let disposed = false
  const update = (force = false) => {
    if (disposed) return
    const snapshot = routeSnapshot(store.getState())
    if (!force && snapshot.signature === signature) return
    signature = snapshot.signature
    const current = ++generation
    clearTimeout(timer)
    abortController?.abort()
    clear()
    const days = snapshot.days.map((day) => ({ ...day, legs: day.points.slice(1).map((_, index) => ({ index, status: 'pending' })) }))
    const total = days.reduce((sum, day) => sum + day.legs.length, 0)
    if (!total) { store.getState().setRoute({ status: 'idle', signature, days }); return }
    abortController = new AbortController()
    const signal = abortController.signal
    const isCurrent = () => !disposed && current === generation && !signal.aborted
      && routeSnapshot(store.getState()).signature === snapshot.signature
    const publish = (finished = false) => {
      if (!isCurrent()) return
      const legs = days.flatMap((day) => day.legs.filter((leg) => leg.status === 'ready').map((leg) => ({ ...leg, dayId: day.dayId, color: day.color })))
      const failed = days.reduce((sum, day) => sum + day.legs.filter((leg) => leg.status === 'error').length, 0)
      clear(); if (legs.some(leg => leg.path.length > 1)) draw(legs.filter(leg => leg.path.length > 1))
      store.getState().setRoute({ status: !finished ? 'loading' : failed ? (legs.length ? 'partial' : 'error') : 'ready',
        signature, days: days.map((day) => ({ ...day, legs: [...day.legs] })), completed: legs.length, total,
        distance: legs.reduce((sum, leg) => sum + leg.distance, 0), time: legs.reduce((sum, leg) => sum + leg.time, 0),
        message: failed ? '部分道路未获得可用结果，请查看路段提示并重试。' : '' })
    }
    publish()
    timer = setTimeout(async () => {
      // 同批次相同方向、坐标和方式只请求一次；切换/重试后不沿用历史道路。
      const batch = new Map()
      for (const day of days) {
        for (let i = 0; i < day.legs.length; i++) {
          if (!isCurrent()) return
          const key = JSON.stringify([day.modes[i], day.points[i], day.points[i + 1]])
          let result = batch.get(key)
          if (!result) {
            const remaining = minIntervalMs - (Date.now() - lastStart)
            if (remaining > 0) await new Promise((resolve) => {
              const done = () => { clearTimeout(waitTimer); signal.removeEventListener('abort', done); resolve() }
              const waitTimer = setTimeout(done, remaining)
              signal.addEventListener('abort', done, { once: true })
            })
            if (!isCurrent()) return
            lastStart = Date.now()
            try { const same = JSON.stringify(day.points[i]) === JSON.stringify(day.points[i + 1]); result = { ...(same ? { path: [], distance: 0, time: 0, sameLocation: true } : await request(day.points[i], day.points[i + 1], day.modes[i], signal)), status: 'ready', index: i } }
            catch (error) { result = { status: 'error', message: error.message || '道路规划失败，请重试。', index: i } }
            if (!isCurrent()) return
            batch.set(key, result)
          }
          day.legs[i] = { ...result, index: i }
          publish()
        }
      }
      publish(true)
    }, delayMs)
  }
  const unsubscribe = store.subscribe((state, previous) => update(state.routeRetryKey !== previous.routeRetryKey))
  update()
  return { retry() { update(true) }, destroy() {
    disposed = true; ++generation; unsubscribe(); clearTimeout(timer); abortController?.abort(); clear()
  } }
}
