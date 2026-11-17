import DayTimeline from './DayTimeline.jsx'
import PlaceIcon from './PlaceIcon.jsx'
import RouteSummary from './RouteSummary.jsx'
import { useRef, useState } from 'react'
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, useDroppable, pointerWithin, closestCenter, DragOverlay } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTripStore } from '../state/useTripStore.js'
import { tripStore } from '../state/tripStore.js'
import { previewVisitMove, MAX_DAYS } from '../state/plan.js'
import { getDraggedPlaceId } from '../drag/mapDrag.js'
import DayDropSlot from './DayDropSlot.jsx'

function VisitBody({ place, index, children, handle }) {
  return <><div className="visit-top"><span className="visit-number" style={{ background: place.color }}><PlaceIcon place={{ ...place, color: '#ffffff' }} /><b>{index + 1}</b></span><strong>{place.name}</strong>{handle}</div><p className="visit-address">{place.address}</p>{children}</>
}
function VisitCard({ visit, place, index, day, days, listDragging }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isSorting } = useSortable({
    id: visit.id, data: { type: 'visit', dayId: day.id, index } })
  const move = (delta) => tripStore.getState().reorderVisit(day.id, visit.id, day.visitIds[index + delta])
  return <article ref={setNodeRef} data-visit-id={visit.id} className={`visit-card ${isDragging ? 'is-sorting' : ''}`}
    style={{ transform: isDragging ? undefined : CSS.Transform.toString(transform), transition: isSorting ? transition : undefined }}>
    <VisitBody place={place} index={index} handle={<button className="sort-handle" aria-label={`拖动排序${place.name}`} {...attributes} {...listeners}>⠿</button>}>
      <details className="visit-details"><summary aria-label={`编辑${place.name}游览`}><span>停留 {visit.durationMinutes} 分钟{visit.notes ? ' · 有备注' : ''}</span><span>编辑 ⌄</span></summary>
      <div className="visit-editor">
        <label>停留（分钟）<input type="number" min="0" max="1440" step="1" defaultValue={visit.durationMinutes} disabled={listDragging} aria-label={`${place.name}停留时长`}
          onChange={(event) => { const value = Number(event.target.value); if (event.target.value !== '' && Number.isInteger(value) && value >= 0 && value <= 1440) tripStore.getState().editVisit(visit.id, { durationMinutes: value }) }}
          onBlur={(event) => { if (!tripStore.getState().editVisit(visit.id, { durationMinutes: event.target.value === '' ? NaN : Number(event.target.value) })) event.target.value = visit.durationMinutes }} /></label>
        <label>预约（可选）<input type="time" aria-label={`${place.name}预约时间`} defaultValue={visit.fixedTime ?? ''} onChange={event=>tripStore.getState().editVisit(visit.id,{fixedTime:event.target.value||null})} /></label>
        <label className="notes-label">备注<textarea defaultValue={visit.notes} maxLength={2000} rows="1" disabled={listDragging} aria-label={`${place.name}备注`} placeholder="记下想做的事…" onChange={(event) => tripStore.getState().editVisit(visit.id, { notes: event.target.value })} /></label>
      </div>
      <div className="visit-actions"><button onClick={() => move(-1)} disabled={listDragging || index === 0} aria-label={`上移${place.name}`}>↑ 上移</button><button onClick={() => move(1)} disabled={listDragging || index === day.visitIds.length - 1} aria-label={`下移${place.name}`}>↓ 下移</button><button className="remove-visit" disabled={listDragging} onClick={() => tripStore.getState().removeVisit(visit.id)} aria-label={`移除${place.name}`}>移除</button></div>
      {days.length > 1 && <select className="move-day-select" defaultValue="" disabled={listDragging} aria-label={`移动${place.name}到日期`} onChange={(event) => { const target = event.target.value; event.target.value = ''; if (target) tripStore.getState().moveVisit(visit.id, target) }}><option value="">移动到其他日期…</option>{days.map((d, i) => d.id !== day.id && <option key={d.id} value={d.id}>第 {i + 1} 天 · {d.date}</option>)}</select>}
      </details>
    </VisitBody>
  </article>
}
function DaySection({ day, index, days, visits, places, selected, listDragging, preview }) {
  const hotels = Object.values(places).filter(place => place.category === 'hotel')
  const { setNodeRef } = useDroppable({ id: `day:${day.id}`, data: { type: 'day', dayId: day.id } })
  const remove = () => {
    const result = tripStore.getState().removeDay(day.id)
    if (result.requiresConfirmation && window.confirm(result.message)) tripStore.getState().removeDay(day.id, { confirmed: true })
  }
  return <section ref={setNodeRef} data-day-id={day.id} className={`day-section ${selected ? 'is-selected' : ''}`}>
    <div className="day-heading"><button className="day-select" aria-label={`选择第 ${index + 1} 天`} aria-pressed={selected} onClick={() => tripStore.getState().selectDay(day.id)}><span className="day-number">{String(index + 1).padStart(2, '0')}</span><span><strong>第 {index + 1} 天</strong><small><time dateTime={day.date}>{day.date}</time> · {day.visitIds.length} 处地点</small></span></button>
      <div className="day-tools"><button disabled={listDragging || days.length >= MAX_DAYS} aria-label={`在第 ${index + 1} 天前插入`} onClick={() => tripStore.getState().insertDay(index)}>前插入</button><button disabled={listDragging || days.length >= MAX_DAYS} aria-label={`在第 ${index + 1} 天后插入`} onClick={() => tripStore.getState().insertDay(index + 1)}>后插入</button><button disabled={listDragging || days.length <= 1} aria-label={`删除第 ${index + 1} 天`} onClick={remove}>删除</button></div>
    </div>
    <label className="departure-control">当天出发<input type="time" aria-label={`第${index + 1}天出发时间`} value={day.departureTime ?? '09:00'} onChange={event=>tripStore.getState().setDepartureTime(day.id,event.target.value)} /></label>
    <DayTimeline day={day} />
    <div className="day-hotels">{hotels.length ? <><label>出发酒店<select aria-label={`第${index + 1}天出发酒店`} value={day.startHotelId ?? ''} disabled={listDragging} onChange={event => tripStore.getState().setDayHotels(day.id, { startHotelId: event.target.value || null })}><option value="">未设置</option>{hotels.map(hotel => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label><label>当晚入住<select aria-label={`第${index + 1}天入住酒店`} value={day.endHotelId ?? ''} disabled={listDragging} onChange={event => tripStore.getState().setDayHotels(day.id, { endHotelId: event.target.value || null })}><option value="">未设置</option>{hotels.map(hotel => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label></> : <p>可在右侧“酒店住宿”选择出发与入住酒店。</p>}</div>
    <SortableContext items={day.visitIds} strategy={verticalListSortingStrategy}>
      <div className="visit-list" aria-label={`第 ${index + 1} 天行程`}>
        {day.visitIds.map((id, position) => <div key={id}><DayDropSlot dayId={day.id} index={position} listDragging={listDragging} preview={preview} /><VisitCard visit={visits[id]} place={places[visits[id].placeId]} index={position} day={day} days={days} listDragging={listDragging} /></div>)}
        <DayDropSlot dayId={day.id} index={day.visitIds.length} empty={day.visitIds.length === 0} listDragging={listDragging} preview={preview} />
      </div>
    </SortableContext>
  </section>
}

function visitKeyboardCoordinates(event, args) {
  const containers = args.context.droppableContainers
  return sortableKeyboardCoordinates(event, { ...args, context: { ...args.context,
    droppableContainers: { getEnabled: () => containers.getEnabled().filter((d) => d.data.current?.type === 'visit'), get: (id) => containers.get(id) } } })
}

export default function Itinerary({ mode }) {
  const days = useTripStore((s) => s.days), visits = useTripStore((s) => s.visits), places = useTripStore((s) => s.places)
  const dayId = useTripStore((s) => s.activeDayId), trip = useTripStore((s) => s.trip)
  const route = useTripStore((s) => s.route)
  const routeMode = useTripStore((s) => s.routeMode), notice = useTripStore((s) => s.notice)
  const [activeId, setActiveId] = useState(null), [preview, setPreview] = useState(null)
  const session = useRef(null), pointer = useRef(null), board = useRef(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: visitKeyboardCoordinates }))
  const collision = (args) => {
    pointer.current = args.pointerCoordinates
    if (!args.pointerCoordinates) return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((d) => d.data.current?.type === 'visit') })
    const bounds = board.current?.getBoundingClientRect()
    if (bounds && (args.pointerCoordinates.x < bounds.left || args.pointerCoordinates.x > bounds.right
      || args.pointerCoordinates.y < bounds.top || args.pointerCoordinates.y > bounds.bottom)) return []
    const hits = pointerWithin(args)
    const rank = { slot: 0, visit: 1, day: 2 }
    return hits.sort((a, b) => (rank[a.data?.droppableContainer?.data.current?.type] ?? 3) - (rank[b.data?.droppableContainer?.data.current?.type] ?? 3)).slice(0, 1)
  }
  const targetFor = (over, visitId) => {
    if (!over || over.id === visitId) return null
    const data = over.data.current, state = tripStore.getState()
    const targetDay = state.days.find((day) => day.id === data?.dayId)
    if (!targetDay) return null
    if (data.type === 'day') return { dayId: targetDay.id, index: targetDay.visitIds.length }
    if (data.type === 'slot') return { dayId: data.dayId, index: data.index }
    const sourceIndex = targetDay.visitIds.indexOf(visitId)
    const after = pointer.current ? pointer.current.y > over.rect.top + over.rect.height / 2 : sourceIndex >= 0 && sourceIndex < data.index
    return { dayId: data.dayId, index: data.index + (after ? 1 : 0) }
  }
  const finish = () => { session.current = null; setActiveId(null); setPreview(null) }
  const active = visits[activeId], source = days.find((day) => day.visitIds.includes(activeId))
  return <aside className="itinerary" aria-labelledby="itinerary-heading">
    <div className="panel-heading"><span className="eyebrow">MY ITINERARY</span><span className="muted">{trip.city} / {days.length} 天</span></div>
    <h2 id="itinerary-heading">每日行程</h2>
    <p className="muted intro">同一地点可多次安排；每次分别填写备注和停留时间。</p>
    <details className="route-disclosure"><summary><span>路线与交通 · {days.some(day => Object.keys(day.legModes ?? {}).length) ? '分段设置' : routeMode === 'walking' ? '步行' : '驾车'}</span><span className={`route-brief ${route.status}`} role="status">{mode === 'demo' ? '演示模式' : route.status === 'ready' ? `${(route.distance / 1000).toFixed(2)} km · ${Math.ceil(route.time / 60)} 分钟` : route.status === 'loading' ? '正在规划…' : ['error', 'partial'].includes(route.status) ? '道路未完整 · 展开重试' : '展开查看'}</span></summary>
    <div className="travel-mode" aria-label="交通方式" title="点击会统一所有日期交通方式并清除分段设置"><button aria-pressed={routeMode === 'walking'} onClick={() => tripStore.getState().applyModeToAll('walking')}>统一步行</button><button aria-pressed={routeMode === 'driving'} onClick={() => tripStore.getState().applyModeToAll('driving')}>统一驾车</button></div>
    <RouteSummary mode={mode} />    </details>
    <p className="action-notice" role="status" aria-live="polite">{notice}</p>
    <DndContext sensors={sensors} collisionDetection={collision}
      onDragStart={({ active }) => { session.current = { revision: tripStore.getState().planRevision }; setActiveId(active.id) }}
      onDragOver={({ active, over }) => {
        const target = targetFor(over, active.id)
        const result = target ? previewVisitMove(tripStore.getState(), active.id, target.dayId, target.index) : null
        setPreview((previous) => previous?.target?.dayId === target?.dayId && previous?.target?.index === target?.index && previous?.ok === result?.ok ? previous : target ? { ...result, target } : null)
      }}
      onDragCancel={() => { finish(); tripStore.getState().setNotice('已取消拖动，行程保持不变。') }}
      onDragEnd={({ active, over }) => {
        const target = targetFor(over, active.id), revision = session.current?.revision
        finish()
        if (target && revision !== undefined && !getDraggedPlaceId()) tripStore.getState().moveVisit(active.id, target.dayId, target.index, revision)
        else tripStore.getState().setNotice('未放入有效日期，行程保持不变。')
      }}>
      <div className="days-scroll" ref={board}>{days.map((day, index) => <DaySection key={day.id} day={day} index={index} days={days} visits={visits} places={places} selected={day.id === dayId} listDragging={!!activeId} preview={preview} />)}<button className="add-day" disabled={!!activeId || days.length >= MAX_DAYS} onClick={() => tripStore.getState().insertDay()}>＋ 新增一天</button></div>
      <DragOverlay dropAnimation={null} style={{ pointerEvents: 'none' }}>{active && <div className="visit-card drag-overlay" aria-hidden="true"><VisitBody place={places[active.placeId]} index={source.visitIds.indexOf(activeId)} /><small>移动游览 · 松开放到目标位置</small></div>}</DragOverlay>
    </DndContext>
    {activeId && <p className={`drag-status ${preview && !preview.ok ? 'invalid' : ''}`} role="status">{preview ? preview.ok ? '松开后移动；按 Escape 取消。' : preview.message : '拖到某天的空白处或卡片之间。'}</p>}
    <p className="session-note">自动保存在本机 · JSON 可导出备份</p>
  </aside>
}
