import { useEffect, useState, useSyncExternalStore } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { tripStore } from '../state/tripStore.js'
import { subscribeMapDrag, getDraggedPlaceId, canDropPlace, consumeMapDrag } from '../drag/mapDrag.js'

export default function DayDropSlot({ dayId, index, empty = false, listDragging, preview }) {
  const dragging = useSyncExternalStore(subscribeMapDrag, getDraggedPlaceId, () => null)
  const [hover, setHover] = useState(false)
  useEffect(() => subscribeMapDrag(() => { if (!getDraggedPlaceId()) setHover(false) }), [])
  const { setNodeRef } = useDroppable({ id: `slot:${dayId}:${index}`, data: { type: 'slot', dayId, index } })
  const target = preview?.target?.dayId === dayId && preview.target.index === index
  return <div ref={setNodeRef} className={`drop-slot ${empty ? 'is-empty' : ''} ${dragging || listDragging ? 'is-active' : ''} ${(hover && dragging) || (target && preview.ok) ? 'is-over' : ''} ${target && !preview.ok ? 'is-invalid' : ''}`}
    data-insert-index={index} data-drop-slot={`${dayId}:${index}`}
    onDragOver={(event) => {
      if (listDragging || !canDropPlace(event.dataTransfer)) return
      event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; setHover(true)
    }}
    onDragLeave={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setHover(false) }}
    onDrop={(event) => {
      if (listDragging || !canDropPlace(event.dataTransfer)) return
      event.preventDefault(); event.stopPropagation(); setHover(false)
      const id = consumeMapDrag(event.dataTransfer)
      if (id) tripStore.getState().addVisit(id, dayId, index)
    }}>
    {empty ? <><span aria-hidden="true">＋</span><strong>拖入地点，安排这一天</strong><p>地图标签或其他日期的游览都可以拖入</p></> : <span>{target && !preview.ok ? '当日已有相同地点' : '拖到这里插入'}</span>}
  </div>
}
