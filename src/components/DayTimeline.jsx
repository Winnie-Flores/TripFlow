import { dayTimeline, clockLabel } from '../state/timeline.js'
import { useTripStore } from '../state/useTripStore.js'
export default function DayTimeline({ day }) {
 const state=useTripStore(s=>s), timeline=dayTimeline(state,day)
 return <details className="day-timeline"><summary>预计时间轴{timeline.end!==null?` · ${timeline.incomplete?'不早于 ':''}${clockLabel(timeline.end)} 结束`:''}</summary>
 <p>交通＋停留推算；不是实际到达记录。{timeline.incomplete?'部分交通未知，后续时间仅为下限，无法确认准时。':'预约为当日时间，早到会计入等待。'}</p>
 {!timeline.rows.length?<p>安排地点后显示时间轴。</p>:<ol>{timeline.rows.map((row,i)=><li key={i}><time>{row.uncertain?'≥ ':''}{clockLabel(row.arrival)}</time><div><strong>{row.label} {row.name}</strong>{row.transport&&<small>{row.transport.mode==='walking'?'步行':'驾车'} · {row.transport.status==='ready'?`${Math.ceil(row.transport.time/60)} 分钟`:'交通待确认'}</small>}<small>停留 {row.duration} 分钟 · {row.uncertain?'≥ ':''}{clockLabel(row.departure)} 离开{row.wait?` · ${row.uncertain?'最多等待':'等待'} ${row.wait} 分钟`:''}</small>{row.fixedTime&&<small className={row.conflict?'time-warning':''}>预约 {row.fixedTime}{row.conflict?' · 即使按已知交通也会迟到':row.uncertain?' · 尚不能确认准时':''}</small>}</div></li>)}</ol>}
 {timeline.crossesDay&&<p className="time-warning">行程已跨到次日，建议减少安排或调整出发时间。</p>}
 </details>
}
