// 城市足迹只使用旅行已确认的城市坐标，不将候选景点误作去过的地点。
export function footprints(records) {
  const cities = new Map(), missing = []
  for (const { document: doc } of records) {
    const name = doc.trip.city.replace(/市$/, ''), status = doc.trip.status === 'visited' ? 'visited' : 'planned'
    if (!cities.has(name)) cities.set(name, { name, coordinates: null, adcode: null, visited: 0, planned: 0 })
    const city = cities.get(name)
    city[status]++
    if (doc.cityInfo?.center) { city.coordinates = [...doc.cityInfo.center]; city.adcode = doc.cityInfo.adcode ?? null }
  }
  for (const city of cities.values()) if (!city.coordinates) missing.push(city.name)
  return { cities: [...cities.values()].filter(city => city.coordinates), missing }
}
