// Modified from mirrorxyjiang/travel-planner src/map.js fetchLeg, MIT.
// Commit 0a5df73de8cd393761c6fc1119d65317dadad731.
// Copyright (c) 2026 Mirror xianyue jiang. License: licenses/mirrorxyjiang-MIT.txt.
// Changes: injected SDK/mode, abort + timeout, result validation and cleanup.
export function requestLeg(AMap, origin, destination, mode, signal, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    let service, timer
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      service?.clear()
      if (error) reject(error)
      else resolve(value)
    }
    const abort = () => finish(new DOMException('路线请求已失效', 'AbortError'))
    if (signal?.aborted) { abort(); return }
    signal?.addEventListener('abort', abort, { once: true })
    timer = setTimeout(() => finish(new Error('路线请求超时，请检查网络后重试。')), timeoutMs)
    try {
      const Service = { driving: AMap.Driving, walking: AMap.Walking }[mode]
      if (!Service) throw new Error('路线服务尚未就绪。')
      // 不传 map，阻止 SDK 自动画图；最新结果由控制器审核后绘制。
      service = new Service()
      service.search(origin, destination, (status, result) => {
        if (settled) return
        const route = result?.routes?.[0]
        if (status !== 'complete' || !route) {
          finish(new Error(mode === 'walking' ? '未获得可用道路：步行可能受跨江或道路连通性限制，请尝试驾车或重试。' : '未获得可用道路，请检查服务配额、网络或稍后重试。'))
          return
        }
        const path = (Array.isArray(route.steps) ? route.steps : []).flatMap((step) => Array.isArray(step?.path) ? step.path : [])
        const distance = Number(route.distance), time = Number(route.time)
        const validPath = path.every((point) => {
          const lng = Array.isArray(point) ? point[0] : point?.getLng?.() ?? point?.lng
          const lat = Array.isArray(point) ? point[1] : point?.getLat?.() ?? point?.lat
          return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90
        })
        if (route.distance == null || route.time == null || route.distance === '' || route.time === ''
          || !validPath || path.length < 2 || !Number.isFinite(distance) || distance < 0 || !Number.isFinite(time) || time < 0) {
          finish(new Error('道路服务返回的数据不完整，请重试。'))
          return
        }
        finish(null, { path, distance, time })
      })
    } catch (error) { finish(error) }
  })
}
