// 原生拖放只传 Place ID，不携带坐标；会话校验防止外部拖入或重复提交。
export const PLACE_MIME = 'application/x-tripflow-place'
let session = null
const listeners = new Set()
const emit = () => listeners.forEach((listener) => listener())
export function subscribeMapDrag(listener) { listeners.add(listener); return () => listeners.delete(listener) }
export function getDraggedPlaceId() { return session?.placeId ?? null }
export function endMapDrag() { if (session) { session = null; emit() } }
export function beginMapDrag(transfer, placeId) {
  endMapDrag()
  if (!transfer) return false
  const payload = { placeId, nonce: crypto.randomUUID() }
  try {
    transfer.setData(PLACE_MIME, JSON.stringify(payload))
    transfer.effectAllowed = 'copy'
    session = payload
    emit()
    return true
  } catch { return false }
}
export function canDropPlace(transfer) {
  return !!session && Array.from(transfer?.types ?? []).includes(PLACE_MIME)
}
export function consumeMapDrag(transfer) {
  if (!canDropPlace(transfer)) return null
  try {
    const payload = JSON.parse(transfer.getData(PLACE_MIME))
    if (payload.nonce !== session.nonce || payload.placeId !== session.placeId) return null
    const id = session.placeId
    endMapDrag()
    return id
  } catch { return null }
}
