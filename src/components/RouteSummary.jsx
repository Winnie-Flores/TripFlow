import { dayStops, dayLegs } from '../state/dayRoute.js'
import { useTripStore } from '../state/useTripStore.js'
import { tripStore } from '../state/tripStore.js'
import { dayColor } from '../map/routeStyle.js'
const stats = (distance, time) => `${(distance / 1000).toFixed(2)} 公里 · 约 ${Math.ceil(time / 60)} 分钟`
export default function RouteSummary({ mode }) {
  const state = useTripStore((s) => s)
  const { route, routeScope, days, activeDayId } = state
  const shown = routeScope === 'all' ? days : days.filter((day) => day.id === activeDayId)
  return <>
    <div className="travel-mode route-scope" aria-label="路线显示范围">
      <button aria-pressed={routeScope === 'selected'} onClick={() => tripStore.getState().setRouteScope('selected')}>选中日期</button>
      <button aria-pressed={routeScope === 'all'} onClick={() => tripStore.getState().setRouteScope('all')}>全部日期概览</button>
    </div>
    {mode === 'demo' ? <div className="route-summary demo-summary" role="status"><strong>演示模式 · 未连接道路服务</strong><p>可体验多天拖放与每日编号，不显示路线、距离或交通用时。</p><a href="#map-setup">配置真实高德地图 ↗</a></div>
      : <div className={`route-summary ${route.status}`} role="status">
        <strong>{route.status === 'loading' ? `正在规划道路 · 已完成 ${route.completed ?? 0}/${route.total ?? 0} 段` : route.status === 'ready' ? stats(route.distance, route.time)
          : route.status === 'partial' || route.status === 'error' ? `道路未完整 · 已完成 ${route.completed ?? 0}/${route.total ?? 0} 段`
            : route.status === 'unavailable' ? '等待真实地图服务就绪。' : '安排地点后计算道路；酒店可作为每日起终点。'}</strong>
        <p>交通用时不含游玩停留；只绘制服务返回道路，不连接不同日期的首尾。</p>
        {['error', 'partial'].includes(route.status) && <button className="text-button" onClick={() => tripStore.getState().retryRoute()}>重试道路规划</button>}
      </div>}
    <div className="daily-routes" aria-label="每日道路明细">
      {shown.map((day) => {
        const index = days.indexOf(day), result = route.days?.find((item) => item.dayId === day.id)
        const legs = mode === 'demo' ? [] : result?.legs ?? []
        const stops = dayStops(state, day), segments = dayLegs(state, day)
        const ready = legs.filter((leg) => leg.status === 'ready'), total = Math.max(0, stops.length - 1)
        const sum = (field) => ready.reduce((value, leg) => value + leg[field], 0)
        return <section className="daily-route" key={day.id} style={{ '--day-color': dayColor(index) }}>
          <strong>第 {index + 1} 天 · {day.date}</strong>
          <p>{!total ? '暂无需要计算的交通路段。' : mode === 'demo' ? `${total} 段待连接真实服务` : `已完成 ${ready.length}/${total} 段${ready.length ? ` · ${ready.length === total ? '每日合计' : '仅已完成部分'} ${stats(sum('distance'), sum('time'))}` : ''}`}</p>
          {stops.slice(1).map((stop, i) => <div className="route-leg" key={`${day.id}-${i}`}>
            <span>{stops[i].label} {stops[i].place.name} → {stop.label} {stop.place.name}</span>
            <label className="leg-mode-control">交通方式<select aria-label={`第${index + 1}天第${i + 1}段交通方式`} value={day.legModes?.[segments[i].key] ?? 'default'} onChange={event=>tripStore.getState().setLegMode(day.id,segments[i].key,event.target.value)}><option value="default">跟随统一设置（{state.routeMode==='walking'?'步行':'驾车'}）</option><option value="walking">步行</option><option value="driving">驾车</option></select></label>
            <small>{mode==='demo'?'演示模式 · 未计算交通':legs[i]?.status === 'ready' ? legs[i].sameLocation ? '同一位置，无需交通' : stats(legs[i].distance, legs[i].time) : legs[i]?.status === 'error' ? legs[i].message : route.status === 'unavailable' ? '等待道路服务' : '等待规划…'}</small>
          </div>)}
        </section>
      })}
    </div>
  </>
}
