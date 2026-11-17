const { expandEditorsForRegression } = require('./browser-helpers.cjs')
/* Optional actual-browser checks. Tool install/configuration: README.md.
 * Uses native HTML drag and dnd-kit pointer/keyboard paths, never invokes the app store.
 * AMap integration is mocked; this is not a real AMap acceptance test.
 */
const puppeteer = require(process.env.TRIPFLOW_PUPPETEER_MODULE || 'puppeteer-core')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const path = require('node:path')
const { setTimeout: wait } = require('node:timers/promises')
const { mockSdk } = require('./verify-stage1.cjs')
const chrome = process.env.TRIPFLOW_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const hhl = '[data-place-id="amap:B001B0I4K0"]', hbx = '[data-place-id="amap:B0FFF5V6F4"]'
const servers = []
async function server(port, live) {
  const child = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: process.cwd(), env: { ...process.env, VITE_AMAP_KEY: live ? 'tripflow-test-key' : '', VITE_AMAP_SECURITY_JS_CODE: live ? 'tripflow-test-code' : '' }, stdio: 'ignore' })
  servers.push(child)
  const url = `http://127.0.0.1:${port}`
  for (let i = 0; i < 70; i++) { try { const response = await fetch(url, { headers: { Connection: 'close' } }); await response.body?.cancel(); if (response.ok) return url } catch { /* local server starting */ } await wait(100) }
  throw new Error(`QA server unavailable: ${port}`)
}
async function scroll(page, selector) { await page.$eval(selector, (element) => element.scrollIntoView({ block: 'nearest' })); await wait(80) }
async function center(page, selector) {
  const rect = await (await page.$(selector))?.boundingBox()
  assert.ok(rect, `Missing ${selector}`)
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}
async function fill(page, selector, value) {
  await page.focus(selector)
  await page.$eval(selector, (element, text) => {
    const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, text)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }, String(value))
}
async function edit(page, selector, value) { await scroll(page, selector); await fill(page, selector, value); await page.keyboard.press('Tab'); await wait(50) }
async function configure(page, values) {
  await page.$eval('.settings-disclosure', el => { el.open = true })
  for (const [field, value] of Object.entries(values)) await fill(page, `.trip-settings [name="${field}"]`, value)
  await page.click('.settings-save'); await wait(80)
}
const day = (id) => `[data-day-id="${id}"]`
const slot = (id, index) => `${day(id)} .drop-slot[data-insert-index="${index}"]`
const handle = (id) => `[data-visit-id="${id}"] .sort-handle`
const visits = (page, id) => page.$$eval(`${day(id)} [data-visit-id]`, (nodes) => nodes.map((node) => node.dataset.visitId))
const days = (page) => page.$$eval('.day-section', (nodes) => nodes.map((node) => node.dataset.dayId))
const dates = (page) => page.$$eval('.day-select time', (nodes) => nodes.map((node) => node.dateTime))
const allVisits = (page) => page.$$eval('[data-visit-id]', (nodes) => nodes.map((node) => node.dataset.visitId))
async function nativeDrag(page, source, target) {
  await scroll(page, target)
  await page.setDragInterception(true)
  await page.mouse.dragAndDrop(await center(page, source), await center(page, target), { delay: 70 })
  await wait(90)
}
async function move(page, source, target, { cancel = false, preview } = {}) {
  await page.setDragInterception(false)
  await scroll(page, source)
  const from = await center(page, source)
  await page.mouse.move(from.x, from.y); await page.mouse.down()
  await page.mouse.move(from.x + 10, from.y + 8, { steps: 3 }); await wait(80)
  await scroll(page, target)
  const to = await center(page, target)
  await page.mouse.move(to.x, to.y, { steps: 12 }); await wait(90)
  // dnd-kit may auto-scroll while the pointer approaches an edge. Follow the actual visible slot.
  for (let i = 0; i < 3; i++) {
    const adjusted = await center(page, target)
    await page.mouse.move(adjusted.x, adjusted.y, { steps: 3 }); await wait(50)
  }
  if (preview) await preview()
  if (cancel) await page.keyboard.press('Escape')
  await page.mouse.up(); await wait(100)
}
async function confirmClick(page, selector, accept) {
  page.once('dialog', (dialog) => accept ? dialog.accept() : dialog.dismiss())
  await page.click(selector); await wait(100)
}
async function run() {
  let browser, currentPage, result
  try {
    const demoUrl = await server(5185, false), liveUrl = await server(5186, true)
    browser = await puppeteer.launch({ executablePath: chrome, headless: true })
    const errors = [], page = await browser.newPage(); await expandEditorsForRegression(page); currentPage = page
    await page.evaluateOnNewDocument(() => { localStorage.removeItem('tripflow.document.v1'); localStorage.removeItem('tripflow.trips.v1') });
    page.setDefaultTimeout(5000); page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewport({ width: 1440, height: 1600 }); await page.goto(demoUrl, { waitUntil: 'networkidle0' })
    await configure(page, { name: '跨年武汉行', city: '武汉', startDate: '2026-12-30', dayCount: 2 })
    let [d1, d2] = await days(page)
    assert.deepEqual(await dates(page), ['2026-12-30', '2026-12-31'])
    assert.equal(await page.$eval('h1', (el) => el.textContent), '跨年武汉行')
    await nativeDrag(page, hhl + ' .map-pin', slot(d1, 0))
    const [original] = await visits(page, d1)
    await edit(page, `[data-visit-id="${original}"] textarea`, '日落时登楼')
    await edit(page, `[data-visit-id="${original}"] input`, 95)
    await move(page, handle(original), slot(d2, 0), { cancel: true, preview: async () => {
      assert.deepEqual(await visits(page, d1), [original]); assert.deepEqual(await visits(page, d2), [])
      assert.ok(await page.$('.drop-slot.is-over'))
    } })
    assert.deepEqual(await visits(page, d1), [original])
    await move(page, handle(original), slot(d2, 0))
    assert.deepEqual(await visits(page, d2), [original]); assert.deepEqual(await visits(page, d1), [])
    assert.equal(await page.$eval(`[data-visit-id="${original}"] textarea`, (el) => el.value), '日落时登楼')
    assert.equal(await page.$eval(`[data-visit-id="${original}"] input`, (el) => el.value), '95')
    await nativeDrag(page, hhl + ' .map-pin', slot(d1, 0))
    const [copy] = await visits(page, d1); assert.notEqual(copy, original)
    await nativeDrag(page, hhl + ' .map-pin', slot(d1, 1)); const repeated = (await visits(page,d1))[1]; assert.notEqual(repeated,copy); await scroll(page,`[data-visit-id="${repeated}"] .remove-visit`); await page.click(`[data-visit-id="${repeated}"] .remove-visit`)
    await move(page, handle(original), slot(d1, 1)); assert.equal((await visits(page,d1)).length,2); await move(page,handle(original),slot(d2,0))
    assert.deepEqual(await visits(page, d2), [original]); assert.deepEqual(await visits(page, d1), [copy])
    // A canceled shortening must not delete occupied trailing days.
    await fill(page, '.trip-settings [name="dayCount"]', 1)
    await confirmClick(page, '.settings-save', false)
    assert.equal((await days(page)).length, 2); assert.deepEqual(await visits(page, d2), [original])
    await configure(page, { dayCount: 2 })
    await nativeDrag(page, hbx + ' .map-pin', slot(d1, 1))
    const second = (await visits(page, d1))[1]
    await move(page, handle(second), slot(d1, 0))
    assert.deepEqual(await visits(page, d1), [second, copy])
    assert.equal(await page.$eval(hbx + ' .pin-number', (el) => el.textContent), '1')
    assert.equal(await page.$eval(hhl + ' .pin-number', (el) => el.textContent), '2')
    await scroll(page, '[aria-label="选择第 2 天"]'); await page.click('[aria-label="选择第 2 天"]')
    assert.equal(await page.$eval(hhl + ' .pin-number', (el) => el.textContent), '1')
    assert.ok(await page.$(hbx + ' .pin-number svg')); assert.equal(await page.$(hbx + ' .pin-order'), null)
    await scroll(page, `[data-visit-id="${copy}"] .remove-visit`); await page.click(`[data-visit-id="${copy}"] .remove-visit`)
    await move(page, handle(original), slot(d1, 0))
    assert.deepEqual(await visits(page, d1), [original, second]); assert.deepEqual(await visits(page, d2), [])
    await move(page, handle(original), slot(d1, 2))
    assert.deepEqual(await visits(page, d1), [second, original])
    // Accessible cross-day select keeps the original ID and form values.
    await scroll(page, `[data-visit-id="${original}"] select`); await page.select(`[data-visit-id="${original}"] select`, d2)
    assert.deepEqual(await visits(page, d2), [original])
    assert.equal(await page.$eval(`[data-visit-id="${original}"] input`, (el) => el.value), '95')
    await move(page, handle(original), slot(d1, 1))
    // dnd-kit keyboard sorting and cancellation still work with nested day/slot targets.
    await scroll(page, handle(second)); await page.focus(handle(second)); await page.keyboard.press('Space'); await wait(80); await page.keyboard.press('ArrowDown'); await wait(80); await page.keyboard.press('Escape'); await wait(80)
    assert.deepEqual(await visits(page, d1), [second, original])
    await page.focus(handle(second)); await page.keyboard.press('Space'); await wait(80); await page.keyboard.press('ArrowDown'); await wait(80); await page.keyboard.press('Space'); await wait(100)
    assert.deepEqual(await visits(page, d1), [original, second])
    // Invalid pointer drop outside all date containers must restore order.
    await move(page, handle(original), '.topbar')
    assert.deepEqual(await visits(page, d1), [original, second])
    await page.screenshot({ path: '/tmp/tripflow-stage2-desktop.png', fullPage: true })
    await scroll(page, '[aria-label="删除第 1 天"]'); await confirmClick(page, '[aria-label="删除第 1 天"]', false)
    assert.deepEqual(await visits(page, d1), [original, second])
    await confirmClick(page, '[aria-label="删除第 1 天"]', true)
    assert.deepEqual(await days(page), [d2]); assert.deepEqual(await allVisits(page), [])
    assert.deepEqual(await dates(page), ['2026-12-30'])
    await page.click('[aria-label="在第 1 天前插入"]')
    assert.equal((await days(page))[1], d2)
    await page.click('[aria-label="在第 2 天后插入"]')
    assert.deepEqual(await dates(page), ['2026-12-30', '2026-12-31', '2027-01-01'])
    const beforeReset = await days(page)
    await nativeDrag(page, hhl + ' .map-pin', slot(beforeReset[2], 0))
    const contentBeforeReset = await allVisits(page)
    await confirmClick(page, '.settings-reset', false)
    assert.deepEqual(await days(page), beforeReset); assert.deepEqual(await allVisits(page), contentBeforeReset)
    await confirmClick(page, '.settings-reset', true)
    assert.deepEqual(await allVisits(page), []); assert.notDeepEqual(await days(page), beforeReset)
    ;[d1, d2] = await days(page)
    await nativeDrag(page, hhl + ' .map-pin', slot(d1, 0))
    await fill(page, '.trip-settings [name="city"]', '上海')
    await confirmClick(page, '.settings-save', false)
    assert.ok(await page.$(hhl)); assert.equal((await allVisits(page)).length, 1)
    await confirmClick(page, '.settings-save', true)
    assert.equal(await page.$(hhl), null); assert.deepEqual(await allVisits(page), [])
    assert.ok(await page.$('.demo-map')); assert.equal((await page.$$('.map-pin')).length, 0)
    await configure(page, { city: '武汉' }); assert.ok(await page.$(hhl))
    await page.setViewport({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await configure(page, { name: 'W'.repeat(80) })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await configure(page, { name: '跨年武汉行' })
    await page.click('.mobile-view-switch button:last-child');
    await scroll(page, '[aria-label="安排黄鹤楼"]'); await page.click('[aria-label="安排黄鹤楼"]')
    assert.equal((await allVisits(page)).length, 1)
    await page.screenshot({ path: '/tmp/tripflow-stage2-mobile.png', fullPage: true })
    // Live adapter stub: preview/notes don't recalculate, selected day updates and stale routes clear.
    const live = await browser.newPage(); await expandEditorsForRegression(live); currentPage = live
    await live.evaluateOnNewDocument(() => { localStorage.removeItem('tripflow.document.v1'); localStorage.removeItem('tripflow.trips.v1') });
    live.setDefaultTimeout(5000); live.on('pageerror', (error) => errors.push(error.message))
    await live.setViewport({ width: 1440, height: 1600 }); await live.setRequestInterception(true)
    live.on('request', (request) => request.url().startsWith('https://webapi.amap.com/maps?')
      ? request.respond({ status: 200, contentType: 'application/javascript', body: mockSdk }) : request.continue())
    await live.goto(liveUrl, { waitUntil: 'networkidle0' }); await live.waitForSelector(hhl)
    await configure(live, { dayCount: 2 }); [d1, d2] = await days(live)
    await nativeDrag(live, hhl + ' .map-pin', slot(d1, 0)); await nativeDrag(live, hbx + ' .map-pin', slot(d1, 1))
    await live.waitForFunction(() => window.__qa.requests.length === 1)
    await live.evaluate(() => window.__qa.requests[0].done()); await live.waitForSelector('.route-summary.ready')
    const [moving] = await visits(live, d1)
    await edit(live, `[data-visit-id="${moving}"] textarea`, '不重算道路')
    await edit(live, `[data-visit-id="${moving}"] input`, 75)
    assert.equal(await live.evaluate(() => window.__qa.requests.length), 1)
    await move(live, handle(moving), slot(d2, 0), { cancel: true, preview: async () => {
      assert.equal(await live.evaluate(() => window.__qa.lines.length), 1)
      assert.equal(await live.evaluate(() => window.__qa.requests.length), 1)
    } })
    await move(live, handle(moving), slot(d2, 0))
    assert.equal(await live.evaluate(() => window.__qa.lines.length), 0)
    assert.equal(await live.evaluate(() => window.__qa.requests.length), 1)
    assert.equal(await live.$eval(hhl + ' .pin-number', (el) => el.textContent), '1')
    assert.deepEqual(await live.evaluate(() => window.__qa.markers.slice(0, 2).map((marker) => marker.opts.position)), [[114.302467, 30.544649], [114.298068, 30.547412]])
    assert.deepEqual(errors, [])
    result = { tripSettings: true, continuousDates: true, nativeCrossDayAdd: true, crossDayPreservesId: true,
      previewIsSeparate: true, duplicateGuard: true, cancelAndInvalidDrop: true, firstLastInsertion: true, keyboard: true,
      notesAndDuration: true, selectedDayNumbering: true, confirmDeleteResizeResetCity: true, mobile: true,
      mockMapAndRouteRegression: true, realAmapVerified: false, pageErrors: errors }
  } catch (error) {
    if (currentPage) await currentPage.screenshot({ path: '/tmp/tripflow-stage2-failure.png', fullPage: true }).catch(() => {})
    throw error
  } finally {
    if (browser) {
      const closed = await Promise.race([browser.close().then(() => true).catch(() => false), wait(5000).then(() => false)])
      if (!closed) browser.process()?.kill('SIGKILL')
    }
    await Promise.all(servers.map((child) => new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) { resolve(); return }
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve() }, 2000)
      child.once('exit', () => { clearTimeout(timer); resolve() })
      child.kill('SIGTERM')
    })))
  }
  console.log(JSON.stringify(result, null, 2))
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
