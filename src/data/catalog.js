import { WUHAN_PLACES } from './wuhan.js'
import { HANGZHOU_PLACES } from './hangzhou.js'
export const CITY_PLACES = { 武汉: WUHAN_PLACES, 杭州: HANGZHOU_PLACES }
export function catalog(city) {
  return Object.fromEntries((CITY_PLACES[city] ?? []).map(place => [place.id, { ...place, coordinates: [...place.coordinates] }]))
}
export function withPopularPlaces(data) {
  const places = { ...data.places }
  for (const [id, place] of Object.entries(catalog(data.trip.city))) {
    if (!Object.hasOwn(places, id) && Object.keys(places).length < 500) places[id] = place
  }
  return { ...data, places }
}
