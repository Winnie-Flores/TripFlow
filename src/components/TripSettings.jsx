import { useEffect, useRef, useState } from 'react'
import { useTripStore } from '../state/useTripStore.js'
import { tripStore } from '../state/tripStore.js'
import { loadMapSdk } from '../map/loadMap.js'
import { normalizeCity, searchCities } from '../map/searchService.js'
import { MAX_DAYS } from '../state/plan.js'

export default function TripSettings({ config }) {
  const trip = useTripStore((s) => s.trip)
  const dayCount = useTripStore((s) => s.days.length)
  const [edits, setEdits] = useState({})
  const [feedback, setFeedback] = useState('')
  const [cityOptions, setCityOptions] = useState([]), [pending, setPending] = useState(false)
  const session = useRef({ version: 0, abort: null })
  useEffect(() => () => { session.current.version++; session.current.abort?.abort() }, [])
  const values = { ...trip, dayCount, ...edits }
  const change = (event) => {
    session.current.version++; session.current.abort?.abort(); setPending(false)
    if (event.target.name === 'city') setCityOptions([])
    setEdits((old) => ({ ...old, [event.target.name]: event.target.value }))
  }
  const findCities = async () => {
    session.current.abort?.abort()
    const version = ++session.current.version, abort = new AbortController()
    session.current.abort = abort; setPending(true); setFeedback('正在查询城市…')
    try {
      const AMap = await loadMapSdk(config)
      const options = await searchCities(AMap, values.city, abort.signal)
      if (version !== session.current.version) return
      setCityOptions(options); setFeedback(options.length ? '选择下方城市，再保存设置。' : '未找到城市，请填写完整城市名；支持地级市和直辖市。')
    } catch (error) { if (version === session.current.version) setFeedback(error.message) }
    finally { if (version === session.current.version) setPending(false) }
  }
  const apply = async (reset = false) => {
    const version = ++session.current.version, tripId = trip.id
    session.current.abort?.abort()
    const abort = new AbortController(); session.current.abort = abort
    const input = { ...values }
    if (normalizeCity(values.city) !== trip.city && config?.configured) {
      setPending(true); setFeedback('正在核对新城市…')
      try {
        const info = cityOptions.find((item) => item.name === normalizeCity(values.city))
          ?? (await searchCities(await loadMapSdk(config), values.city, abort.signal)).find((item) => item.name === normalizeCity(values.city))
        if (version !== session.current.version || tripStore.getState().trip.id !== tripId) return
        if (!info) { setFeedback('请输入完整城市名，点击“查找城市”后选择准确城市。'); return }
        input.city = info.name; input.cityInfo = info
      } catch (error) { if (version === session.current.version) setFeedback(error.message); return }
      finally { if (version === session.current.version) setPending(false) }
    }
    if (version !== session.current.version) return
    let result = tripStore.getState().configureTrip(input, { reset })
    if (result.requiresConfirmation) {
      if (!window.confirm(result.message)) { setFeedback('已取消操作，原行程保留。'); return }
      result = tripStore.getState().configureTrip(input, { reset, confirmed: true })
    }
    if (result.ok) { setEdits({}); setFeedback('设置已保存。') }
    else setFeedback(result.message || '设置未保存。')
  }
  return <section className="trip-settings" aria-label="旅行设置">
    <form onSubmit={(event) => { event.preventDefault(); apply() }}>
      <label>旅行名称<input name="name" value={values.name} onChange={change} maxLength={80} required /></label>
      <label>城市<input name="city" value={values.city} onChange={change} list="city-hints" maxLength={30} required /><datalist id="city-hints"><option value="武汉" /><option value="上海" /><option value="杭州" /><option value="北京" /></datalist></label>
      <label>开始日期<input name="startDate" type="date" value={values.startDate} onChange={change} required /></label>
      <label>天数<input name="dayCount" type="number" min="1" max={MAX_DAYS} step="1" value={values.dayCount} onChange={change} required /></label>
      <button className="settings-save" disabled={pending} type="submit">保存设置</button><button className="settings-reset" disabled={pending} type="button" onClick={() => apply(true)}>重建旅行</button>
    </form>
    <div className="city-search-controls"><button type="button" className="text-button" disabled={pending || !config?.configured} onClick={findCities}>查找城市</button>{cityOptions.map((item) => <button type="button" key={item.adcode} onClick={() => { session.current.version++; session.current.abort?.abort(); setPending(false); setEdits((old) => ({ ...old, city: item.name })); setFeedback(`已选 ${item.name}，保存设置后切换。`) }}>{item.name} · {item.adcode}</button>)}</div>
    <p className="city-switch-note">切换城市或重建时，原旅行会保留在旅行记录中。规划下一次出行，建议使用顶部“新增旅行”。</p>
    <p className="date-rule">插入或删除一天后，所有日期从开始日连续重排；已有行程内容保留，日期标签自动调整。最多 {MAX_DAYS} 天。</p>
    <p className="settings-feedback" role="status">{feedback}</p>
  </section>
}
