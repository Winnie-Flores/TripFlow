import { iconSvg } from './placeStyle.js'
import { beginMapDrag, endMapDrag } from '../drag/mapDrag.js'

// 高德 DOM 标记与演示平面共用同一原生拖放来源；不使用 SDK 坐标拖动。
export function createPlaceMarker(place, onAdd, map) {
  const root = document.createElement('div')
  root.className = 'place-marker'
  root.dataset.placeId = place.id
  root.style.setProperty('--pin-color', place.color)
  const handle = document.createElement('div')
  handle.className = 'map-pin'
  handle.draggable = true
  handle.tabIndex = 0
  handle.title = `拖动${place.name}到行程；也可点击安排`
  handle.setAttribute('aria-label', `拖动${place.name}`)
  const number = document.createElement('span')
  number.className = 'pin-number'
  const name = document.createElement('strong')
  name.textContent = place.name
  handle.append(number, name)
  const add = document.createElement('button')
  add.className = 'pin-add'
  add.type = 'button'
  add.textContent = place.category === 'hotel' ? '设为酒店' : '＋ 安排'
  add.setAttribute('aria-label', `安排${place.name}`)
  const edit = document.createElement('button')
  edit.className = 'pin-edit'; edit.type = 'button'; edit.textContent = '样式'
  edit.setAttribute('aria-label', `编辑${place.name}标记`)
  const editClick = (event) => { event.stopPropagation(); unlock(); window.dispatchEvent(new CustomEvent('tripflow:edit-place', { detail: place.id })) }
  edit.addEventListener('click', editClick)
  edit.addEventListener('pointerdown', (event) => event.stopPropagation())
  root.append(handle, add, edit)
  let originalDragEnable
  const lock = (event) => {
    event.stopPropagation()
    if (map && originalDragEnable === undefined) {
      originalDragEnable = map.getStatus().dragEnable
      map.setStatus({ dragEnable: false })
    }
  }
  const unlock = () => {
    if (map && originalDragEnable !== undefined) {
      map.setStatus({ dragEnable: originalDragEnable })
      originalDragEnable = undefined
    }
  }
  const end = () => { endMapDrag(); root.classList.remove('is-dragging'); unlock() }
  const start = (event) => {
    event.stopPropagation()
    if (!beginMapDrag(event.dataTransfer, place.id)) { event.preventDefault(); unlock(); return }
    root.classList.add('is-dragging')
  }
  const click = (event) => { event.stopPropagation(); unlock(); onAdd(place.id) }
  const stop = (event) => event.stopPropagation()
  handle.addEventListener('pointerdown', lock)
  handle.addEventListener('mousedown', lock)
  handle.addEventListener('dragstart', start)
  handle.addEventListener('dragend', end)
  add.addEventListener('click', click)
  add.addEventListener('pointerdown', stop)
  add.addEventListener('mousedown', stop)
  window.addEventListener('dragend', end)
  window.addEventListener('drop', end)
  window.addEventListener('pointerup', unlock)
  window.addEventListener('mouseup', unlock)
  window.addEventListener('blur', end)
  return {
    element: root,
    update(order, latest = place) { place = latest; root.style.setProperty('--pin-color', place.color); name.textContent = place.name; const orders = Array.isArray(order) ? order : order > 0 ? [order] : []; number.innerHTML = iconSvg(place); if (orders.length) { const badge = document.createElement('b'); badge.className = 'pin-order'; badge.textContent = orders.join('·'); number.append(badge) } root.classList.toggle('is-arranged', orders.length > 0) },
    destroy() {
      end()
      edit.removeEventListener('click', editClick)
      handle.removeEventListener('pointerdown', lock)
      handle.removeEventListener('mousedown', lock)
      handle.removeEventListener('dragstart', start)
      handle.removeEventListener('dragend', end)
      add.removeEventListener('click', click)
      add.removeEventListener('pointerdown', stop)
      add.removeEventListener('mousedown', stop)
      window.removeEventListener('dragend', end)
      window.removeEventListener('drop', end)
      window.removeEventListener('pointerup', unlock)
      window.removeEventListener('mouseup', unlock)
      window.removeEventListener('blur', end)
      root.remove()
    },
  }
}
