import test from 'node:test'
import assert from 'node:assert/strict'
import { createTripStore, FIRST_DAY_ID } from '../src/state/tripStore.js'
import { WUHAN_PLACES } from '../src/data/wuhan.js'
const [a, b] = WUHAN_PLACES.map((place) => place.id)

test('地图新增 Visit、指定首尾插入、同日重复创建独立游览，保持地点与坐标不变', () => {
  const store = createTripStore()
  const places = structuredClone(store.getState().places)
  assert.equal(store.getState().addVisit(a, FIRST_DAY_ID), true)
  assert.equal(store.getState().addVisit(b, FIRST_DAY_ID, 0), true)
  const state = store.getState()
  assert.deepEqual(state.days[0].visitIds.map((id) => state.visits[id].placeId), [b, a])
  assert.equal(state.addVisit(a, FIRST_DAY_ID), true)
  assert.equal(Object.keys(store.getState().visits).length, 3)
  assert.equal(new Set(store.getState().days[0].visitIds).size, 3)
  assert.deepEqual(store.getState().places, places)
  assert.equal(state.addVisit('external', FIRST_DAY_ID), false)
})

test('排序移动原 Visit，非法/相同落点不变；删除清理引用；重新添加生成新 ID', () => {
  const store = createTripStore()
  store.getState().addVisit(a, FIRST_DAY_ID)
  store.getState().addVisit(b, FIRST_DAY_ID)
  const ids = [...store.getState().days[0].visitIds]
  store.getState().reorderVisit(FIRST_DAY_ID, ids[0], ids[1])
  assert.deepEqual(store.getState().days[0].visitIds, [ids[1], ids[0]])
  const ordered = store.getState().days[0].visitIds
  store.getState().reorderVisit(FIRST_DAY_ID, ids[0], 'invalid')
  assert.equal(store.getState().days[0].visitIds, ordered)
  store.getState().removeVisit(ids[0])
  assert.equal(store.getState().visits[ids[0]], undefined)
  assert.deepEqual(store.getState().days[0].visitIds, [ids[1]])
  store.getState().addVisit(a, FIRST_DAY_ID)
  assert.notEqual(store.getState().days[0].visitIds[1], ids[0])
})

test('数据模型允许不同日期安排同一 Place，各有独立 Visit', () => {
  const store = createTripStore()
  store.setState({ days: [...store.getState().days, { id: 'day-2', date: null, visitIds: [] }] })
  store.getState().addVisit(a, FIRST_DAY_ID)
  store.getState().addVisit(a, 'day-2')
  const state = store.getState()
  assert.notEqual(state.days[0].visitIds[0], state.days[1].visitIds[0])
  assert.equal(Object.keys(state.visits).length, 2)
})
