import { createStore } from 'zustand/vanilla'
import { createDocument, parseDocument } from './document.js'
export const STORAGE_KEY = 'tripflow.document.v1'
export const saveStatus = createStore(() => ({ status: 'loading', message: '正在读取本机旅行…' }))
export function startPersistence(store, { storage, events, delayMs = 250, statusStore = saveStatus } = {}) {
  let storageApi, timer, stopped = false, writable = true, pending = false
  const status = (kind, message) => statusStore.setState({ status: kind, message })
  try {
    storageApi = storage ?? window.localStorage
    const content = storageApi.getItem(STORAGE_KEY)
    if (content !== null) {
      try { store.getState().replaceDocument(content, { archiveCurrent: false }); status('saved', '已恢复本机保存的旅行。') }
      catch (error) { writable = false; status('blocked', `本机存档未载入：${error.message} 原存档已保留，可先导出当前旅行，再点击“重新启用保存”。`) }
    } else status('saved', '自动保存已启用 · 仅存于本机浏览器')
  } catch { writable = false; status('error', '本机存储不可用；可继续规划并导出 JSON 备份。') }
  let previous = JSON.stringify(createDocument(store.getState()))
  const flush = () => {
    clearTimeout(timer)
    if (stopped || !pending || !writable) return
    try { parseDocument(previous); storageApi.setItem(STORAGE_KEY, previous); pending = false; status('saved', '已保存到本机浏览器。') }
    catch { writable = false; status('error', '保存失败：存储受限或数据超出范围（最多 2 MB）。可先精简备注，或导出 JSON 备份。') }
  }
  const unsubscribe = store.subscribe((state) => {
    const next = JSON.stringify(createDocument(state))
    if (next === previous) return
    previous = next; pending = true
    if (!writable) return
    status('saving', '正在保存…'); clearTimeout(timer); timer = setTimeout(flush, delayMs)
  })
  const pagehide = () => flush()
  const visibility = () => { if (typeof document !== 'undefined' && document.visibilityState === 'hidden') flush() }
  const target = events ?? (typeof window === 'undefined' ? null : window)
  target?.addEventListener('pagehide', pagehide)
  target?.addEventListener('visibilitychange', visibility)
  return {
    flush,
    retry() {
      try { storageApi = storage ?? window.localStorage; writable = true; previous = JSON.stringify(createDocument(store.getState())); pending = true; flush() }
      catch { writable = false; status('error', '本机存储仍不可用，请导出 JSON 备份。') }
    },
    destroy() { flush(); stopped = true; clearTimeout(timer); unsubscribe(); target?.removeEventListener('pagehide', pagehide); target?.removeEventListener('visibilitychange', visibility) },
  }
}
