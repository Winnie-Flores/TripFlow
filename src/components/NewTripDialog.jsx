import { useEffect, useRef, useState } from 'react'
import { localDate } from '../state/plan.js'
import { loadMapSdk } from '../map/loadMap.js'
import { normalizeCity, searchCities } from '../map/searchService.js'
import { tripStore } from '../state/tripStore.js'
export default function NewTripDialog({ config, onClose, onCreated }) {
  const dialog = useRef(null), session = useRef({ version: 0, abort: null })
  const [values, setValues] = useState({ name: '', city: tripStore.getState().trip.city, startDate: localDate(), dayCount: 3 })
  const [options, setOptions] = useState([]), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    const element = dialog.current
    if (!element.open) element.showModal()
    const current = session.current
    return () => { current.version++; current.abort?.abort(); element.close() }
  }, [])
  const change = (event) => {
    session.current.version++; session.current.abort?.abort(); setBusy(false)
    setValues(old => ({ ...old, [event.target.dataset.field]: event.target.value }))
    if (event.target.dataset.field === 'city') setOptions([])
  }
  const submit = async (event, lookupOnly = false) => {
    event.preventDefault(); session.current.abort?.abort()
    const version = ++session.current.version, abort = new AbortController(); session.current.abort = abort
    setBusy(true); setMessage(lookupOnly ? '正在查询城市…' : '正在创建旅行…')
    try {
      const input = { ...values, city: normalizeCity(values.city) }
      if (config.configured) {
        const current = tripStore.getState()
        let selected = options.find(item => item.name === input.city) ?? (input.city === current.trip.city ? current.cityInfo : null)
        if (lookupOnly || !selected) {
          const results = await searchCities(await loadMapSdk(config), input.city, abort.signal)
          if (version !== session.current.version) return
          setOptions(results)
          if (lookupOnly) { setMessage(results.length ? '选择准确城市，再创建旅行。' : '未找到城市，请输入完整城市名称。'); return }
          selected = results.find(item => item.name === input.city)
        }
        if (!selected) throw new Error('请查找并选择准确的地级市或直辖市。')
        input.cityInfo = selected
      }
      if (version !== session.current.version) return
      const result = tripStore.getState().createTrip(input)
      if (!result.ok) throw new Error(result.message)
      onCreated()
    } catch (error) { if (version === session.current.version) setMessage(error.message) }
    finally { if (version === session.current.version) setBusy(false) }
  }
  return <dialog ref={dialog} className="new-trip-dialog" aria-labelledby="new-trip-title" onCancel={onClose}>
    <div className="dialog-heading"><div><p className="eyebrow">A NEW JOURNEY</p><h2 id="new-trip-title">新增旅行</h2></div><button type="button" className="dialog-close" aria-label="关闭新增旅行" onClick={onClose}>×</button></div>
    <p className="dialog-note">当前旅行会保留在旅行记录中，新旅行单独规划。</p>
    <form onSubmit={submit} className="new-trip-form">
      <label>旅行名称<input autoFocus name="newName" data-field="name" placeholder="例如：杭州的周末慢游" maxLength={80} value={values.name} onChange={change} required /></label>
      <label>目的地城市<div className="new-city-row"><input name="newCity" data-field="city" value={values.city} onChange={change} maxLength={30} required /><button type="button" disabled={busy || !config.configured} onClick={event => submit(event, true)}>查找城市</button></div></label>
      {!!options.length && <div className="new-city-options">{options.map(item => <button type="button" key={item.adcode} onClick={() => { session.current.version++; session.current.abort?.abort(); setBusy(false); setValues(old => ({ ...old, city: item.name })); setMessage(`已选择 ${item.name}`) }}>{item.name} · {item.adcode}</button>)}</div>}
      <div className="new-date-row"><label>开始日期<input name="newDate" data-field="startDate" type="date" value={values.startDate} onChange={change} required /></label><label>旅行天数<input name="newDays" data-field="dayCount" type="number" min="1" max="30" step="1" value={values.dayCount} onChange={change} required /></label></div>
      <p className="new-trip-message" role="status">{message || (!config.configured ? '当前为演示模式；配置地图后可核对城市和在线搜索。' : '可规划 1—30 天，名称和时间之后仍可调整。')}</p>
      <div className="dialog-actions"><button type="button" onClick={onClose}>取消</button><button className="primary-button" disabled={busy} type="submit">{busy ? '处理中…' : '创建并开始规划'}</button></div>
    </form>
  </dialog>
}
