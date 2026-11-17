export const SHAPES = ['star', 'circle', 'diamond', 'heart', 'landmark']
export const SHAPE_LABELS = { star: '五角星', circle: '圆形', diamond: '菱形', heart: '爱心', landmark: '分类图标' }
const paths = {
  shopping: 'M5 8h14l2 13H3ZM8 8V6a4 4 0 0 1 8 0v2M8 11v1m8-1v1',
  hotel: 'M3 20V7m0 7h18v6m-18-3h18M6 10h4v4H6Zm6 4V9h6l3 5M3 4v3',
  star: 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z',
  circle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  diamond: 'm12 2 9 10-9 10L3 12Z',
  heart: 'M12 21 3.5 12.5C-2 6 6 0 12 7c6-7 14-1 8.5 5.5Z',
  tower: 'M3 21h18M6 21V10h12v11M3 10h18l-4-4H7ZM9 6V3h6v3M10 14h4v7',
  food: 'M5 3v7m3-7v7M3 3v5a3 3 0 0 0 6 0V3M6 11v10M17 3c-4 4-4 9 0 9h3V3Zm0 9v9',
  museum: 'm2 8 10-6 10 6ZM3 21h18M5 11v7m7-7v7m7-7v7M3 18h18',
  school: 'm2 8 10-5 10 5-10 5ZM6 10v7q6 5 12 0v-7M22 8v9',
  water: 'M2 9q3-4 6 0t6 0 6 0M2 15q3-4 6 0t6 0 6 0M12 3v3',
  street: 'M6 21 10 3h4l4 18M12 5v3m0 4v3m0 4v2M2 21h20',
  bridge: 'M2 20V7m20 13V7M2 12q10-15 20 0M7 8v9m5-12v12m5-9v9M2 17h20',
  park: 'm12 2-7 8h3l-5 7h7v5h4v-5h7l-5-7h3Z',
}
export function iconSvg(place) {
  const key = place.shape === 'landmark' ? place.category : place.shape
  const path = paths[key] ?? paths.star
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`
}
export function validCoordinates(value) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
    && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90
}
export function coordinatesOf(location) {
  const point = Array.isArray(location) ? location : [location?.getLng?.() ?? location?.lng, location?.getLat?.() ?? location?.lat]
  return validCoordinates(point) ? [...point] : null
}
