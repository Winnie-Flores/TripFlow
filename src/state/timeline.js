import { dayStops, dayLegs } from './dayRoute.js'
import { routeSnapshot } from '../map/routeController.js'
export const clockMinutes = value => Number(value.slice(0,2))*60+Number(value.slice(3))
export function clockLabel(value) { const days=Math.floor(value/1440), time=`${String(Math.floor(value%1440/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`; return `${days ? `+${days}天 ` : ''}${time}` }
export function dayTimeline(state, day) {
  const stops=dayStops(state,day), legs=dayLegs(state,day)
  const current=state.route?.signature===routeSnapshot(state).signature
  const results=current?state.route.days?.find(d=>d.dayId===day.id)?.legs??[]:[]
  let cursor=clockMinutes(day.departureTime??'09:00'), uncertain=false
  const rows=stops.map((stop,i)=>{
    const leg=i>0?results[i-1]:null
    if(i>0){if(leg?.status==='ready')cursor+=Math.ceil(leg.time/60);else uncertain=true}
    const visit=state.visits[stop.visitId], earliest=cursor
    const appointment=visit?.fixedTime ? clockMinutes(visit.fixedTime) : null
    const conflict=appointment!==null&&earliest>appointment
    if(appointment!==null)cursor=Math.max(cursor,appointment)
    const arrival=earliest, wait=cursor-earliest
    cursor+=visit?.durationMinutes??0
    return { name:stop.place.name,label:stop.label,visitId:stop.visitId,arrival,departure:cursor,uncertain,wait,conflict,fixedTime:visit?.fixedTime??null,
      duration:visit?.durationMinutes??0,notes:visit?.notes??'',address:stop.place.address,
      transport:i>0?{mode:legs[i-1].mode,status:leg?.status??'unavailable',distance:leg?.distance,time:leg?.time}:null }
  })
  return { rows, incomplete:uncertain, end:rows.length?cursor:null, crossesDay:cursor>=1440, conflicts:rows.filter(r=>r.conflict).length,
    completed:results.filter(r=>r.status==='ready').length,total:legs.length }
}
