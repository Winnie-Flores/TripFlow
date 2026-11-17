import { useEffect, useRef, useState } from 'react'
import { loadMapSdk } from '../map/loadMap.js'
import { createChinaFootprintLayer, chinaFootprintStyles, footprintRegionCity } from '../map/chinaFootprints.js'
export default function TravelFootprintMap({ config, cities, missing, onCity }) {
  const citiesKey = JSON.stringify(cities)
  const container = useRef(null), select = useRef(onCity), cityData = useRef([]), sync = useRef(null), resetView = useRef(null), focusCity = useRef(null)
  const [status, setStatus] = useState('loading'), [retry, setRetry] = useState(0)
  useEffect(() => { select.current = onCity }, [onCity])
  useEffect(() => {
    let disposed = false, map, observer, frame, onComplete, layer, onMapClick, initialized = false, selectedCity = null
    const timer = config.configured ? setTimeout(() => { if (!disposed) setStatus('error') }, 15000) : null
    const entries = []
    if (!config.configured) return
    loadMapSdk(config).then(AMap => {
      if (disposed) return
      layer = createChinaFootprintLayer(AMap, cityData.current)
      map = new AMap.Map(container.current, { zoom: 3, center: [104, 35], zooms: [2, 9], layers: [layer], viewMode: '2D', showLabel: false })
      map.addControl(new AMap.Scale()); map.addControl(new AMap.ToolBar())
      const fit = () => { if (disposed) return; if (selectedCity) map.setZoomAndCenter(7, selectedCity.coordinates, true); else map.setBounds(new AMap.Bounds([73, 3], [135, 54]), true, [24, 24, 24, 24]) }
      resetView.current = () => { selectedCity = null; fit() }
      focusCity.current = city => { selectedCity = city; fit(); select.current(city.name) }
      onMapClick = event => { const properties = layer.getDistrictByContainerPos?.(event.pixel); const city = properties && footprintRegionCity(properties, cityData.current); if (city) focusCity.current?.(city) }
      map.on('click', onMapClick)
      const clearMarkers = () => { entries.splice(0).forEach(({ marker, button, click }) => { button.removeEventListener('click', click); marker.setMap(null) }) }
      sync.current = () => {
        if (disposed || !initialized) return
        clearMarkers()
        layer.setStyles(chinaFootprintStyles(cityData.current))
        for (const city of cityData.current) {
          const button = document.createElement('button')
          button.type = 'button'; button.className = `footprint-pin ${city.visited ? 'is-visited' : 'is-planned'} ${city.visited && city.planned ? 'is-mixed' : ''}`
          button.setAttribute('aria-label', `${city.name}：已去过${city.visited}次，规划中${city.planned}次，筛选旅行`)
          const dot = document.createElement('span'); dot.className = 'footprint-dot'; dot.setAttribute('aria-hidden', 'true')
          const label = document.createElement('strong'); label.textContent = city.name
          const counts = document.createElement('small'); counts.textContent = [city.visited ? `已去过 ${city.visited}` : '', city.planned ? `规划中 ${city.planned}` : ''].filter(Boolean).join(' · ')
          button.append(dot, label, counts)
          const click = () => focusCity.current?.(city)
          button.addEventListener('click', click)
          const marker = new AMap.Marker({ position: city.coordinates, content: button, anchor: 'bottom-center' })
          marker.setMap(map); entries.push({ marker, button, click })
        }
        fit()
      }
      onComplete = () => {
        if (disposed || initialized) return
        initialized = true; clearTimeout(timer); sync.current?.()
        observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit) })
        observer.observe(container.current)
        setStatus('ready')
      }
      map.on('complete', onComplete)
    }).catch(() => { clearTimeout(timer); if (!disposed) setStatus('error') })
    return () => { disposed = true; sync.current = null; resetView.current = null; focusCity.current = null; clearTimeout(timer); if (onMapClick) map?.off('click', onMapClick); layer?.setMap(null); if (onComplete) map?.off('complete', onComplete); observer?.disconnect(); cancelAnimationFrame(frame); entries.forEach(({ marker, button, click }) => { button.removeEventListener('click', click); marker.setMap(null) }); map?.destroy() }
  }, [config, retry])
  useEffect(() => { cityData.current = JSON.parse(citiesKey); sync.current?.() }, [citiesKey])
  const unavailable = !config.configured || status === 'error'
  return <aside className="footprint-panel" aria-label="旅行足迹地图">
    <div className="footprint-heading"><p className="eyebrow">MY TRAVEL FOOTPRINTS</p><h2>每一次出发，都留下足迹</h2><p>在旅行卡片中标记“已去过”，点亮城市边界，收藏你的中国旅行足迹。</p></div>
    <div className="footprint-legend"><span><i className="unvisited-dot" />未去过</span><span><i className="visited-dot" />已去过</span><span><i className="planned-dot" />规划中</span><button className="footprint-reset" onClick={() => resetView.current?.()}>中国全览</button></div>
    <div className="footprint-map-wrap"><div ref={container} className="footprint-map" />{(unavailable || status === 'loading') && <div className="footprint-map-state" role="status">{unavailable ? <><strong>足迹地图暂未连接</strong><p>{!config.configured ? '配置高德地图后可查看地图；下方仍可查看城市记录。' : '请检查网络后重试。'}</p>{config.configured && <button onClick={() => { setStatus('loading'); setRetry(n => n + 1) }}>重新连接</button>}</> : '正在加载足迹地图…'}</div>}</div>
    <div className="footprint-city-list">{cities.map(city => <button key={city.name} data-adcode={city.adcode} onClick={() => focusCity.current ? focusCity.current(city) : onCity(city.name)}><strong>{city.name}</strong><span>{city.visited ? `已去过 ${city.visited} 次` : ''}{city.visited && city.planned ? ' · ' : ''}{city.planned ? `规划中 ${city.planned} 次` : ''}</span></button>)}</div>
    {!!missing.length && <p className="footprint-note">{missing.join('、')}尚无确认的城市坐标，暂不落点；打开旅行并确认城市后即可显示。</p>}
    <p className="footprint-note">同城多次旅行合并显示；颜色由手动标记决定，不按日期推断。未去过的区域保持灰色；已去过优先填绿，规划中填橙。边界来自高德中国市级行政区图层（含直辖市），不连接交通路线。</p>
  </aside>
}
