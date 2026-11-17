import { useEffect, useRef, useState } from 'react'
import { loadMapSdk } from '../map/loadMap.js'
import { attachPlaceLayer } from '../map/placeLayer.js'
import { createRouteController } from '../map/routeController.js'
import { requestLeg } from '../map/requestLeg.js'
import { searchCities } from '../map/searchService.js'
import { tripStore } from '../state/tripStore.js'

function DemoMap() {
  const ref = useRef(null)
  useEffect(() => attachPlaceLayer({ container: ref.current }), [])
  return (
    <section className="map-panel demo-map" aria-label="拖拽演示平面">
      <div className="map-label">演示模式 · 非真实地图 · 不提供道路</div>
      <div className="demo-caption"><p className="eyebrow">EXPLORE YOUR CITY</p><h2>先把想去的地方，安排好。</h2><p>拖动地点标签到左侧，也可以点「安排」。</p></div>
      <div className="demo-plot" ref={ref} />
      <p className="demo-note">地点卡片演示 · 非地理比例 · 无道路数据<br />地点位置来自高德；拖拽不会改变坐标。</p>
    </section>
  )
}

function LiveMap({ config, onDemo, mobileView }) {
  const ref = useRef(null)
  const [status, setStatus] = useState('loading')
  const fit = useRef(null)
  useEffect(() => {
    if (mobileView !== 'map') return
    const timer = setTimeout(() => fit.current?.(), 180)
    return () => clearTimeout(timer)
  }, [mobileView])
  useEffect(() => {
    const city = tripStore.getState().trip.city
    const cityAbort = new AbortController()
    let disposed = false, map, controller, detachPlaces, onComplete
    let initialized = false
    let lines = []
    const clear = () => { lines.forEach((line) => line.setMap(null)); lines = [] }
    const timer = setTimeout(() => { if (!disposed) setStatus('error') }, 15000)
    loadMapSdk(config).then(async (AMap) => {
      if (disposed) return
      const cityInfo = tripStore.getState().cityInfo ?? (await searchCities(AMap, city, cityAbort.signal)).find((item) => item.name === city)
      if (disposed) return
      if (!cityInfo) throw new Error('未找到此城市')
      map = new AMap.Map(ref.current, { center: cityInfo.center, zoom: 11, viewMode: '2D' })
      map.addControl(new AMap.Scale())
      map.addControl(new AMap.ToolBar({ position: 'RB' }))
      onComplete = () => {
        if (disposed || initialized) return
        initialized = true
        clearTimeout(timer)
        try {
          detachPlaces = attachPlaceLayer({ map, AMap })
          fit.current = detachPlaces.fit
          fit.current()
          controller = createRouteController({ store: tripStore,
            request: (a, b, mode, signal) => requestLeg(AMap, a, b, mode, signal), clear, minIntervalMs: 1100,
            draw: (legs) => {
              lines = legs.map((leg) => new AMap.Polyline({ map, path: leg.path, strokeColor: leg.color,
                strokeWeight: 6, strokeOpacity: 0.9, lineJoin: 'round', showDir: true }))
            },
          })
          setStatus('ready')
        } catch { setStatus('error') }
      }
      map.on('complete', onComplete)
    }).catch(() => { clearTimeout(timer); if (!disposed) setStatus('error') })
    return () => {
      disposed = true
      cityAbort.abort()
      fit.current = null
      clearTimeout(timer)
      controller?.destroy()
      detachPlaces?.()
      clear()
      if (onComplete) map?.off('complete', onComplete)
      map?.destroy()
      tripStore.getState().setRoute({ status: 'unavailable' })
    }
  }, [config])
  return (
    <section className="map-panel" aria-label="真实高德地图">
      <div ref={ref} className="map-canvas" />
      <div className="map-label">高德地图 · 拖动地点标签安排游览</div>
      {status !== 'ready' && <div className="map-message" role="status">
        <div className="map-symbol" aria-hidden="true">⌁</div>
        <h2>{status === 'error' ? '地图暂时没有连接' : `正在打开${tripStore.getState().trip.city}地图…`}</h2>
        <p>{status === 'error' ? '请检查网络、Key、安全密钥与域名设置。' : '首次加载需要联网，请稍候。'}</p>
        {status === 'error' && <><button className="primary-button" onClick={() => window.location.reload()}>重新连接</button><button className="text-button" onClick={onDemo}>切换到拖拽演示</button></>}
      </div>}
    </section>
  )
}

export default function MapPanel({ config, mode, onDemo, mobileView }) {
  return mode === 'demo' ? <DemoMap /> : <LiveMap config={config} onDemo={onDemo} mobileView={mobileView} />
}
