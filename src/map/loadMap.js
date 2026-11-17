import AMapLoader from '@amap/amap-jsapi-loader'

let pending

export function loadMapSdk(config) {
  if (!config.configured) return Promise.reject(new Error('请先完成高德地图配置。'))
  if (!pending) {
    // 高德要求：安全配置在 SDK 加载之前设置；SDK 只在线加载。
    window._AMapSecurityConfig = { securityJsCode: config.securityJsCode }
    pending = AMapLoader.load({
      key: config.key,
      version: '2.0',
      plugins: ['AMap.Scale', 'AMap.ToolBar', 'AMap.Walking', 'AMap.Driving', 'AMap.AutoComplete', 'AMap.PlaceSearch', 'AMap.DistrictSearch', 'AMap.DistrictLayer'],
    }).catch(() => {
      pending = undefined
      throw new Error('高德 SDK 加载失败，请检查网络、Key 类型和域名设置。')
    })
  }
  return pending
}
