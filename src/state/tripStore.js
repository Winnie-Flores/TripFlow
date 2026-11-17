import { createHistory } from './history.js'
import { dayLegs, pruneLegModes } from './dayRoute.js'
import { validTime } from './document.js'
import { archiveCurrent, createLibrary, parseLibrary, MAX_TRIPS } from './tripLibrary.js'
import { createDocument } from './document.js'
import { parseDocument } from './document.js'
import { createStore } from 'zustand/vanilla'
import { SHAPES, validCoordinates } from '../map/placeStyle.js'
import { catalog, withPopularPlaces } from '../data/catalog.js'
import { localDate, newDay, dateDays, validateSettings, retainVisits, previewVisitMove, MAX_DAYS } from './plan.js'

export const FIRST_DAY_ID = 'day-1'
export function createTripStore({ today = localDate() } = {}) {
  return createStore((rawSet, get) => {
    const history = createHistory(rawSet, get)
    const set = (patch, key) => { const update = typeof patch === 'function' ? patch(get()) : patch; const next = { ...get(), ...update }; if (update.days || update.visits) update.days = pruneLegModes(next); history.set(update, key) }
    return ({
    undoCount: 0, redoCount: 0, undo() { return history.move('undo') }, redo() { return history.move('redo') },
    placeFilter: { category: 'all', favoriteOnly: false, arrangedOnly: false },
    setPlaceFilter(patch) { set({ placeFilter: { ...get().placeFilter, ...patch } }) },
    trip: { id: `trip-${crypto.randomUUID()}`, name: '武汉，慢慢逛。', city: '武汉', startDate: today },
    tripRecords: {}, tripCreatedAt: new Date().toISOString(),
    cityInfo: { name: '武汉', adcode: '420100', center: [114.305, 30.593] }, focusPlaceId: null, focusRevision: 0,
    places: catalog('武汉'), visits: {}, days: [{ id: FIRST_DAY_ID, date: today, visitIds: [] }],
    activeDayId: FIRST_DAY_ID, planRevision: 0, documentEpoch: 0,
    routeScope: 'selected', routeMode: 'walking', route: { status: 'unavailable' }, routeRetryKey: 0,
    notice: '选中一天，从地图拖入地点开始安排。',
    checkpointTrip() {
      try { set({ tripRecords: archiveCurrent(get()) }); return true }
      catch (error) { set({ notice: `当前旅行未归档：${error.message}` }); return false }
    },
    restoreLibrary(content) {
      const library = parseLibrary(content), active = library.records[library.activeTripId]
      const data = withPopularPlaces(parseDocument(JSON.stringify(active.document)))
      set((state) => ({ ...data, tripRecords: library.records, tripCreatedAt: active.createdAt,
        documentEpoch: state.documentEpoch + 1, planRevision: state.planRevision + 1,
        placeFilter: { category:'all',favoriteOnly:false,arrangedOnly:false }, focusPlaceId: null, focusRevision: state.focusRevision + 1, route: { status: 'unavailable' }, routeRetryKey: 0,
        notice: '旅行记录已恢复，可继续规划或选择其他旅行。' }))
    },
    replaceDocument(content, { archiveCurrent: archive = true } = {}) {
      const data = withPopularPlaces(parseDocument(content)), state = get()
      const records = archive ? archiveCurrent(state) : {}
      if (!records[data.trip.id] && Object.keys(records).length >= MAX_TRIPS) throw new Error(`最多保存 ${MAX_TRIPS} 个旅行，请先导出并整理历史记录。`)
      const createdAt = records[data.trip.id]?.createdAt ?? new Date().toISOString()
      const next = { ...state, ...data, tripRecords: records, tripCreatedAt: createdAt }
      parseLibrary(JSON.stringify(createLibrary(next)))
      set({ ...data, tripRecords: records, tripCreatedAt: createdAt,
        planRevision: state.planRevision + 1, documentEpoch: state.documentEpoch + 1,
        placeFilter: { category:'all',favoriteOnly:false,arrangedOnly:false }, focusPlaceId: null, focusRevision: state.focusRevision + 1, route: { status: 'unavailable' },
        routeRetryKey: 0, notice: '旅行已载入，编号和道路将按当前行程重新生成。' })
    },
    createTrip(input) {
      const fresh = createTripStore({ today: input.startDate })
      const result = fresh.getState().configureTrip(input, { reset: true, confirmed: true })
      if (!result.ok) return result
      try { get().replaceDocument(JSON.stringify(createDocument(fresh.getState()))); return { ok: true } }
      catch (error) { return { ok: false, message: error.message } }
    },
    openTrip(tripId) {
      if (tripId === get().trip.id) return { ok: true }
      const record = get().tripRecords[tripId]
      if (!record) return { ok: false, message: '这条旅行记录已不存在。' }
      try { get().replaceDocument(JSON.stringify(record.document)); return { ok: true } }
      catch (error) { return { ok: false, message: error.message } }
    },
    setTripStatus(tripId, status) {
      const state = get()
      if (!['planned', 'visited'].includes(status)) return false
      if (tripId === state.trip.id) { set({ trip: { ...state.trip, status } }); return true }
      const record = state.tripRecords[tripId]
      if (!record) return false
      set({ tripRecords: { ...state.tripRecords, [tripId]: { ...record, updatedAt: new Date().toISOString(), document: { ...record.document, trip: { ...record.document.trip, status } } } } })
      return true
    },
    deleteTrip(tripId) {
      const state = get()
      if (tripId === state.trip.id) return { ok: false, message: '当前正在编辑的旅行不能删除，请先打开其他旅行。' }
      if (!Object.hasOwn(state.tripRecords, tripId)) return { ok: false, message: '旅行记录已不存在。' }
      const records = { ...state.tripRecords }; delete records[tripId]
      set({ tripRecords: records }); return { ok: true }
    },
    setNotice(notice) { set({ notice }) },
    selectDay(dayId) { if (get().days.some((day) => day.id === dayId)) set({ activeDayId: dayId }) },
    configureTrip(input, { reset = false, confirmed = false } = {}) {
      const validation = validateSettings(input)
      if (!validation.ok) { set({ notice: validation.message }); return validation }
      const { name, city, startDate, dayCount } = validation.settings
      const state = get(), cityChanged = city !== state.trip.city
      const discarded = reset || cityChanged ? state.days : state.days.slice(dayCount)
      const count = discarded.reduce((sum, day) => sum + day.visitIds.length, 0)
      const candidates = Object.values(state.places).filter((p) => !p.popular).length
      if (!confirmed && (reset || count > 0 || (cityChanged && candidates > 0))) return { ok: false, requiresConfirmation: true,
        message: reset ? `重建会开启一份空白规划，当前旅行将保留在旅行记录中，继续吗？`
          : cityChanged ? `切换城市将开启新的规划，当前 ${count} 次游览及 ${candidates} 个搜索地点会随原旅行保留在旅行记录中。继续吗？` : `缩短旅行会删除最后几天的 ${count} 次游览，继续吗？` }
      const rebuild = reset || cityChanged
      let days = rebuild ? [] : state.days.slice(0, dayCount)
      while (days.length < dayCount) { const hotel = days.at(-1)?.endHotelId ?? null; days.push({ ...newDay(), startHotelId: hotel, endHotelId: hotel }) }
      days = dateDays(days, startDate)
      let records = state.tripRecords
      if (rebuild) {
        try { records = archiveCurrent(state) } catch (error) { return { ok: false, message: error.message } }
        if (Object.keys(records).length >= MAX_TRIPS) return { ok: false, message: `最多保存 ${MAX_TRIPS} 个旅行，请先整理历史记录。` }
      }
      set({ tripRecords: records, tripCreatedAt: rebuild ? new Date().toISOString() : state.tripCreatedAt, trip: { id: rebuild ? `trip-${crypto.randomUUID()}` : state.trip.id, name, city, startDate, status: rebuild ? 'planned' : state.trip.status ?? 'planned' }, days,
        cityInfo: input.cityInfo?.name === city && validCoordinates(input.cityInfo.center) && /^\d{6}$/.test(input.cityInfo.adcode) ? input.cityInfo : cityChanged ? null : state.cityInfo,
        focusPlaceId: rebuild ? null : state.focusPlaceId,
        places: rebuild ? catalog(city) : state.places, visits: rebuild ? {} : retainVisits(state.visits, days),
        activeDayId: days.some((day) => day.id === state.activeDayId) ? state.activeDayId : days[0].id,
        planRevision: state.planRevision + 1,
        notice: rebuild ? '旅行已重建；日期从开始日连续安排。' : '旅行设置已保存；日期从开始日连续排列。' })
      return { ok: true }
    },
    insertDay(index = get().days.length) {
      const state = get()
      if (state.days.length >= MAX_DAYS) { set({ notice: `最多支持 ${MAX_DAYS} 天。` }); return false }
      if (!Number.isInteger(index) || index < 0 || index > state.days.length) return false
      const hotel = state.days[index - 1]?.endHotelId ?? state.days[index]?.startHotelId ?? null
      const day = { ...newDay(), startHotelId: hotel, endHotelId: hotel }, days = [...state.days]
      days.splice(index, 0, day)
      set({ days: dateDays(days, state.trip.startDate), activeDayId: day.id, planRevision: state.planRevision + 1,
        notice: '已插入一天；其后日期已连续顺延，已有内容保留。' })
      return true
    },
    removeDay(dayId, { confirmed = false } = {}) {
      const state = get(), index = state.days.findIndex((day) => day.id === dayId)
      if (index < 0 || state.days.length <= 1) { set({ notice: '旅行至少保留一天。' }); return { ok: false } }
      const day = state.days[index]
      if (day.visitIds.length && !confirmed) return { ok: false, requiresConfirmation: true,
        message: `第 ${index + 1} 天有 ${day.visitIds.length} 次游览，确认删除整天及其内容？` }
      const days = dateDays(state.days.filter((d) => d.id !== dayId), state.trip.startDate)
      set({ days, visits: retainVisits(state.visits, days),
        activeDayId: dayId === state.activeDayId ? days[Math.min(index, days.length - 1)].id : state.activeDayId,
        planRevision: state.planRevision + 1, notice: '已删除日期；其后日期连续前移，开始日期不变。' })
      return { ok: true }
    },
    addVisit(placeId, dayId, index) {
      const state = get(), day = state.days.find((d) => d.id === dayId)
      if (!day || !state.places[placeId]) return false
      if (Object.keys(state.visits).length >= 3000) { set({ notice: '游览最多 3000 次，请先精简旅行。' }); return false }
      const id = `visit-${crypto.randomUUID()}`, visitIds = [...day.visitIds]
      const position = Number.isInteger(index) ? Math.max(0, Math.min(index, visitIds.length)) : visitIds.length
      visitIds.splice(position, 0, id)
      set({ visits: { ...state.visits, [id]: { id, placeId, notes: '', durationMinutes: 60 } },
        days: state.days.map((d) => d.id === dayId ? { ...d, visitIds } : d), activeDayId: dayId,
        planRevision: state.planRevision + 1, notice: `已将${state.places[placeId].name}加入第 ${position + 1} 站。` })
      return true
    },
    removeVisit(visitId) {
      const state = get()
      if (!state.visits[visitId]) return
      const { [visitId]: removed, ...visits } = state.visits
      set({ visits, days: state.days.map((d) => ({ ...d, visitIds: d.visitIds.filter((id) => id !== visitId) })),
        planRevision: state.planRevision + 1, notice: `已移除${state.places[removed.placeId].name}。` })
    },
    editVisit(visitId, patch) {
      const state = get(), visit = state.visits[visitId]
      if (!visit) return false
      if (patch.fixedTime !== undefined && patch.fixedTime !== null && !validTime(patch.fixedTime)) return false
      const fixedTime = patch.fixedTime === undefined ? visit.fixedTime ?? null : patch.fixedTime
      const notes = patch.notes ?? visit.notes, durationMinutes = patch.durationMinutes ?? visit.durationMinutes
      if (typeof notes !== 'string' || notes.length > 2000 || !Number.isInteger(durationMinutes) || durationMinutes < 0 || durationMinutes > 1440) {
        set({ notice: '备注最多 2000 字；停留时长需为 0—1440 分钟的整数。' }); return false
      }
      if (notes !== visit.notes || durationMinutes !== visit.durationMinutes || fixedTime !== (visit.fixedTime ?? null)) set({
        visits: { ...state.visits, [visitId]: { ...visit, notes, durationMinutes, fixedTime } }, notice: '游览信息已更新。' }, `visit:${visitId}:${Object.keys(patch).sort().join()}`)
      return true
    },
    moveVisit(visitId, dayId, index, expectedRevision = get().planRevision) {
      const state = get()
      if (expectedRevision !== state.planRevision) { set({ notice: '拖动期间行程已变化，请重新拖动。' }); return false }
      const result = previewVisitMove(state, visitId, dayId, index)
      if (!result.ok) { set({ notice: result.message }); return false }
      set({ ...(result.changed ? { days: result.days, planRevision: state.planRevision + 1 } : {}),
        activeDayId: dayId, notice: result.changed ? '游览已移动，编号按所选日期更新。' : '游览已在此位置。' })
      return true
    },
    reorderVisit(dayId, activeId, overId) {
      const day = get().days.find((d) => d.id === dayId)
      if (!day || activeId === overId) return
      const from = day.visitIds.indexOf(activeId), to = day.visitIds.indexOf(overId)
      if (from < 0 || to < 0) return
      get().moveVisit(activeId, dayId, to + (from < to ? 1 : 0))
    },
    addCandidate(place, expectedTripId = get().trip.id, expectedEpoch = get().documentEpoch) {
      const state = get()
      if (state.documentEpoch !== expectedEpoch || state.trip.id !== expectedTripId || place.city !== state.trip.city || typeof place.sourceId !== 'string'
        || !place.sourceId || place.id !== `amap:${place.sourceId}` || !validCoordinates(place.coordinates)
        || typeof place.name !== 'string' || !place.name.trim()) return false
      const existing = state.places[place.id]
      if (!existing && Object.keys(state.places).length >= 500) { set({ notice: '候选地点最多 500 个，请先导出备份并精简旅行。' }); return false }
      set({ places: existing ? place.category === 'hotel' && existing.category !== 'hotel' ? { ...state.places, [place.id]: { ...existing, category: 'hotel' } } : state.places : { ...state.places, [place.id]: { ...place, shape: place.category === 'hotel' ? 'landmark' : 'star', color: '#bd7549', popular: false } },
        focusPlaceId: place.id, focusRevision: state.focusRevision + 1,
        notice: existing ? '此地点已在地图中，已定位；保留已有样式与行程。' : '已加入地图候选，尚未安排到行程。' })
      return true
    },
    focusPlace(placeId) {
      if (get().places[placeId]) set((state) => ({ focusPlaceId: placeId, focusRevision: state.focusRevision + 1 }))
    },
    editPlace(placeId, patch) {
      const state = get(), place = state.places[placeId]
      if (!place || (patch.shape !== undefined && !SHAPES.includes(patch.shape))
        || (patch.color !== undefined && !/^#[0-9a-f]{6}$/i.test(patch.color))) return false
      set({ places: { ...state.places, [placeId]: { ...place, shape: patch.shape ?? place.shape, color: patch.color ?? place.color } } })
      return true
    },
    toggleFavorite(placeId) { const place = get().places[placeId]; if (place) set({ places: { ...get().places, [placeId]: { ...place, favorite: !place.favorite } } }) },
    setDepartureTime(dayId, departureTime) { if (!validTime(departureTime) || !get().days.some(d => d.id === dayId)) return false; set({ days: get().days.map(d => d.id === dayId ? { ...d, departureTime } : d) }); return true },
    setLegMode(dayId, key, mode) {
      const state = get(), day = state.days.find(d => d.id === dayId)
      if (!day || !dayLegs(state, day).some(leg => leg.key === key) || !['default','walking','driving'].includes(mode)) return false
      const legModes = { ...day.legModes }; if (mode === 'default') delete legModes[key]; else legModes[key] = mode
      set({ days: state.days.map(d => d.id === dayId ? { ...d, legModes } : d) }); return true
    },
    applyModeToAll(routeMode) { if (['walking','driving'].includes(routeMode)) set({ routeMode, days: get().days.map(d => ({ ...d, legModes: {} })) }) },
    setDayHotels(dayId, patch) {
      const state = get(), index = state.days.findIndex(day => day.id === dayId)
      if (index < 0 || Object.keys(patch).some(key => !['startHotelId', 'endHotelId'].includes(key))) return false
      if (Object.values(patch).some(id => id !== null && state.places[id]?.category !== 'hotel')) return false
      const days = state.days.map((day, i) => i === index ? { ...day, ...patch }
        : i === index + 1 && Object.hasOwn(patch, 'endHotelId') ? { ...day, startHotelId: patch.endHotelId } : day)
      set({ days, planRevision: state.planRevision + 1, notice: '酒店已更新；入住酒店会作为次日默认出发点，可单独调整。' }); return true
    },
    setTripHotel(placeId) {
      const state = get()
      if (state.places[placeId]?.category !== 'hotel') return false
      set({ days: state.days.map(day => ({ ...day, startHotelId: placeId, endHotelId: placeId })), planRevision: state.planRevision + 1,
        notice: '已设为全程出发/入住酒店，各天仍可单独调整。' }); return true
    },
    setRouteScope(routeScope) { if (['selected', 'all'].includes(routeScope)) set({ routeScope }) },
    setRouteMode(routeMode) { if (['walking', 'driving'].includes(routeMode)) set({ routeMode }) },
    setRoute(route) { set({ route }) },
    retryRoute() { set((state) => ({ routeRetryKey: state.routeRetryKey + 1 })) },
  })})
}
export const tripStore = createTripStore()
export function getDayPlaces(state) {
  const day = state.days.find((d) => d.id === state.activeDayId)
  return (day?.visitIds ?? []).map((id) => state.places[state.visits[id].placeId])
}
