import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as tick } from 'node:timers/promises'
import { createTripStore, FIRST_DAY_ID } from '../src/state/tripStore.js'
import { addDate, validDate, previewVisitMove } from '../src/state/plan.js'
import { HANGZHOU_PLACES } from '../src/data/hangzhou.js'
import { WUHAN_PLACES } from '../src/data/wuhan.js'
import { createRouteController } from '../src/map/routeController.js'
const [a, b] = WUHAN_PLACES.map((place) => place.id)
const settings = { name: '武汉三日游', city: '武汉', startDate: '2026-12-30', dayCount: 3 }
function setup() { const store = createTripStore({ today: '2026-11-07' }); assert.equal(store.getState().configureTrip(settings).ok, true); return store }
const model = (store) => { const { trip, places, visits, days, activeDayId } = store.getState(); return structuredClone({ trip, places, visits, days, activeDayId }) }
function invariant(store) {
  const state = store.getState(), ids = state.days.flatMap((day) => day.visitIds)
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual([...ids].sort(), Object.keys(state.visits).sort())
  assert.ok(state.days.some((day) => day.id === state.activeDayId))
  state.days.forEach((day, index) => {
    assert.equal(day.date, addDate(state.trip.startDate, index))
    const placeIds = day.visitIds.map((id) => state.visits[id].placeId)
    placeIds.forEach((id) => assert.ok(state.places[id]))
    assert.equal('sortOrder' in day, false)
  })
}

test('旅行设置与跨年/闰日连续日期；插入删除保留原 Day ID 和内容', () => {
  const store = setup(), ids = store.getState().days.map((day) => day.id)
  assert.deepEqual(store.getState().days.map((day) => day.date), ['2026-12-30', '2026-12-31', '2027-01-01'])
  store.getState().addVisit(a, ids[1])
  const visitId = store.getState().days[1].visitIds[0]
  store.getState().insertDay(1)
  assert.equal(store.getState().days[2].id, ids[1])
  assert.equal(store.getState().days[2].visitIds[0], visitId)
  assert.equal(store.getState().days[2].date, '2027-01-01')
  const inserted = store.getState().days[1].id
  store.getState().removeDay(inserted)
  assert.deepEqual(store.getState().days.map((day) => day.id), ids)
  assert.equal(store.getState().days[1].date, '2026-12-31')
  assert.equal(addDate('2028-02-28', 1), '2028-02-29')
  assert.equal(addDate('2028-02-28', 2), '2028-03-01')
  assert.equal(validDate('2026-02-29'), false)
  store.getState().configureTrip({ ...settings, name: '新标题', startDate: '2027-01-05' })
  assert.equal(store.getState().trip.name, '新标题')
  assert.equal(store.getState().days[1].visitIds[0], visitId)
  invariant(store)
})

test('删除非空天、缩短、切城和重建均受模型确认保护，取消无数据改动', () => {
  const store = setup(), last = store.getState().days[2].id
  store.getState().addVisit(a, last)
  const before = model(store)
  assert.equal(store.getState().removeDay(last).requiresConfirmation, true)
  assert.equal(store.getState().configureTrip({ ...settings, dayCount: 1 }).requiresConfirmation, true)
  assert.equal(store.getState().configureTrip({ ...settings, city: '杭州' }).requiresConfirmation, true)
  assert.equal(store.getState().configureTrip(settings, { reset: true }).requiresConfirmation, true)
  assert.deepEqual(model(store), before)
  assert.equal(store.getState().removeDay(last, { confirmed: true }).ok, true)
  assert.equal(Object.keys(store.getState().visits).length, 0)
  assert.equal(store.getState().activeDayId, store.getState().days[1].id)
  invariant(store)
  store.getState().configureTrip({ ...settings, city: '杭州' })
  assert.equal(store.getState().trip.city, '杭州')
  assert.equal(Object.keys(store.getState().places).length, HANGZHOU_PLACES.length)
  store.getState().configureTrip({ ...settings, city: '武汉市' })
  assert.equal(store.getState().trip.city, '武汉')
  assert.equal(Object.keys(store.getState().places).length, WUHAN_PLACES.length)
  invariant(store)
})

test('确认缩短只删除尾部的游览，重建生成新 ID；首尾插入/删除日期连续', () => {
  const store = setup(), originalTrip = store.getState().trip.id
  const [day1, , day3] = store.getState().days.map((day) => day.id)
  store.getState().addVisit(a, day1);store.getState().addVisit(b, day3)
  const retained = store.getState().days[0].visitIds[0]
  store.getState().configureTrip({ ...settings, dayCount: 2 }, { confirmed: true })
  assert.deepEqual(Object.keys(store.getState().visits), [retained])
  store.getState().insertDay(0);store.getState().insertDay()
  assert.equal(store.getState().days[1].id, day1)
  invariant(store)
  store.getState().configureTrip({ ...settings, dayCount: 1 }, { reset: true, confirmed: true })
  assert.notEqual(store.getState().trip.id, originalTrip)
  assert.deepEqual(store.getState().visits, {})
  assert.equal(store.getState().removeDay(store.getState().days[0].id).ok, false)
  invariant(store)
})

test('跨天空白/首尾移动不创建 Visit，保留备注时长与坐标；同日多次保留独立记录', () => {
  const store = setup(), [d1, d2, d3] = store.getState().days.map((day) => day.id)
  const places = structuredClone(store.getState().places)
  store.getState().addVisit(a, d1);store.getState().addVisit(b, d2)
  const id = store.getState().days[0].visitIds[0]
  store.getState().editVisit(id, { notes: '看日落', durationMinutes: 90 })
  const visit = store.getState().visits[id]
  store.getState().moveVisit(id, d3, 0)
  assert.equal(store.getState().visits[id], visit)
  store.getState().moveVisit(id, d2, 0)
  assert.equal(store.getState().days[1].visitIds[0], id)
  store.getState().moveVisit(id, d2, 2)
  assert.equal(store.getState().days[1].visitIds[1], id)
  store.getState().addVisit(a, d1)
  assert.equal(store.getState().moveVisit(id, d1, 0), true)
  assert.equal(store.getState().days[0].visitIds.length, 2)
  assert.equal(new Set(store.getState().days[0].visitIds).size, 2)
  assert.equal(store.getState().visits[id].notes, '看日落')
  assert.equal(store.getState().visits[id].durationMinutes, 90)
  assert.deepEqual(store.getState().places, places)
  invariant(store)
})

test('预览不改正式数据；结构已改变时拒绝提交旧拖动；备注变化保留', () => {
  const store = setup(), [d1, d2] = store.getState().days.map((day) => day.id)
  store.getState().addVisit(a, d1)
  const id = store.getState().days[0].visitIds[0], before = model(store), revision = store.getState().planRevision
  const preview = previewVisitMove(store.getState(), id, d2, 0)
  assert.equal(preview.days[1].visitIds[0], id)
  assert.deepEqual(model(store), before) // cancel simply discards preview
  store.getState().insertDay()
  assert.equal(store.getState().moveVisit(id, d2, 0, revision), false)
  assert.equal(store.getState().days[0].visitIds[0], id)
  const current = store.getState().planRevision
  store.getState().editVisit(id, { notes: '新备注' })
  assert.equal(store.getState().moveVisit(id, d2, 0, current), true)
  assert.equal(store.getState().visits[id].notes, '新备注')
  invariant(store)
})

test('反复跨天移动/同日排序/删除后，引用唯一，无丢失或重复', () => {
  const store = setup(), days = store.getState().days.map((day) => day.id)
  store.getState().addVisit(a, days[0]);store.getState().addVisit(b, days[0])
  const ids = [...store.getState().days[0].visitIds]
  for (let i = 0; i < 100; i++) {
    assert.equal(store.getState().moveVisit(ids[i % 2], days[i % 3], i % 2), true)
    invariant(store)
  }
  assert.deepEqual(Object.keys(store.getState().visits).sort(), ids.sort())
  store.getState().removeVisit(ids[0]);invariant(store)
  store.getState().removeVisit(ids[1]);invariant(store)
})

test('日期/数量/编辑范围验证，不接受不合法配置或破坏当前行程', () => {
  const store = setup(), before = model(store)
  for (const patch of [{ name: '' }, { city: '' }, { startDate: '2026-02-30' }, { dayCount: 0 }, { dayCount: 1.5 }, { dayCount: 31 }]) {
    assert.equal(store.getState().configureTrip({ ...settings, ...patch }).ok, false)
    assert.deepEqual(model(store), before)
  }
  store.getState().configureTrip({ ...settings, dayCount: 30 })
  assert.equal(store.getState().insertDay(), false)
  store.getState().addVisit(a, store.getState().days[0].id)
  const id = store.getState().days[0].visitIds[0]
  assert.equal(store.getState().editVisit(id, { notes: 'x'.repeat(2001) }), false)
  for (const value of [-1, NaN, 0.5, 1441]) assert.equal(store.getState().editVisit(id, { durationMinutes: value }), false)
  assert.equal(store.getState().editVisit(id, { durationMinutes: 0 }), true)
  invariant(store)
})

test('切日/跨天立即使旧道路失效；预览、备注和停留编辑不发道路请求', async () => {
  const store = setup(), [d1, d2] = store.getState().days.map((day) => day.id)
  store.getState().addVisit(a, d1);store.getState().addVisit(b, d1)
  const ids = [...store.getState().days[0].visitIds], calls = [], draws = []
  const controller = createRouteController({ store, delayMs: 1, clear() {}, draw: (legs) => draws.push(legs),
    request: (a, b, mode, signal) => new Promise((resolve) => calls.push({ signal, resolve })) })
  await tick(10)
  store.getState().editVisit(ids[0], { notes: '备注', durationMinutes: 120 })
  previewVisitMove(store.getState(), ids[0], d2, 0)
  await tick(10)
  assert.equal(calls.length, 1)
  store.getState().selectDay(d2)
  assert.equal(calls[0].signal.aborted, true)
  calls[0].resolve({ path: [[114, 30], [115, 31]], distance: 1234, time: 600 })
  await tick(0)
  assert.equal(draws.length, 0)
  assert.equal(store.getState().route.status, 'idle')
  store.getState().selectDay(d1)
  store.getState().moveVisit(ids[0], d2, 0)
  await tick(5)
  assert.equal(calls.length, 1)
  assert.equal(store.getState().activeDayId, d2)
  controller.destroy()
  assert.equal(FIRST_DAY_ID, d1)
})
