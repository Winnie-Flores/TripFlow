export const MAX_DAYS = 30
export function localDate() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function addDate(value, offset) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}
export function dateDays(days, startDate) {
  return days.map((day, index) => ({ ...day, date: addDate(startDate, index) }))
}
export function newDay() { return { id: `day-${crypto.randomUUID()}`, date: null, visitIds: [] } }
export function validateSettings(input) {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const city = typeof input.city === 'string' ? input.city.trim().replace(/市$/, '') : ''
  const dayCount = Number(input.dayCount)
  if (!name || name.length > 80) return { ok: false, message: '旅行名称需为 1—80 个字符。' }
  if (!city || city.length > 30) return { ok: false, message: '城市需为 1—30 个字符。' }
  if (!validDate(input.startDate) || !validDate(addDate(input.startDate, MAX_DAYS - 1))) return { ok: false, message: '请输入有效的开始日期。' }
  if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > MAX_DAYS) return { ok: false, message: `天数需为 1—${MAX_DAYS} 的整数。` }
  return { ok: true, settings: { name, city, startDate: input.startDate, dayCount } }
}
export function retainVisits(visits, days) {
  const retained = new Set(days.flatMap((day) => day.visitIds))
  return Object.fromEntries(Object.entries(visits).filter(([id]) => retained.has(id)))
}

// index 指目标日期在移动前的插入边界；同日移除自身后修正一次，不维护 sortOrder。
export function previewVisitMove(state, visitId, targetDayId, index) {
  const visit = state.visits[visitId]
  const source = state.days.find((day) => day.visitIds.includes(visitId))
  const target = state.days.find((day) => day.id === targetDayId)
  if (!visit || !source || !target) return { ok: false, message: '拖动来源或日期已不存在。' }
  let position = Number.isInteger(index) ? Math.max(0, Math.min(index, target.visitIds.length)) : target.visitIds.length
  if (source.id === target.id && source.visitIds.indexOf(visitId) < position) position--
  const targetIds = target.visitIds.filter((id) => id !== visitId)
  targetIds.splice(position, 0, visitId)
  const days = state.days.map((day) => day.id === target.id ? { ...day, visitIds: targetIds }
    : day.id === source.id ? { ...day, visitIds: day.visitIds.filter((id) => id !== visitId) } : day)
  return { ok: true, days, changed: days.some((day, i) => day.visitIds.join('|') !== state.days[i].visitIds.join('|')) }
}
