import { useEffect, useRef, useState } from 'react'
import { loadMapSdk } from '../map/loadMap.js'
import { createSearchService } from '../map/searchService.js'
import { createSearchController } from '../map/searchController.js'
import { SHAPES, SHAPE_LABELS } from '../map/placeStyle.js'
import { tripStore } from '../state/tripStore.js'
import { useTripStore } from '../state/useTripStore.js'
import { CATEGORY_LABELS, matchesPlace, arrangedIds } from '../state/placeFilters.js'
import PlaceIcon from './PlaceIcon.jsx'
export default function ExplorePanel({ config }) {
  const filters = useTripStore(s=>s.placeFilter), state = useTripStore(s=>s)
  const epoch = useTripStore((s) => s.documentEpoch)
  const trip = useTripStore((s) => s.trip), cityInfo = useTripStore((s) => s.cityInfo)
  const places = useTripStore((s) => s.places), focusId = useTripStore((s) => s.focusPlaceId)
  const [query, setQuery] = useState(''), [search, setSearch] = useState({ status: 'idle', results: [] })
  const [kind, setKind] = useState(filters.category==='hotel'?'hotel':'place')
  const [ready, setReady] = useState(false), [expanded, setExpanded] = useState(false)
  const control = useRef(null), input = useRef(null)
  const selected = places[focusId]
  useEffect(() => {
    let disposed = false
    if (!config.configured) return
    loadMapSdk(config).then((AMap) => {
      if (disposed) return
      const service = createSearchService(AMap, cityInfo ?? { name: trip.city }, kind)
      control.current = createSearchController({ ...service, onChange: setSearch,
        onPlace: (place) => tripStore.getState().addCandidate(place, trip.id, epoch) })
      setReady(true)
    }).catch(() => { if (!disposed) setSearch({ status: 'error', results: [], message: '搜索服务加载失败，请检查地图配置并刷新。' }) })
    return () => { disposed = true; control.current?.destroy(); control.current = null }
  }, [config, trip.id, trip.city, cityInfo, epoch, kind])
  useEffect(() => {
    const edit = (event) => { tripStore.getState().focusPlace(event.detail); setExpanded(true); input.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }
    window.addEventListener('tripflow:edit-place', edit)
    return () => window.removeEventListener('tripflow:edit-place', edit)
  }, [])
  const update = (value) => { setQuery(value); control.current?.query(value) }
  const changeKind = (next) => { if (next === kind) return; control.current?.destroy(); control.current = null; setReady(false); setKind(next); tripStore.getState().setPlaceFilter({category:next==='hotel'?'hotel':'all'}); setQuery(''); setSearch({ status: 'idle', results: [] }) }
  const arranged = arrangedIds(state)
  const candidates = Object.values(places).filter(place => kind === 'hotel' ? place.category === 'hotel' : place.category !== 'hotel').filter(place=>matchesPlace(place,filters,arranged))
  return <section className="explore-panel" aria-label="城市探索">
    <div className="explore-heading"><div><p className="eyebrow">FIND YOUR NEXT STOP</p><h2>探索{trip.city}</h2></div><button className="text-button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? '收起地点' : `浏览 ${candidates.length} 个地点`}</button></div>
    <div className="explore-tabs" aria-label="探索分类"><button aria-pressed={kind === 'place'} onClick={() => changeKind('place')}>景点 · 逛吃打卡</button><button aria-pressed={kind === 'hotel'} onClick={() => changeKind('hotel')}>酒店住宿</button></div>
    <div className="place-filters"><label>地点分类<select aria-label="地点分类筛选" value={filters.category} onChange={event=>tripStore.getState().setPlaceFilter({category:event.target.value})}>{Object.entries(CATEGORY_LABELS).filter(([key])=>kind==='hotel'?key==='hotel':key!=='hotel').map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label><label><input type="checkbox" checked={filters.favoriteOnly} onChange={event=>tripStore.getState().setPlaceFilter({favoriteOnly:event.target.checked})} />仅收藏</label><label><input type="checkbox" checked={filters.arrangedOnly} onChange={event=>tripStore.getState().setPlaceFilter({arrangedOnly:event.target.checked})} />已安排</label><small>筛选地图候选；行程内地点始终显示。</small></div>
    <form className="poi-search" onSubmit={(event) => { event.preventDefault(); control.current?.query(query, true) }}>
      <input ref={input} aria-label="搜索当前城市地点" placeholder={kind === 'hotel' ? `搜索${trip.city}的酒店名称或商圈` : `搜索${trip.city}的景点、商场、餐厅或打卡点`} value={query} disabled={!config.configured || !ready} onChange={(event) => update(event.target.value)} maxLength={100} />
      <button className="primary-button" disabled={!ready || !query.trim()}>{kind === 'hotel' ? '搜索酒店' : '搜索地点'}</button><button className="text-button" type="button" onClick={() => update('')}>清空</button>
    </form>
    <p className="search-status" role="status">{!config.configured ? '配置真实高德地图后可在线搜索；精选地点可直接安排。' : !ready ? '正在连接搜索服务…' : search.status === 'loading' ? '正在搜索当前城市…' : search.status === 'resolving' ? '正在核对准确位置…' : search.message || (search.status === 'ready' && !search.results.length ? '未找到结果，可换个关键词后点击“搜索地点”。' : '选择带地址的准确结果加入地图；尚未安排的候选地点会自动保存。')}</p>
    {!!search.results.length && <ul className="search-results">{search.results.map((item, index) => <li key={`${item.id || 'region'}-${index}`}><div><strong>{item.name}</strong><small>{[item.district, typeof item.address === 'string' ? item.address : ''].filter(Boolean).join(' · ') || '地址待查询'}{!item.id ? ' · 区域提示' : ''}</small></div><button type="button" onClick={() => control.current?.select(item)}>{kind === 'hotel' ? '加入行程候选' : '定位到地图'}</button></li>)}</ul>}
    {expanded && !candidates.length && <p className="filter-empty">没有符合筛选的地点，可取消筛选或搜索新地点。</p>}
    {expanded && <div className="candidate-grid">{candidates.map((place) => <article className={`candidate-card ${focusId === place.id ? 'is-focused' : ''}`} key={place.id} data-candidate-id={place.id}>
      <button className="candidate-focus" onClick={() => tripStore.getState().focusPlace(place.id)}><PlaceIcon place={place} /><span><strong>{place.name}</strong><small>{place.popular ? '精选 · ' : '候选 · '}{place.address}</small></span></button>
      <button className="favorite-toggle" aria-label={`收藏${place.name}`} aria-pressed={!!place.favorite} onClick={()=>tripStore.getState().toggleFavorite(place.id)}>{place.favorite?'♥':'♡'}</button>
      {place.category !== 'hotel' && <button className="candidate-add" aria-label={`安排候选${place.name}`} onClick={() => tripStore.getState().addVisit(place.id, tripStore.getState().activeDayId)}>＋ 安排</button>}
      {place.category === 'hotel' && <div className="hotel-actions"><button className="candidate-hotel" onClick={() => tripStore.getState().setDayHotels(tripStore.getState().activeDayId, { endHotelId: place.id })}>用于当天入住</button><button className="candidate-hotel" onClick={() => tripStore.getState().setTripHotel(place.id)}>设为全程酒店</button></div>}
    </article>)}</div>}
    {selected?.category === 'hotel' && <div className="hotel-confirm"><strong>已加入住宿候选：{selected.name}</strong><span>{selected.address}</span><div className="hotel-actions"><button className="primary-button hotel-day-add" onClick={() => tripStore.getState().setDayHotels(tripStore.getState().activeDayId, { endHotelId: selected.id })}>用于当天入住</button><button className="hotel-trip-add" onClick={() => tripStore.getState().setTripHotel(selected.id)}>设为全程酒店</button></div><small>已保存，可直接在任意日期的出发/入住下拉框选择，无需先设置全程。当天指左侧选中日期；修改入住会更新次日默认出发。不提供预订或房价。</small></div>}
    {selected && <div className="place-style-editor" aria-label="地点样式编辑"><strong><PlaceIcon place={selected} />{selected.name}</strong><button className="favorite-toggle" aria-pressed={!!selected.favorite} onClick={()=>tripStore.getState().toggleFavorite(selected.id)}>{selected.favorite?'♥ 已收藏':'♡ 收藏地点'}</button><label>标记形状<select aria-label="标记形状" value={selected.shape} onChange={(event) => tripStore.getState().editPlace(selected.id, { shape: event.target.value })}>{SHAPES.map((shape) => <option key={shape} value={shape}>{SHAPE_LABELS[shape]}</option>)}</select></label><label>颜色<input aria-label="标记颜色" type="color" value={selected.color} onChange={(event) => tripStore.getState().editPlace(selected.id, { color: event.target.value })} /></label><span>地图和所有日期中的该地点共用样式。</span></div>}
  </section>
}
