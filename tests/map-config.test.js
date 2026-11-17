import test from 'node:test'
import assert from 'node:assert/strict'
import { readMapConfig } from '../src/map/config.js'

test('无配置或只有一个值时禁止加载 SDK，并精确提示缺项', () => {
  assert.equal(readMapConfig().configured, false)
  assert.deepEqual(readMapConfig({ VITE_AMAP_KEY: 'sample' }).missing, ['VITE_AMAP_SECURITY_JS_CODE'])
  assert.deepEqual(readMapConfig({ VITE_AMAP_SECURITY_JS_CODE: 'sample' }).missing, ['VITE_AMAP_KEY'])
})

test('配置去除空白，错误类型不被视为已配置', () => {
  assert.equal(readMapConfig({ VITE_AMAP_KEY: 123 }).configured, false)
  assert.equal(readMapConfig({ VITE_AMAP_KEY: ' ', VITE_AMAP_SECURITY_JS_CODE: '\n' }).missing.length, 2)
  const config = readMapConfig({ VITE_AMAP_KEY: ' sample-key ', VITE_AMAP_SECURITY_JS_CODE: ' sample-code ' })
  assert.equal(config.configured, true)
  assert.equal(config.key, 'sample-key')
  assert.equal(config.securityJsCode, 'sample-code')
})
