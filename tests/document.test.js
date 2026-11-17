import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as tick } from 'node:timers/promises'
import { createTripStore } from '../src/state/tripStore.js'
import { createDocument, parseDocument, MAX_FILE_BYTES } from '../src/state/document.js'
import { startPersistence, STORAGE_KEY } from '../src/state/persistence.js'
import { createStore } from 'zustand/vanilla'
const populated = () => {
  const store = createTripStore({ today: '2026-11-08' }), ids = Object.keys(store.getState().places)
  store.getState().addVisit(ids[0], store.getState().days[0].id); store.getState().addVisit(ids[1], store.getState().days[0].id)
  store.getState().editPlace(ids[0], { shape: 'heart', color: '#7944aa' })
  store.getState().editVisit(store.getState().days[0].visitIds[0], { notes: '备注', durationMinutes: 90 })
  store.getState().insertDay(); store.getState().setRouteMode('driving')
  return store
}
test('往返保留日期/顺序/样式/偏好，剔除运行时；同 ID 导入也使旧 UI/地图重新挂载', () => {
  const source = populated(), content = JSON.stringify(createDocument(source.getState())), store = createTripStore()
  assert.equal(content.includes('routeRetryKey'), false); assert.equal(content.includes('focusRevision'), false)
  const before = store.getState().documentEpoch
  store.getState().replaceDocument(content)
  assert.deepEqual(createDocument(store.getState()), JSON.parse(content))
  assert.equal(store.getState().route.status, 'unavailable')
  store.getState().replaceDocument(content); assert.equal(store.getState().documentEpoch, before + 2)
})
test('坏文件、版本、大小、ID、坐标、字段和全部引用关系拒绝；失败不破坏当前旅行', () => {
  const store = populated(), baseline = createDocument(store.getState())
  const mutations = [
    d => { d.schemaVersion = 2 }, d => { d.trip.name = 8 }, d => { d.trip.startDate = '2026-02-30' },
    d => { d.places[0].coordinates = [181, 30] }, d => { d.places[0].coordinates = [114, '30'] },
    d => { d.places[0].id = '__proto__' }, d => { d.places.push(d.places[0]) }, d => { d.visits.push(d.visits[0]) },
    d => { d.days.push(d.days[0]) }, d => { d.places[0].color = 'red' }, d => { d.places[0].shape = 'script' },
    d => { d.visits[0].durationMinutes = -1 }, d => { d.visits[0].notes = {} }, d => { d.visits[0].placeId = 'amap:missing' },
    d => { d.days[0].visitIds.push('missing') }, d => { d.days[1].visitIds.push(d.days[0].visitIds[0]) },
    d => { d.days[0].visitIds = [] }, d => { d.days[0].visitIds.push(d.days[0].visitIds[0]) },
    d => { d.days[1].date = d.days[0].date }, d => { d.settings.activeDayId = 'unknown' },
    d => { d.settings.routeMode = 'fly' }, d => { d.map = {} }, d => { d.places[0].city = '杭州' },
    d => { d.cityInfo.center = [] }, d => { d.days = [] }, d => { d.cityInfo = undefined },
    d => { d.days[0].startHotelId = d.places[0].id },
    d => { d.days[0].endHotelId = 'amap:missing-hotel' },
  ]
  for (const mutate of mutations) {
    const d = structuredClone(baseline); mutate(d)
    assert.throws(() => store.getState().replaceDocument(JSON.stringify(d)))
    assert.deepEqual(createDocument(store.getState()), baseline)
  }
  for (const content of ['{', 'null', '[]', 'x'.repeat(MAX_FILE_BYTES + 1)]) assert.throws(() => parseDocument(content))
})
test('自动保存仅响应可持久化变化，立即 flush，恢复后不带请求；存储失败可恢复', async () => {
  const source = populated(), memory = new Map(), writes = []
  const storage = { getItem: k => memory.get(k) ?? null, setItem: (k,v) => { memory.set(k,v); writes.push(v) } }
  const status = createStore(() => ({})), controller = startPersistence(source, { storage, delayMs: 5, statusStore: status })
  source.getState().setRoute({ status: 'loading' }); source.getState().setNotice('临时提示'); await tick(10)
  assert.equal(writes.length, 0)
  source.getState().setRouteMode('walking'); controller.flush(); assert.equal(writes.length, 1)
  const restored = createTripStore(), restoredController = startPersistence(restored, { storage, statusStore: status })
  assert.deepEqual(createDocument(restored.getState()), createDocument(source.getState()))
  assert.equal(restored.getState().route.status, 'unavailable')
  source.getState().editVisit(source.getState().days[0].visitIds[0], { notes: '最后一次' }); controller.destroy()
  assert.match(memory.get(STORAGE_KEY), /最后一次/)
  restoredController.destroy()
})
test('损坏/未来版本存档保留原内容并停止覆盖；不可用/超额明确报错，重试可恢复', async () => {
  for (const bad of ['{bad', '{"schemaVersion":55}']) {
    const state = createTripStore(), memory = new Map([[STORAGE_KEY,bad]]), status = createStore(() => ({}))
    const storage = { getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v) }
    const controller = startPersistence(state, { storage, statusStore:status,delayMs:1 })
    assert.equal(status.getState().status,'blocked')
    state.getState().insertDay(); await tick(5); assert.equal(memory.get(STORAGE_KEY),bad)
    controller.retry(); assert.equal(status.getState().status,'saved'); assert.equal(parseDocument(memory.get(STORAGE_KEY)).days.length,2)
    controller.destroy()
  }
  let fail = true, status = createStore(() => ({})), state = createTripStore()
  const storage = { getItem:()=>null,setItem:()=>{if(fail)throw new Error('quota')} }
  const controller=startPersistence(state,{storage,statusStore:status,delayMs:1})
  state.getState().insertDay();await tick(5);assert.equal(status.getState().status,'error')
  fail=false;controller.retry();assert.equal(status.getState().status,'saved');controller.destroy()
  const blocked=startPersistence(createTripStore(),{storage:{getItem:()=>{throw new Error('denied')}},statusStore:status})
  assert.equal(status.getState().status,'error');blocked.destroy()
})

test('同 ID 导入同步失效旧道路和旧搜索候选，防抖等待期间迟到结果不覆盖新旅行', async () => {
  const { createRouteController } = await import('../src/map/routeController.js')
  const store=populated(), calls=[], draws=[]
  store.getState().selectDay(store.getState().days[0].id)
  const oldEpoch=store.getState().documentEpoch, oldTrip=store.getState().trip.id
  const candidate={...Object.values(store.getState().places)[0],sourceId:'late',id:'amap:late'}
  const controller=createRouteController({store,delayMs:10,clear(){},draw:legs=>draws.push(legs),request:(a,b,mode,signal)=>new Promise(resolve=>calls.push({signal,resolve}))})
  await tick(20);store.getState().replaceDocument(JSON.stringify(createDocument(store.getState())))
  assert.equal(calls[0].signal.aborted,true)
  calls[0].resolve({path:[[114,30],[115,31]],distance:100,time:60});await tick(0)
  assert.equal(draws.length,0)
  assert.equal(store.getState().addCandidate(candidate,oldTrip,oldEpoch),false)
  controller.destroy()
})
