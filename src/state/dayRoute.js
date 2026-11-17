export function dayStops(state, day) {
  const visits = day.visitIds.map((id, i) => ({ place: state.places[state.visits[id].placeId], label: String(i + 1), visitId: id }))
  // 尚未安排景点时不生成酒店到酒店的空转路线。
  if (!visits.length && (!day.startHotelId || !day.endHotelId || day.startHotelId === day.endHotelId)) return []
  const stops = []
  if (day.startHotelId && state.places[day.startHotelId]) stops.push({ place: state.places[day.startHotelId], label: '出发酒店' })
  stops.push(...visits)
  if (day.endHotelId && state.places[day.endHotelId]) stops.push({ place: state.places[day.endHotelId], label: '入住酒店' })
  return stops
}
export const legKey = (from, to) => JSON.stringify([from.visitId ?? `${from.label}:${from.place.id}`, to.visitId ?? `${to.label}:${to.place.id}`])
export function dayLegs(state, day) {
  const stops = dayStops(state, day)
  return stops.slice(1).map((to, i) => ({ from: stops[i], to, key: legKey(stops[i], to), mode: day.legModes?.[legKey(stops[i], to)] ?? state.routeMode }))
}
export function pruneLegModes(state) {
  return state.days.map(day => {
    if (!Object.keys(day.legModes ?? {}).length) return day
    const keys = new Set(dayLegs(state, day).map(leg => leg.key))
    const legModes = Object.fromEntries(Object.entries(day.legModes).filter(([key]) => keys.has(key)))
    return Object.keys(legModes).length === Object.keys(day.legModes).length ? day : { ...day, legModes }
  })
}
