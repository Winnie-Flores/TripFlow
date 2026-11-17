import { matchesPlace, arrangedIds } from '../state/placeFilters.js'
import { dayColor } from './routeStyle.js'
import { createPlaceMarker } from './placeMarker.js'
import { tripStore, getDayPlaces } from '../state/tripStore.js'

export function attachPlaceLayer({ map, AMap, container }) {
  const entries = new Map()
  let lastFocus = -1
  const addEntry = (place) => {
    const view = createPlaceMarker(place, (placeId) => {
      const state = tripStore.getState()
      if (state.places[placeId]?.category === 'hotel') state.setTripHotel(placeId)
      else state.addVisit(placeId, state.activeDayId)
    }, map)
    let marker
    if (map) {
      marker = new AMap.Marker({ position: [...place.coordinates], content: view.element,
        anchor: 'center', draggable: false, bubble: false, title: place.name })
      marker.setMap(map)
      view.element.addEventListener('mouseenter', () => marker.setzIndex?.(300))
      view.element.addEventListener('mouseleave', () => marker.setzIndex?.(tripStore.getState().focusPlaceId === place.id ? 250 : 100))
    } else {
      // 演示中按卡片网格布局，不使用伪造地图或道路。
      container.append(view.element)
    }
    return { place, view, marker }
  }
  const sync = () => {
    const state = tripStore.getState()
    for (const [id, entry] of entries) {
      if (!state.places[id]) { entry.view.destroy(); entry.marker?.setMap(null); entries.delete(id) }
    }
    for (const place of Object.values(state.places)) if (!entries.has(place.id)) entries.set(place.id, addEntry(place))
    const ordered = getDayPlaces(state), arranged = arrangedIds(state)
    entries.forEach(({ place, view, marker }) => {
      place = state.places[place.id]
      const visible = arranged.has(place.id) || matchesPlace(place, state.placeFilter, arranged)
      view.element.style.display = visible ? '' : 'none'
      view.element.classList.toggle('is-focused', state.focusPlaceId === place.id)
      marker?.setzIndex?.(state.focusPlaceId === place.id ? 250 : 100)
      view.update(state.routeScope === 'all' ? [] : ordered.flatMap((p, i) => p.id === place.id ? [i + 1] : []), place)
      view.element.querySelector('.day-pin-labels')?.remove()
      if (state.routeScope === 'all' || state.days.some(day => day.id === state.activeDayId && (day.startHotelId === place.id || day.endHotelId === place.id))) {
        const labels = document.createElement('div')
        labels.className = 'day-pin-labels'
        state.days.forEach((day, index) => {
          if (state.routeScope !== 'all' && day.id !== state.activeDayId) return
          const positions = day.visitIds.flatMap((id, i) => state.visits[id].placeId === place.id ? [i + 1] : [])
          const hotel = [day.startHotelId === place.id ? '出发' : '', day.endHotelId === place.id ? '入住' : ''].filter(Boolean)
          if (!positions.length && !hotel.length) return
          const badge = document.createElement('span')
          badge.style.backgroundColor = dayColor(index)
          badge.textContent = `第${index + 1}天 · ${[positions.join('·'), ...hotel].filter(Boolean).join(' / ')}`
          labels.append(badge)
        })
        view.element.append(labels)
      }
    })
    if (lastFocus !== state.focusRevision) {
      lastFocus = state.focusRevision
      const focused = state.places[state.focusPlaceId]
      if (focused && map) map.setZoomAndCenter?.(16, focused.coordinates, true)
    }
  }
  sync()
  const unsubscribe = tripStore.subscribe(sync)
  if (map && entries.size) map.setFitView([...entries.values()].map((entry) => entry.marker), true, [100, 100, 100, 100], 16)
  const detach = () => {
    unsubscribe()
    entries.forEach(({ marker, view }) => { view.destroy(); marker?.setMap(null) })
  }
  detach.fit = () => {
    if (!map || !entries.size) return
    const state = tripStore.getState()
    const arranged = state.routeScope === 'all'
      ? state.days.flatMap((day) => day.visitIds.map((id) => state.visits[id].placeId))
      : getDayPlaces(state).map((place) => place.id)
    for (const day of state.days.filter(day => state.routeScope === 'all' || day.id === state.activeDayId)) { if (day.startHotelId) arranged.push(day.startHotelId); if (day.endHotelId) arranged.push(day.endHotelId) }
    const ids = arranged.length ? new Set(arranged) : state.focusPlaceId ? new Set([state.focusPlaceId]) : new Set(entries.keys())
    map.setFitView([...entries].filter(([id]) => ids.has(id)).map(([, entry]) => entry.marker), true, [70, 80, 70, 80], 16)
  }
  return detach
}
