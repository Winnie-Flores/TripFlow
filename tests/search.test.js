import { HANGZHOU_PLACES } from '../src/data/hangzhou.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as tick } from 'node:timers/promises'
import { createSearchController } from '../src/map/searchController.js'
import { createSearchService, poiToPlace, searchCities } from '../src/map/searchService.js'
import { createTripStore } from '../src/state/tripStore.js'
import { routeSnapshot } from '../src/map/routeController.js'
import { WUHAN_PLACES } from '../src/data/wuhan.js'
const city = { name: '武汉', adcode: '420100' }
const poi = (id, extra = {}) => ({ id, name: '同名咖啡馆', address: '具体地址', adcode: '420106', location: { lng: 114.3, lat: 30.5 }, ...extra })
test('快速输入、清空、切城销毁、详情解析迟到均不发布旧结果或地点', async () => {
  const calls = [], resolved = [], updates = [], places = []
  const controller = createSearchController({ delayMs: 1, search: (q, signal) => new Promise((resolve) => calls.push({ q, signal, resolve })),
    resolve: (item, signal) => new Promise((resolve) => resolved.push({ item, signal, resolve })), onChange: (s) => updates.push(s), onPlace: (p) => places.push(p) })
  controller.query('旧'); await tick(5); controller.query('新')
  assert.equal(calls[0].signal.aborted, true); calls[0].resolve([poi('old')]); await tick(5)
  assert.equal(updates.at(-1).status, 'loading')
  calls[1].resolve([poi('new')]); await tick(0); assert.equal(updates.at(-1).results[0].id, 'new')
  void controller.select(poi('detail', { location: null })); controller.query('')
  resolved[0].resolve(poiToPlace(poi('detail'), city)); await tick(0)
  assert.equal(places.length, 0); assert.equal(updates.at(-1).status, 'idle')
  controller.query('最后'); await tick(5); controller.destroy(); calls.at(-1).resolve([poi('late')]); await tick(0)
  assert.equal(updates.at(-1).status, 'loading'); assert.equal(places.length, 0)
})
test('缺坐标按精确来源 ID 查详情，拒绝不匹配 ID、区域提示及异城地点', async () => {
  let requested
  class Detail { getDetails(id, cb) { requested = id; cb('complete', { poiList: { pois: [poi(id)] } }) } clear() {} }
  const service = createSearchService({ PlaceSearch: Detail }, city)
  const place = await service.resolve(poi('exact', { location: [] }))
  assert.equal(requested, 'exact'); assert.equal(place.shape, 'star'); assert.deepEqual(place.coordinates, [114.3, 30.5])
  assert.equal(poiToPlace(poi('sh', { adcode: '310101' }), { name: '上海', adcode: '310000' }).city, '上海')
  assert.equal(poiToPlace(poi('bj', { adcode: '110105' }), { name: '北京', adcode: '110000' }).city, '北京')
  assert.throws(() => poiToPlace(poi('other', { adcode: '310101' }), city), /不在当前城市/)
  await assert.rejects(service.resolve({ name: '只有区域' }), /区域或非 POI/)
  class Mismatch { getDetails(id, cb) { cb('complete', { poiList: { pois: [poi('different')] } }) } }
  await assert.rejects(createSearchService({ PlaceSearch: Mismatch }, city).resolve({ id: 'requested', name: '名称' }), /准确详情/)
})
test('同名不同 ID 均保留，重复来源不新增、不覆盖用户样式，切城候选受确认保护', () => {
  const store = createTripStore(), state = () => store.getState(), a = poiToPlace(poi('a'), city), b = poiToPlace(poi('b', { address: '另一个地址' }), city)
  assert.equal(state().addCandidate(a), true); assert.equal(state().addCandidate(b), true)
  assert.equal(Object.keys(state().places).length, WUHAN_PLACES.length + 2)
  const day = state().days[0].id; state().addVisit(a.id, day)
  const signature = routeSnapshot(state()).signature
  assert.equal(state().editPlace(a.id, { shape: 'heart', color: '#123abc' }), true)
  assert.equal(state().addCandidate(a), true); assert.equal(state().places[a.id].shape, 'heart')
  assert.equal(routeSnapshot(state()).signature, signature)
  assert.equal(state().editPlace(a.id, { color: 'red', shape: 'invalid' }), false)
  assert.equal(state().editPlace(a.id, { coordinates: [0, 0] }), true)
  assert.deepEqual(state().places[a.id].coordinates, [114.3, 30.5])
  const oldId = state().trip.id
  const settings = { ...state().trip, city: '杭州', dayCount: 1, cityInfo: { name: '杭州', adcode: '330100', center: [120, 30] } }
  assert.equal(state().configureTrip(settings).requiresConfirmation, true)
  assert.equal(state().trip.id, oldId)
  state().configureTrip(settings, { confirmed: true }); assert.equal(Object.keys(state().places).length, HANGZHOU_PLACES.length)
  assert.equal(state().addCandidate(a, oldId), false); assert.equal(Object.keys(state().visits).length, 0)
})
test('限定城市搜索按 ID 去重而非按名称，服务失败可重试，城市仅接受城市级或直辖市', async () => {
  class Auto { constructor(opts) { assert.equal(opts.citylimit, true) } search(q, cb) { cb('complete', { tips: [poi('a'), poi('b'), poi('a')] }) } }
  assert.deepEqual((await createSearchService({ AutoComplete: Auto }, city).search('同名')).map((p) => p.id), ['a', 'b'])
  class District { search(q, cb) { cb('complete', { districtList: [
    { level: 'city', name: '杭州市', adcode: '330100', center: { lng: 120, lat: 30 } },
    { level: 'province', name: '上海市', adcode: '310000', center: [121, 31] },
    { level: 'province', name: '湖北省', adcode: '420000', center: [114, 30] },
    { level: 'district', name: '武昌区', adcode: '420106', center: [114, 30] },
  ] }) } }
  assert.deepEqual((await searchCities({ DistrictSearch: District }, '城市')).map((c) => c.name), ['杭州', '上海'])
  class Failed { search(q, cb) { cb('error', {}) } }
  await assert.rejects(createSearchService({ AutoComplete: Failed }, city).search('测试'), /查询失败/)
})
