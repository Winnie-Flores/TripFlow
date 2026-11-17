// 行政边界由高德中国行政区图层提供；只保存旅行状态，不保存服务几何。
export const FOOTPRINT_COLORS = { unvisited: '#dce1df', visited: '#3f8c73', planned: '#dfad79' }
const municipalities = ['11', '12', '31', '50']
export function cityCode(value) {
  const code = String(value ?? '')
  if (!/^\d{6}$/.test(code)) return null
  return municipalities.includes(code.slice(0, 2)) ? `${code.slice(0, 2)}0000` : `${code.slice(0, 4)}00`
}
export function footprintRegionCity(properties, cities) {
  // adcode_cit 为市级编码；直辖市统一匹配其省级行政编码。
  if (properties.SOC && properties.SOC !== 'CHN') return null
  const code = cityCode(properties.adcode_cit ?? properties.adcode)
  if (!code) return null
  return cities.find(city => cityCode(city.adcode) === code) ?? null
}
export function chinaFootprintStyles(cities) {
  return {
    'stroke-width': 1,
    'nation-stroke': '#7c8983', 'coastline-stroke': '#7c8983',
    'province-stroke': '#a6b0ab', 'city-stroke': '#f6f7f5',
    fill: properties => {
      const city = footprintRegionCity(properties, cities)
      return city?.visited ? FOOTPRINT_COLORS.visited : city?.planned ? FOOTPRINT_COLORS.planned : FOOTPRINT_COLORS.unvisited
    },
  }
}
export function createChinaFootprintLayer(AMap, cities) {
  if (!AMap.DistrictLayer?.Country) throw new Error('中国行政区图层未加载，请重试。')
  return new AMap.DistrictLayer.Country({ SOC: 'CHN', depth: 2, zIndex: 10, zooms: [2, 10], styles: chinaFootprintStyles(cities) })
}
