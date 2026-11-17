import HistoryControls from './components/HistoryControls.jsx'
import ReadableExport from './components/ReadableExport.jsx'
import { readableReport } from './state/readableExport.js'
import TripRecords from './components/TripRecords.jsx'
import NewTripDialog from './components/NewTripDialog.jsx'
import { tripStore } from './state/tripStore.js'
import DataBar from './components/DataBar.jsx'
import ExplorePanel from './components/ExplorePanel.jsx'
import { useEffect, useState } from 'react'
import TripSettings from './components/TripSettings.jsx'
import { useTripStore } from './state/useTripStore.js'
import Itinerary from './components/Itinerary.jsx'
import MapPanel from './components/MapPanel.jsx'
import { readMapConfig } from './map/config.js'

const mapConfig = readMapConfig(import.meta.env)

export default function App() {
  const [view, setView] = useState(window.location.hash === '#records' ? 'records' : 'planner')
  const [report, setReport] = useState(null)
  const [newTrip, setNewTrip] = useState(false)
  useEffect(() => {
    const changed = () => { const next = window.location.hash === '#records' ? 'records' : 'planner'; if (next === 'records') tripStore.getState().checkpointTrip(); setView(next) }
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [])
  const navigate = (next) => {
    if (next === 'records' && !tripStore.getState().checkpointTrip()) return
    setView(next); window.location.hash = next; window.scrollTo(0,0)
  }
  const epoch = useTripStore((s) => s.documentEpoch)
  const [mobileView, setMobileView] = useState('itinerary')
  const trip = useTripStore((s) => s.trip)
  const [mode, setMode] = useState(mapConfig.configured ? 'live' : 'demo')
  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="#" className="brand" aria-label="旅序 TripFlow 首页"><span className="brand-icon" aria-hidden="true">↗</span><strong>旅序<span>TripFlow</span></strong></a>
        <nav className="main-navigation" aria-label="主要导航"><button aria-current={view === 'planner' ? 'page' : undefined} onClick={() => navigate('planner')}>当前规划</button><button aria-current={view === 'records' ? 'page' : undefined} onClick={() => navigate('records')}>旅行记录</button></nav>
        <button className="nav-new-trip" onClick={() => setNewTrip(true)}>＋ 新增旅行</button>
      </header>
      <main>
        {view === 'records' ? <TripRecords config={mapConfig} onNew={() => setNewTrip(true)} onOpen={() => navigate('planner')} /> : <>
        <div className="page-heading"><div><p className="eyebrow">A LITTLE PLAN, A BIG ADVENTURE</p><h1>{trip.name}</h1></div><span className="city-badge">◎ {trip.city} · 多天旅行</span></div>
        <div className="planner-edit-toolbar"><HistoryControls /><button className="readable-export-open" onClick={()=>setReport(readableReport(tripStore.getState()))}>导出可读行程</button></div>
        <div className="trip-tools"><DataBar />
        <details className="settings-disclosure"><summary>旅行设置 <span>名称、城市与日期</span></summary><TripSettings key={epoch} config={mapConfig} /></details></div>

        <div className="mobile-view-switch" aria-label="手机视图"><button aria-pressed={mobileView === 'itinerary'} onClick={() => setMobileView('itinerary')}>每日行程</button><button aria-pressed={mobileView === 'map'} onClick={() => setMobileView('map')}>探索地图</button></div>
        <div className={`workspace mobile-${mobileView}`}>
          <Itinerary key={epoch} mode={mode} />
          <div className="map-column">
            <ExplorePanel key={`explore:${trip.id}:${epoch}`} config={mapConfig} />
        <div className="mode-banner"><span>{mode === 'demo' ? '演示模式：非真实地图，不请求道路服务' : '真实高德地图：道路由在线服务计算'}</span>{mapConfig.configured ? <button className="text-button" onClick={() => setMode(mode === 'demo' ? 'live' : 'demo')}>{mode === 'demo' ? '切换真实地图' : '切换拖拽演示'}</button> : <a href="#map-setup">配置真实地图 ↗</a>}</div>
          <MapPanel key={`map:${trip.id}:${epoch}`} city={trip.city} mobileView={mobileView} config={mapConfig} mode={mode} onDemo={() => setMode('demo')} />
          </div>
        </div>
        <details id="map-setup" className="setup-disclosure" open={!mapConfig.configured}><summary>地图连接与配置说明</summary><section className="setup-panel" aria-labelledby="setup-heading">
          <div><p className="eyebrow">MAP CONNECTION</p><h2 id="setup-heading">连接你的高德地图</h2><p className="config-state" role="status">{mapConfig.configured ? '本地配置已填写，实际鉴权以地图加载结果为准。' : `缺少配置：${mapConfig.missing.join('、')}`}</p></div>
          <ol className="setup-steps"><li><strong>申请 Web 端 Key</strong><p>在高德开放平台选择「Web端（JS API）」，获取 Key 与安全密钥。</p></li><li><strong>填写本地配置</strong><p>复制 <code>.env.example</code> 为 <code>.env.local</code>，填写两个变量。</p></li><li><strong>重启开发服务</strong><p>重新运行 <code>npm run dev</code>，联网检查真实地图。</p></li></ol>
          <p className="setup-note">VITE_ 环境变量会进入浏览器和构建产物，不是保密存储。真实配置请勿提交；本地文件已加入忽略规则。<a href="https://lbs.amap.com/api/javascript-api-v2/guide/abc/load" target="_blank" rel="noreferrer">高德官方接入说明 ↗</a></p>
        </section></details>
        </>}
      </main>
      {report && <ReadableExport report={report} onClose={()=>setReport(null)} />}
      {newTrip && <NewTripDialog config={mapConfig} onClose={() => setNewTrip(false)} onCreated={() => { setNewTrip(false); navigate('planner') }} />}
      <footer><span>TripFlow / 旅序</span><span>React + JavaScript · 课程项目</span></footer>
    </div>
  )
}
