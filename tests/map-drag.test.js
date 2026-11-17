import test from 'node:test'
import assert from 'node:assert/strict'
import { beginMapDrag, endMapDrag, consumeMapDrag, canDropPlace, PLACE_MIME, getDraggedPlaceId } from '../src/drag/mapDrag.js'
const transfer = () => {
  const values = new Map()
  return { get types() { return [...values.keys()] }, setData: (k, v) => values.set(k, v), getData: (k) => values.get(k) }
}

test('原生拖放只能消费一次，不携带坐标，不接受外部/过期/伪造数据', () => {
  const data = transfer()
  assert.equal(consumeMapDrag(data), null)
  assert.equal(beginMapDrag(data, 'a'), true)
  assert.equal(canDropPlace(data), true)
  assert.deepEqual(Object.keys(JSON.parse(data.getData(PLACE_MIME))).sort(), ['nonce', 'placeId'])
  assert.equal(consumeMapDrag(data), 'a')
  assert.equal(consumeMapDrag(data), null)
  const old = transfer()
  beginMapDrag(old, 'b')
  const current = transfer()
  beginMapDrag(current, 'a')
  assert.equal(consumeMapDrag(old), null)
  current.setData(PLACE_MIME, '{invalid')
  assert.equal(consumeMapDrag(current), null)
  endMapDrag()
  assert.equal(getDraggedPlaceId(), null)
})

test('取消拖放和未提供 DataTransfer 不留下会话', () => {
  const data = transfer()
  beginMapDrag(data, 'a')
  endMapDrag()
  assert.equal(consumeMapDrag(data), null)
  assert.equal(beginMapDrag(null, 'a'), false)
  assert.equal(getDraggedPlaceId(), null)
})
