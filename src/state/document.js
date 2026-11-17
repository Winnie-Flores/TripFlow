import { dayLegs } from './dayRoute.js'
import { validCoordinates, SHAPES } from '../map/placeStyle.js'
import { validDate, addDate, MAX_DAYS } from './plan.js'
export const SCHEMA_VERSION = 1
export const MAX_FILE_BYTES = 2 * 1024 * 1024
export const CATEGORIES = ['tower', 'food', 'museum', 'school', 'water', 'street', 'bridge', 'park', 'hotel', 'shopping']
const fail = (message) => { throw new Error(message) }
const text = (value, max, label, empty = false) => {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail(`${label}格式无效。`)
  return value
}
const id = (value) => {
  text(value, 150, 'ID')
  if (['__proto__', 'prototype', 'constructor'].includes(value) || !/^[a-zA-Z0-9:_-]+$/.test(value)) fail('ID 含有不支持的字符。')
  return value
}
const record = (value, keys, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) fail(`${label}结构无效或含未知字段。`)
}
const array = (value, max, label) => { if (!Array.isArray(value) || value.length > max) fail(`${label}数量超出范围。`) }
const pick = (value, keys) => Object.fromEntries(keys.map((key) => [key, value[key]]))
const placeKeys = ['id', 'sourceId', 'name', 'city', 'address', 'coordinates', 'color', 'shape', 'category', 'popular', 'adcode', 'favorite']
export function createDocument(state) {
  return { schemaVersion: SCHEMA_VERSION, trip: { ...pick(state.trip, ['id', 'name', 'city', 'startDate']), status: state.trip.status ?? 'planned' },
    cityInfo: state.cityInfo ? pick(state.cityInfo, ['name', 'adcode', 'center']) : null,
    places: Object.values(state.places).map((p) => ({ ...pick(p, placeKeys), adcode: p.adcode ?? null, favorite: p.favorite ?? false })),
    visits: Object.values(state.visits).map((v) => ({ ...pick(v, ['id', 'placeId', 'notes', 'durationMinutes']), fixedTime: v.fixedTime ?? null })),
    days: state.days.map((d) => ({ id: d.id, date: d.date, visitIds: [...d.visitIds], startHotelId: d.startHotelId ?? null, endHotelId: d.endHotelId ?? null, departureTime: d.departureTime ?? '09:00', legModes: d.legModes ?? {} })),
    settings: { activeDayId: state.activeDayId, routeMode: state.routeMode, routeScope: state.routeScope } }
}
export function validateDocument(value) {
  record(value, ['schemaVersion', 'trip', 'cityInfo', 'places', 'visits', 'days', 'settings'], '文件')
  if (value.schemaVersion !== SCHEMA_VERSION) fail('不支持此数据版本，请使用 TripFlow schemaVersion 1 的文件。')
  const { trip, cityInfo, places, visits, days, settings } = value
  record(trip, ['id', 'name', 'city', 'startDate', 'status'], '旅行')
  if (trip.status !== undefined && !['planned', 'visited'].includes(trip.status)) fail('旅行状态无效。')
  id(trip.id); text(trip.name, 80, '旅行名称'); text(trip.city, 30, '城市')
  if (!validDate(trip.startDate) || !validDate(addDate(trip.startDate, MAX_DAYS - 1))) fail('旅行开始日期无效。')
  if (cityInfo !== null) {
    record(cityInfo, ['name', 'adcode', 'center'], '城市定位')
    if (cityInfo.name !== trip.city || typeof cityInfo.adcode !== 'string' || !/^\d{6}$/.test(cityInfo.adcode) || !validCoordinates(cityInfo.center)) fail('城市定位与旅行不匹配。')
  }
  array(places, 500, '地点'); array(visits, 3000, '游览'); array(days, MAX_DAYS, '日期')
  if (!days.length) fail('旅行至少保留一天。')
  const usedIds = new Set([trip.id]), placeMap = {}, visitMap = {}, seenDays = new Set()
  const unique = (value) => { id(value); if (usedIds.has(value)) fail('文件存在重复 ID。'); usedIds.add(value) }
  for (const p of places) {
    record(p, placeKeys, '地点'); unique(p.id); text(p.sourceId, 100, '地点来源 ID')
    if (!/^[a-zA-Z0-9_-]+$/.test(p.sourceId) || p.id !== `amap:${p.sourceId}`) fail('地点 ID 与来源 ID 不匹配。')
    text(p.name, 150, '地点名称'); text(p.address, 1000, '地点地址', true)
    if (p.city !== trip.city || !validCoordinates(p.coordinates)) fail('地点城市或坐标无效。')
    if (!SHAPES.includes(p.shape) || !CATEGORIES.includes(p.category) || typeof p.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(p.color) || typeof p.popular !== 'boolean') fail('地点样式无效。')
    if (p.adcode !== null && (typeof p.adcode !== 'string' || !/^\d{6}$/.test(p.adcode))) fail('地点行政区代码无效。')
    const prefix = ['110000', '120000', '310000', '500000'].includes(cityInfo?.adcode) ? 2 : 4
    if (cityInfo && p.adcode && p.adcode.slice(0, prefix) !== cityInfo.adcode.slice(0, prefix)) fail('地点不属于文件中的旅行城市。')
    if (p.favorite !== undefined && typeof p.favorite !== 'boolean') fail('收藏状态无效。')
    placeMap[p.id] = { ...p, favorite: p.favorite ?? false, coordinates: [...p.coordinates] }
  }
  for (const v of visits) {
    record(v, ['id', 'placeId', 'notes', 'durationMinutes', 'fixedTime'], '游览'); unique(v.id); id(v.placeId)
    if (!Object.hasOwn(placeMap, v.placeId)) fail('游览引用了不存在的地点。')
    text(v.notes, 2000, '备注', true)
    if (!Number.isInteger(v.durationMinutes) || v.durationMinutes < 0 || v.durationMinutes > 1440) fail('停留时长无效。')
    if (v.fixedTime != null && !validTime(v.fixedTime)) fail('预约时间无效。')
    visitMap[v.id] = { ...v, fixedTime: v.fixedTime ?? null }
  }
  const references = new Set()
  const cleanDays = days.map((d, index) => {
    record(d, ['id', 'date', 'visitIds', 'startHotelId', 'endHotelId', 'departureTime', 'legModes'], '日期'); unique(d.id); seenDays.add(d.id)
    if (d.date !== addDate(trip.startDate, index)) fail('日期必须从开始日连续排列。')
    array(d.visitIds, 500, '每日游览')
    for (const ref of d.visitIds) {
      id(ref)
      if (!Object.hasOwn(visitMap, ref) || references.has(ref)) fail('日期包含重复或不存在的游览引用。')
      references.add(ref)
    }
    for (const field of ['startHotelId', 'endHotelId']) {
      if (d[field] != null && (typeof d[field] !== 'string' || !Object.hasOwn(placeMap, d[field]) || placeMap[d[field]].category !== 'hotel')) fail('酒店引用不存在或不是酒店。')
    }
    if (d.departureTime !== undefined && !validTime(d.departureTime)) fail('出发时间无效。')
    const legModes = d.legModes ?? {}
    if (!legModes || typeof legModes !== 'object' || Array.isArray(legModes) || Object.keys(legModes).length > 501) fail('分段交通结构无效。')
    const validKeys = new Set(dayLegs({ places: placeMap, visits: visitMap, routeMode: settings?.routeMode }, d).map(leg => leg.key))
    if (Object.entries(legModes).some(([key, mode]) => !validKeys.has(key) || !['walking','driving'].includes(mode))) fail('分段交通引用或方式无效。')
    return { ...d, departureTime: d.departureTime ?? '09:00', legModes: { ...legModes }, visitIds: [...d.visitIds], startHotelId: d.startHotelId ?? null, endHotelId: d.endHotelId ?? null }
  })
  if (references.size !== visits.length) fail('文件含有未归属任何日期的游览。')
  record(settings, ['activeDayId', 'routeMode', 'routeScope'], '偏好设置')
  if (!seenDays.has(settings.activeDayId) || !['walking', 'driving'].includes(settings.routeMode) || !['selected', 'all'].includes(settings.routeScope)) fail('日期或交通偏好无效。')
  return { trip: { ...trip, status: trip.status ?? 'planned' }, cityInfo: cityInfo ? { ...cityInfo, center: [...cityInfo.center] } : null,
    places: placeMap, visits: visitMap, days: cleanDays, ...settings }
}
export function parseDocument(content) {
  if (typeof content !== 'string' || new TextEncoder().encode(content).length > MAX_FILE_BYTES) fail('文件不能超过 2 MB。')
  let value
  try { value = JSON.parse(content) } catch { fail('文件不是有效的 JSON。') }
  return validateDocument(value)
}

export const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
