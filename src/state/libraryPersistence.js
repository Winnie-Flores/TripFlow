import { createStore } from 'zustand/vanilla'
import { LIBRARY_KEY, createLibrary, parseLibrary } from './tripLibrary.js'
import { createDocument } from './document.js'
import { STORAGE_KEY } from './persistence.js'
export const librarySaveStatus = createStore(() => ({ status: 'loading', message: '正在读取旅行记录…' }))
export function startLibraryPersistence(store, { storage, events, delayMs = 250, statusStore = librarySaveStatus } = {}) {
  let api, writable = true, pending = false, stopped = false, timer, previous, lastDoc, lastTripId, changedAt
  const status = (state, message) => statusStore.setState({ status: state, message })
  try {
    api = storage ?? window.localStorage
    const saved = api.getItem(LIBRARY_KEY)
    if (saved !== null) {
      try { store.getState().restoreLibrary(saved); pending = true; status('saved', '已恢复旅行记录 · 修改将自动保存') }
      catch (error) { writable = false; status('blocked', `旅行记录未载入：${error.message} 原存档已保留，请先备份后再重新启用保存。`) }
    } else {
      const legacy = api.getItem(STORAGE_KEY)
      if (legacy !== null) {
        try { store.getState().replaceDocument(legacy, { archiveCurrent: false }); status('saved', '原旅行已迁移到旅行记录 · 原存档保留备份'); pending = true }
        catch (error) { writable = false; status('blocked', `原旅行未载入：${error.message} 原存档已保留。`) }
      } else { pending = true; status('saving', '正在保存第一条旅行记录…') }
    }
  } catch { writable = false; status('error', '本机存储不可用；旅行可在本页编辑，请及时导出备份。') }
  changedAt = store.getState().tripRecords[store.getState().trip.id]?.updatedAt ?? store.getState().tripCreatedAt
  lastTripId = store.getState().trip.id
  lastDoc = JSON.stringify(createDocument(store.getState()))
  previous = JSON.stringify(createLibrary(store.getState(), changedAt))
  const flush = () => {
    clearTimeout(timer)
    if (stopped || !pending || !writable) return
    try { parseLibrary(previous); api.setItem(LIBRARY_KEY, previous); pending = false; status('saved', '全部旅行已保存到本机浏览器。') }
    catch { writable = false; status('error', '旅行记录保存失败：存储空间不足或内容超出范围。原存档保留，请导出备份后整理记录。') }
  }
  const unsubscribe = store.subscribe((state) => {
    const document = JSON.stringify(createDocument(state))
    if (document !== lastDoc) { changedAt = state.trip.id !== lastTripId ? state.tripRecords[state.trip.id]?.updatedAt ?? new Date().toISOString() : new Date().toISOString(); lastDoc = document; lastTripId = state.trip.id }
    const next = JSON.stringify(createLibrary(state, changedAt))
    if (next === previous) return
    previous = next; pending = true
    if (writable) { status('saving', '正在保存旅行记录…'); clearTimeout(timer); timer = setTimeout(flush, delayMs) }
  })
  const target = events ?? (typeof window === 'undefined' ? null : window)
  const hidden = () => { if (typeof document !== 'undefined' && document.visibilityState === 'hidden') flush() }
  target?.addEventListener('pagehide', flush); target?.addEventListener('visibilitychange', hidden)
  if (pending && writable) flush()
  return { flush, retry() { try { api = storage ?? window.localStorage; writable = true; previous = JSON.stringify(createLibrary(store.getState(), changedAt)); pending = true; flush() } catch { writable = false; status('error', '本机存储仍不可用，请导出备份。') } },
    destroy() { flush(); stopped = true; clearTimeout(timer); unsubscribe(); target?.removeEventListener('pagehide', flush); target?.removeEventListener('visibilitychange', hidden) } }
}
