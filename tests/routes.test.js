import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as tick } from 'node:timers/promises'
import { createTripStore, FIRST_DAY_ID } from '../src/state/tripStore.js'
import { WUHAN_PLACES } from '../src/data/wuhan.js'
import { createRouteController, routeSnapshot } from '../src/map/routeController.js'
import { requestLeg } from '../src/map/requestLeg.js'
const [a, b] = WUHAN_PLACES.map((p) => p.id)
const route = { path: [[114, 30], [114.01, 30.01]], distance: 1234, time: 600 }
const populated = () => { const store = createTripStore(); store.getState().addVisit(a, FIRST_DAY_ID); store.getState().addVisit(b, FIRST_DAY_ID); return store }

test('重排立即作废旧响应，包括防抖等待窗口；删除为一点/零点立即清图', async () => {
  const store = populated(), calls = [], drawn = []
  let clearCount = 0
  const controller = createRouteController({ store, delayMs: 20, clear: () => clearCount++, draw: (legs) => drawn.push(legs),
    request: (from, to, mode, signal) => new Promise((resolve, reject) => calls.push({ from, to, mode, signal, resolve, reject })) })
  await tick(30)
  assert.equal(calls.length, 1)
  const ids = [...store.getState().days[0].visitIds]
  store.getState().reorderVisit(FIRST_DAY_ID, ids[0], ids[1])
  assert.equal(calls[0].signal.aborted, true)
  calls[0].resolve(route)
  await tick(0)
  assert.equal(drawn.length, 0)
  assert.equal(store.getState().route.status, 'loading')
  await tick(30)
  assert.deepEqual(calls[1].from, WUHAN_PLACES[1].coordinates)
  calls[1].resolve(route)
  await tick(0)
  assert.equal(store.getState().route.status, 'ready')
  const clearsBefore = clearCount
  store.getState().removeVisit(ids[0])
  assert.ok(clearCount > clearsBefore)
  assert.equal(store.getState().route.status, 'idle')
  store.getState().removeVisit(ids[1])
  assert.equal(store.getState().route.status, 'idle')
  assert.equal(calls.length, 2)
  controller.destroy()
})

test('切换方式/失败/重试/卸载后的迟到结果，均不污染最新状态', async () => {
  const store = populated(), calls = [], drawn = []
  const controller = createRouteController({ store, delayMs: 1, clear() {}, draw: (legs) => drawn.push(legs),
    request: (from, to, mode) => new Promise((resolve, reject) => calls.push({ mode, resolve, reject })) })
  await tick(5)
  store.getState().setRouteMode('driving')
  calls[0].reject(new Error('old failure'))
  await tick(5)
  assert.equal(calls[1].mode, 'driving')
  calls[1].reject(new Error('network failure'))
  await tick(0)
  assert.equal(store.getState().route.status, 'error')
  store.getState().retryRoute()
  await tick(5)
  assert.equal(store.getState().route.status, 'loading')
  controller.destroy()
  calls[2].resolve(route)
  await tick(0)
  assert.equal(drawn.length, 0)
})

test('道路签名只依赖日期、坐标顺序与方式，地点名称/游览备注不触发重算', () => {
  const store = populated()
  const signature = routeSnapshot(store.getState()).signature
  store.setState({ places: { ...store.getState().places, [a]: { ...store.getState().places[a], name: 'new title' } } })
  assert.equal(routeSnapshot(store.getState()).signature, signature)
})

test('SDK 适配使用真实返回的步行/驾车 path；失败、缺服务、超时可见', async () => {
  let callback, cleared = 0, selected
  class Service { constructor() { selected = this } search(from, to, cb) { callback = cb } clear() { cleared++ } }
  const sdk = { Walking: Service, Driving: Service }
  const pending = requestLeg(sdk, [114, 30], [115, 31], 'walking')
  assert.ok(selected)
  callback('complete', { routes: [{ distance: 1234, time: 600, steps: [{ path: route.path }] }] })
  assert.deepEqual(await pending, route)
  assert.equal(cleared, 1)
  const failed = requestLeg(sdk, [114, 30], [115, 31], 'driving')
  callback('error', { info: 'error' })
  await assert.rejects(failed, /未获得可用道路/)
  await assert.rejects(requestLeg({}, [114, 30], [115, 31], 'walking'), /未就绪/)
  await assert.rejects(requestLeg(sdk, [114, 30], [115, 31], 'walking', undefined, 5), /超时/)
})

test('SDK 请求取消后返回的成功回调不会覆盖取消结果', async () => {
  let callback
  class Service { search(a, b, cb) { callback = cb } clear() {} }
  const abort = new AbortController()
  const pending = requestLeg({ Walking: Service }, [114, 30], [115, 31], 'walking', abort.signal)
  abort.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  callback('complete', { routes: [{ ...route, steps: [{ path: route.path }] }] })
})

test('SDK 空统计或不合法坐标不会被绘制为成功道路', async () => {
  let callback
  class Service { search(a, b, cb) { callback = cb } clear() {} }
  for (const invalid of [
    { distance: null, time: 600, steps: [{ path: route.path }] },
    { distance: 123, time: null, steps: [{ path: route.path }] },
    { distance: 123, time: 600, steps: [{ path: [[NaN, 30], [181, 31]] }] },
    { distance: 123, time: 600, steps: [] },
    { distance: 123, time: 600, steps: {} },
    { distance: 123, time: 600, steps: [{ path: 'invalid' }] },
  ]) {
    const pending = requestLeg({ Walking: Service }, [114, 30], [115, 31], 'walking')
    callback('complete', { routes: [invalid] })
    await assert.rejects(pending, /数据不完整/)
  }
})
