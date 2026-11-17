import { coordinatesOf } from './placeStyle.js'
const aborted = () => new DOMException('查询已取消', 'AbortError')
// 全部搜索类插件共用串行队列，取消等待不会继续发请求。
let tail = Promise.resolve(), lastStart = 0
function enqueue(task, signal) {
  const promise = tail.catch(() => {}).then(async () => {
    if (signal?.aborted) throw aborted()
    const remaining = 1100 - (Date.now() - lastStart)
    if (remaining > 0) await new Promise((resolve) => {
      const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', done); resolve() }
      const timer = setTimeout(done, remaining)
      signal?.addEventListener('abort', done, { once: true })
    })
    if (signal?.aborted) throw aborted()
    lastStart = Date.now()
    return task()
  })
  tail = promise.catch(() => {})
  return promise
}
export function sdkQuery(Service, options, method, keyword, signal) {
  return enqueue(() => new Promise((resolve, reject) => {
    let settled = false, service
    const finish = (error, value) => {
      if (settled) return
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort)
      service?.clear?.()
      if (error) reject(error); else resolve(value)
    }
    const abort = () => finish(aborted())
    const timer = setTimeout(() => finish(new Error('查询超时，请稍后重试。')), 12000)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) { abort(); return }
    try {
      if (!Service) throw new Error('搜索服务未就绪，请重试加载地图。')
      service = new Service(options)
      service[method](keyword, (status, result) => {
        if (status === 'no_data') finish(null, {})
        else if (status !== 'complete') finish(new Error('查询失败，请检查网络或服务配额后重试。'))
        else finish(null, result)
      })
    } catch (error) { finish(error) }
  }), signal)
}
export function categoryOf(type = '') {
  if (/酒店|住宿|宾馆|旅馆|民宿|^10/.test(type)) return 'hotel'
  if (/商场|购物|百货|^06/.test(type)) return 'shopping'
  if (/餐|咖啡|茶|^05/.test(type)) return 'food'
  if (/博物|展览|文化|^1401/.test(type)) return 'museum'
  if (/学校|教育|^14/.test(type)) return 'school'
  if (/公园|风景|^11/.test(type)) return 'park'
  if (/桥/.test(type)) return 'bridge'
  return 'street'
}
export function poiToPlace(poi, city, fallback = {}) {
  const id = typeof poi?.id === 'string' ? poi.id.trim() : ''
  const coordinates = coordinatesOf(poi?.location)
  if (!id || !coordinates || typeof poi.name !== 'string' || !poi.name.trim()) throw new Error('此结果缺少准确 POI ID 或坐标，请选择带具体地址的其他地点。')
  // 自动提示有 adcode；详情有时无 adcode，此时依赖限定城市的原结果。
  const code = typeof poi.adcode === 'string' ? poi.adcode : fallback.adcode
  const prefix = ['110000', '120000', '310000', '500000'].includes(city.adcode) ? 2 : 4
  if (city.adcode && code && String(code).slice(0, prefix) !== city.adcode.slice(0, prefix)) throw new Error('此地点不在当前城市，请切换城市后再安排。')
  const address = [poi.district, typeof poi.address === 'string' ? poi.address : fallback.address].filter((v) => typeof v === 'string' && v).join(' · ')
  return { id: `amap:${id}`, sourceId: id, name: poi.name.trim(), city: city.name,
    adcode: code || city.adcode, coordinates, address: address || '服务未提供地址',
    shape: 'star', color: '#bd7549', category: categoryOf(poi.type || poi.typecode), popular: false }
}
export function createSearchService(AMap, city, kind = 'place') {
  const options = { city: city.adcode || city.name, citylimit: true, ...(kind === 'hotel' ? { type: '住宿服务' } : {}) }
  return {
    async search(query, signal, full = false) {
      const result = full
        ? await sdkQuery(AMap.PlaceSearch, { ...options, pageSize: 10 }, 'search', query, signal)
        : await sdkQuery(AMap.AutoComplete, options, 'search', query, signal)
      const rows = full ? result.poiList?.pois : result.tips
      const seen = new Set()
      return (rows ?? []).filter((item) => {
        // 不合并同名不同地址，只合并同一个稳定来源 ID。
        if (!item.id || typeof item.id !== 'string') return true
        if (seen.has(item.id)) return false
        seen.add(item.id); return true
      })
    },
    async resolve(item, signal) {
      if (typeof item?.id !== 'string' || !item.id.trim()) throw new Error('这是区域或非 POI 提示，无法精确定位；请点击“搜索地点”获取具体地点。')
      if (coordinatesOf(item.location)) { const place = poiToPlace(item, city); return kind === 'hotel' ? { ...place, category: 'hotel', shape: 'landmark' } : place }
      const result = await sdkQuery(AMap.PlaceSearch, options, 'getDetails', item.id, signal)
      const poi = result.poiList?.pois?.find((poi) => poi.id === item.id)
      if (!poi) throw new Error('未查询到该 POI 的准确详情，请选择其他结果。')
      const place = poiToPlace(poi, city, item)
      return kind === 'hotel' ? { ...place, category: 'hotel', shape: 'landmark' } : place
    },
  }
}
export const normalizeCity = (name) => name.trim().replace(/市$/, '')
export async function searchCities(AMap, query, signal) {
  const result = await sdkQuery(AMap.DistrictSearch, { level: 'city', subdistrict: 0, extensions: 'base' }, 'search', query, signal)
  return (result.districtList ?? []).filter((row) => row.level === 'city' || (row.level === 'province' && /^(北京|上海|天津|重庆)市?$/.test(row.name)))
    .map((row) => ({ name: normalizeCity(row.name), adcode: String(row.adcode), center: coordinatesOf(row.center) }))
    .filter((row) => /^\d{6}$/.test(row.adcode) && row.center)
}
