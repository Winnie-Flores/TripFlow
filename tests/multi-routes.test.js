import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as tick } from 'node:timers/promises'
import { createTripStore } from '../src/state/tripStore.js'
import { WUHAN_PLACES } from '../src/data/wuhan.js'
import { createRouteController } from '../src/map/routeController.js'
const [a, b] = WUHAN_PLACES.map((p) => p.id)
const road = { path: [[114, 30], [115, 31]], distance: 100, time: 60 }
function setup(reverse = false) {
  const store = createTripStore()
  store.getState().insertDay()
  const [d1, d2] = store.getState().days.map((day) => day.id)
  for (const p of [a, b]) store.getState().addVisit(p, d1)
  for (const p of reverse ? [b, a] : [a, b]) store.getState().addVisit(p, d2)
  store.getState().setRouteScope('all')
  return { store, d1, d2 }
}
test('全部日期逐日独立分段，同批同方向去重，各天编号/统计独立；只改显示内容不重算', async () => {
  const { store, d1 } = setup(), calls = [], drawings = []
  const controller = createRouteController({ store, delayMs: 1, clear() {}, draw: (legs) => drawings.push(legs),
    request: async (...args) => { calls.push(args); return road } })
  await tick(15)
  assert.equal(calls.length, 1)
  const result = store.getState().route
  assert.equal(result.status, 'ready'); assert.equal(result.total, 2); assert.equal(result.completed, 2)
  assert.equal(result.distance, 200)
  assert.deepEqual(result.days.map((d) => d.legs.map((l) => l.index)), [[0], [0]])
  assert.equal(drawings.at(-1).length, 2)
  assert.notEqual(drawings.at(-1)[0].color, drawings.at(-1)[1].color)
  store.getState().selectDay(d1)
  const id = store.getState().days[0].visitIds[0]
  store.getState().editVisit(id, { notes: '备注', durationMinutes: 100 })
  store.setState({ places: { ...store.getState().places, [a]: { ...store.getState().places[a], name: '名称', icon: '★', color: '#fff' } } })
  await tick(5); assert.equal(calls.length, 1)
  controller.destroy()
})
test('部分失败保留成功路段并计数，继续后续天；重试发新请求；不连接不同日期', async () => {
  const { store } = setup(true), calls = [], drawings = []
  let fail = true
  const controller = createRouteController({ store, delayMs: 1, clear() {}, draw: (legs) => drawings.push(legs),
    request: async (from, to) => { calls.push([from, to]); if (fail && calls.length === 1) throw new Error('跨江无步行道路'); return road } })
  await tick(15)
  assert.equal(calls.length, 2)
  const result = store.getState().route
  assert.equal(result.status, 'partial'); assert.equal(result.completed, 1); assert.equal(result.total, 2)
  assert.equal(result.distance, 100); assert.equal(drawings.at(-1).length, 1)
  assert.match(result.days[0].legs[0].message, /跨江/)
  assert.deepEqual(calls, [[WUHAN_PLACES[0].coordinates, WUHAN_PLACES[1].coordinates], [WUHAN_PLACES[1].coordinates, WUHAN_PLACES[0].coordinates]])
  fail = false; store.getState().retryRoute(); await tick(15)
  assert.equal(calls.length, 4); assert.equal(store.getState().route.status, 'ready')
  controller.destroy()
})
test('多段一天中间失败继续，完整统计只包含成功路段', async () => {
  const { store, d1, d2 } = setup()
  store.setState({ places: { ...store.getState().places, c: { id: 'c', name: '测试第三点', coordinates: [116, 32] }, d: { id: 'd', name: '测试第四点', coordinates: [117, 33] } } })
  for (const p of ['c', 'd']) { store.getState().addVisit(p, d1); store.getState().addVisit(p, d2) }
  let count = 0
  const controller = createRouteController({ store, delayMs: 1, clear() {}, draw() {}, request: async () => { if (++count === 2) throw new Error('failed'); return road } })
  await tick(15)
  assert.equal(count, 3); assert.equal(store.getState().route.status, 'partial')
  assert.equal(store.getState().route.completed, 4); assert.equal(store.getState().route.total, 6)
  assert.deepEqual(store.getState().route.days.map((d) => d.legs.map((l) => l.status)), [['ready', 'error', 'ready'], ['ready', 'error', 'ready']])
  controller.destroy()
})
test('请求间隔等待中切换方式立即失效，旧响应、排队和卸载均不污染状态', async () => {
  const { store, d1 } = setup(true), calls = [], draws = []
  const controller = createRouteController({ store, delayMs: 1, minIntervalMs: 60, clear() {}, draw: (legs) => draws.push(legs),
    request: (from, to, mode, signal) => new Promise((resolve) => calls.push({ mode, signal, resolve, at: Date.now() })) })
  await tick(10); calls[0].resolve(road); await tick(5)
  store.getState().setRouteMode('driving')
  assert.equal(calls[0].signal.aborted, true)
  store.getState().setRouteScope('selected'); store.getState().selectDay(d1)
  await tick(70)
  assert.equal(calls.length, 2); assert.equal(calls[1].mode, 'driving')
  assert.ok(calls[1].at - calls[0].at >= 55)
  const count = draws.length; controller.destroy(); calls[1].resolve(road); await tick(5)
  assert.equal(draws.length, count)
})
