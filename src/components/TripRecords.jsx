import { useState } from 'react'
import { useTripStore } from '../state/useTripStore.js'
import { tripStore } from '../state/tripStore.js'
import { createLibrary } from '../state/tripLibrary.js'
import { parseDocument } from '../state/document.js'
import { localDate } from '../state/plan.js'
import DataBar from './DataBar.jsx'
import TravelFootprintMap from './TravelFootprintMap.jsx'
import { footprints } from '../state/footprints.js'
const dateTime = value => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
export default function TripRecords({ config, onOpen, onNew }) {
  const state = useTripStore(s => s), [query, setQuery] = useState(''), [message, setMessage] = useState('')
  const [statusFilter, setStatusFilter] = useState('all'), [yearFilter, setYearFilter] = useState('all')
  const [mapExpanded, setMapExpanded] = useState(false)
  const all = createLibrary(state).records.sort((a,b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  const footprintKey = JSON.stringify(all.map(({ document: doc }) => ({ document: { trip: { city: doc.trip.city, status: doc.trip.status }, cityInfo: doc.cityInfo } })))
  const footprint = footprints(JSON.parse(footprintKey))
  const years = [...new Set(all.map(record=>record.document.trip.startDate.slice(0,4)))].sort().reverse()
  const records = all.filter(record => (statusFilter==='all'||(record.document.trip.status??'planned')===statusFilter)&&(yearFilter==='all'||record.document.trip.startDate.startsWith(yearFilter))).filter(record => `${record.document.trip.name} ${record.document.trip.city}`.toLowerCase().includes(query.trim().toLowerCase()))
  const open = id => { const result = tripStore.getState().openTrip(id); if (result.ok) onOpen(); else setMessage(result.message) }
  const remove = record => {
    if (!window.confirm(`删除「${record.document.trip.name}」及其中全部行程？此操作无法撤销，可先导出备份。`)) return
    const result = tripStore.getState().deleteTrip(record.document.trip.id)
    setMessage(result.ok ? '旅行记录已删除，其他旅行保留。' : result.message)
  }
  const exportRecord = record => {
    try {
      const content = JSON.stringify(record.document); parseDocument(content)
      const url = URL.createObjectURL(new Blob([content],{type:'application/json'})), anchor = document.createElement('a')
      anchor.href = url; anchor.download = `TripFlow-${record.document.trip.startDate}.json`; anchor.click(); setTimeout(()=>URL.revokeObjectURL(url),1000)
      setMessage('这次旅行的 JSON 备份已生成。')
    } catch(error) { setMessage(error.message) }
  }
  return <section className="records-page" aria-labelledby="records-title">
    <div className="records-heading"><div><p className="eyebrow">YOUR JOURNEYS, ALL TOGETHER</p><h1 id="records-title">旅行记录</h1><p>每一次出发，都有自己的安排。共 {all.length} 次旅行，随时打开继续规划。</p></div><button className="primary-button" onClick={onNew}>＋ 新增旅行</button></div>
    <DataBar records />
    <div className="records-toolbar"><label>查找旅行<input aria-label="查找旅行记录" value={query} placeholder="搜索旅行名称或城市" onChange={event=>setQuery(event.target.value)} /></label><span>仅保存在当前浏览器，可分别导出旅行备份。</span><button className="footprint-toggle" aria-expanded={mapExpanded} aria-controls="records-layout" onClick={() => setMapExpanded(!mapExpanded)}>{mapExpanded ? '收起足迹地图' : '展开足迹地图'}</button></div>
    <div className="record-filters"><label>旅行状态<select aria-label="旅行状态筛选" value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option value="all">全部状态</option><option value="planned">规划中</option><option value="visited">已去过</option></select></label><label>年份<select aria-label="旅行年份筛选" value={yearFilter} onChange={event=>setYearFilter(event.target.value)}><option value="all">全部年份</option>{years.map(year=><option key={year}>{year}</option>)}</select></label><span>已去过 {footprint.cities.filter(city=>city.visited).length} 个已定位城市 · 显示 {records.length}/{all.length} 次旅行</span><button onClick={()=>{setQuery('');setStatusFilter('all');setYearFilter('all')}}>重置筛选</button></div>
    {message && <p className="records-message" role="status">{message}</p>}
    <div id="records-layout" className={`records-layout ${mapExpanded ? 'with-footprints' : ''}`}>
    {mapExpanded && <TravelFootprintMap config={config} {...footprint} onCity={setQuery} />}
    <div className="records-results"><div className="trip-record-grid">{records.map(record => {
      const doc = record.document, trip = doc.trip, endDate = doc.days.at(-1).date
      const current = trip.id === state.trip.id, total = doc.visits.length
      const names = doc.days.flatMap(day => day.visitIds).slice(0,3).map(id => doc.places.find(p=>p.id === doc.visits.find(v=>v.id === id).placeId)?.name)
      const period = endDate < localDate() ? '日期已结束' : trip.startDate > localDate() ? '待出发' : '旅行日期中'
      return <article className={`trip-record-card ${current ? 'is-current' : ''}`} key={trip.id} data-trip-id={trip.id}>
        <button className="record-open" aria-label={`打开旅行${trip.name}`} onClick={()=>open(trip.id)}>
          <div className="record-cover"><span className="record-city">◎ {trip.city}</span><span className="record-period">{current ? '当前规划' : period}</span><strong>{trip.city.slice(0,2)}</strong><span className="record-cover-line" aria-hidden="true">↗</span></div>
          <div className="record-content"><h2>{trip.name}</h2><p className="record-date">{trip.startDate} — {endDate}</p><div className="record-stats"><span>{doc.days.length} 天</span><span>{total} 个行程地点</span><span>{doc.places.length} 个候选地点</span></div><p className="record-preview">{names.length ? names.join(' · ') : '还没有安排地点，打开后从地图拖入。'}</p><span className="record-enter">{current ? '继续规划' : '打开行程'} ↗</span></div>
        </button>
        <div className="record-status-row"><label>旅行状态<select aria-label={`旅行${trip.name}的状态`} value={trip.status ?? 'planned'} onChange={event => tripStore.getState().setTripStatus(trip.id, event.target.value)}><option value="planned">规划中</option><option value="visited">已去过</option></select></label><span className={`record-status ${trip.status === 'visited' ? 'visited' : 'planned'}`}>{trip.status === 'visited' ? '● 已点亮足迹' : '● 期待出发'}</span></div>
        <div className="record-footer"><small>更新于 {dateTime(record.updatedAt)}</small><div><button onClick={()=>exportRecord(record)}>导出</button><button disabled={current} title={current ? '请先打开其他旅行，再删除此记录' : '删除这次旅行'} onClick={()=>remove(record)}>删除</button></div></div>
      </article>
    })}</div>
    {!records.length && <div className="records-empty"><h2>没有找到这次旅行</h2><p>换个城市或旅行名称试试，也可以新增旅行。</p><button className="text-button" onClick={()=>{setQuery('');setStatusFilter('all');setYearFilter('all')}}>清空筛选</button></div>}
    </div></div>
  </section>
}
