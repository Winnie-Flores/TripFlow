import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { createDocument, MAX_FILE_BYTES, parseDocument } from '../state/document.js'
import { tripStore } from '../state/tripStore.js'
import { persistence } from '../state/storageRuntime.js'
import { librarySaveStatus as saveStatus } from '../state/libraryPersistence.js'
export default function DataBar({ records = false }) {
  const saved = useStore(saveStatus), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const fileRef = useRef(null), alive = useRef(true), sequence = useRef(0)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const exportFile = () => {
    try {
      const content = JSON.stringify(createDocument(tripStore.getState()))
      parseDocument(content)
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = `TripFlow-${tripStore.getState().trip.startDate}.json`; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage('JSON 备份已生成，请保留下载文件。')
    } catch (error) { setMessage(`未导出：${error.message} 可精简备注后重试。`) }
  }
  const importFile = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    const current = ++sequence.current, before = tripStore.getState()
    setBusy(true); setMessage('正在校验文件…')
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('文件不能超过 2 MB。')
      const content = await file.text(), data = parseDocument(content)
      if (!alive.current || current !== sequence.current) return
      const state = tripStore.getState()
      if (['trip', 'places', 'visits', 'days'].some((key) => state[key] !== before[key])) throw new Error('读取期间行程已变化，请重新选择文件。')
      if (!window.confirm(`载入「${data.trip.name}」共 ${data.days.length} 天、${Object.keys(data.visits).length} 次游览？将打开此旅行；当前旅行会保留在旅行记录中。同 ID 导入会更新对应旅行。`)) { setMessage('已取消导入，当前旅行保留。'); return }
      tripStore.getState().replaceDocument(content)
      persistence.retry()
      setMessage('旅行已载入，地图与道路将重新生成。')
    } catch (error) { if (alive.current && current === sequence.current) setMessage(`未导入：${error.message} 当前旅行及其他记录保持不变。`) }
    finally { if (alive.current && current === sequence.current) setBusy(false) }
  }
  return <section className="data-bar" aria-label="旅行保存与备份">
    <div className={`save-state ${saved.status}`} role="status"><span className="save-dot" aria-hidden="true" /><span>{saved.message}</span></div>
    <div className="data-actions"><button onClick={exportFile}>{records ? '导出当前旅行' : '导出 JSON'}</button><button disabled={busy} onClick={() => fileRef.current.click()}>{busy ? '正在校验…' : records ? '导入旅行' : '导入 JSON'}</button>
      {['blocked', 'error'].includes(saved.status) && <button onClick={() => { if (saved.status !== 'blocked' || window.confirm('用当前可见的旅行记录替换本机未载入的原存档并重新启用保存？请确认已另行备份原存档。')) persistence.retry() }}>重新启用保存</button>}
      <input ref={fileRef} className="file-picker" type="file" accept=".json,application/json" aria-label="导入旅行文件" onChange={importFile} />
    </div>
    {message && <p className="data-feedback" role="status">{message}</p>}
  </section>
}
