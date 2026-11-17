import { createDocument, parseDocument } from './document.js'
export const LIBRARY_KEY = 'tripflow.trips.v1'
export const MAX_TRIPS = 50
export const MAX_LIBRARY_BYTES = 4 * 1024 * 1024
export function createLibrary(state, updatedAt) {
  const document = createDocument(state)
  const existing = state.tripRecords?.[state.trip.id]
  const current = { document, createdAt: existing?.createdAt ?? state.tripCreatedAt,
    updatedAt: [updatedAt, existing?.updatedAt, state.tripCreatedAt].filter(Boolean).sort().at(-1) }
  return { schemaVersion: 1, activeTripId: state.trip.id,
    records: Object.values({ ...state.tripRecords, [state.trip.id]: current }) }
}
export function parseLibrary(content) {
  if (typeof content !== 'string' || new TextEncoder().encode(content).length > MAX_LIBRARY_BYTES) throw new Error('旅行记录总大小不能超过 4 MB。')
  let data
  try { data = JSON.parse(content) } catch { throw new Error('旅行记录不是有效 JSON。') }
  const plain = (v) => v && typeof v === 'object' && !Array.isArray(v)
  if (!plain(data) || data.schemaVersion !== 1) throw new Error('不支持此旅行记录版本。')
  if (Object.keys(data).some(k => !['schemaVersion', 'activeTripId', 'records'].includes(k)) || !Array.isArray(data.records)
    || !data.records.length || data.records.length > MAX_TRIPS) throw new Error('旅行记录结构或数量无效。')
  const records = {}
  for (const record of data.records) {
    if (!plain(record) || Object.keys(record).some(k => !['document', 'createdAt', 'updatedAt'].includes(k))) throw new Error('旅行记录条目无效。')
    for (const field of ['createdAt', 'updatedAt']) {
      if (typeof record[field] !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(record[field]) || !Number.isFinite(Date.parse(record[field]))) throw new Error('旅行记录时间无效。')
    }
    const state = parseDocument(JSON.stringify(record.document)), id = state.trip.id
    if (Object.hasOwn(records, id)) throw new Error('旅行记录 ID 重复。')
    records[id] = { createdAt: new Date(record.createdAt).toISOString(), updatedAt: new Date(record.updatedAt).toISOString(), document: createDocument(state) }
  }
  if (typeof data.activeTripId !== 'string' || !Object.hasOwn(records, data.activeTripId)) throw new Error('当前旅行引用无效。')
  return { records, activeTripId: data.activeTripId }
}
export function archiveCurrent(state) {
  const document = createDocument(parseDocument(JSON.stringify(createDocument(state))))
  const existing = state.tripRecords?.[state.trip.id]
  const records = { ...state.tripRecords, [state.trip.id]: { document,
    createdAt: existing?.createdAt ?? state.tripCreatedAt, updatedAt: existing && JSON.stringify(existing.document) === JSON.stringify(document) ? existing.updatedAt : new Date().toISOString() } }
  return records
}
