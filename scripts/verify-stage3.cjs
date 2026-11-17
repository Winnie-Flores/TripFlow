const { expandEditorsForRegression } = require('./browser-helpers.cjs')
/* Real browser UI with mocked SDK boundary; never a real AMap acceptance test. */
const puppeteer = require(process.env.TRIPFLOW_PUPPETEER_MODULE || 'puppeteer-core')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const path = require('node:path')
const { setTimeout: wait } = require('node:timers/promises')
const { mockSdk } = require('./verify-stage1.cjs')
async function run() {
  const server = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5187', '--strictPort'],
    { env: { ...process.env, VITE_AMAP_KEY: 'tripflow-test-key', VITE_AMAP_SECURITY_JS_CODE: 'tripflow-test-code' }, stdio: 'ignore' })
  let browser, page
  try {
    let ready = false
    for (let i = 0; i < 60; i++) { try { const r = await fetch('http://127.0.0.1:5187'); await r.body.cancel(); if (r.ok) { ready = true; break } } catch { /* starting */ } await wait(100) }
    assert.ok(ready, 'QA server unavailable')
    browser = await puppeteer.launch({ executablePath: process.env.TRIPFLOW_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
    page = await browser.newPage(); await expandEditorsForRegression(page); await page.evaluateOnNewDocument(() => { localStorage.removeItem('tripflow.document.v1'); localStorage.removeItem('tripflow.trips.v1') }); page.setDefaultTimeout(6000)
    await page.setViewport({ width: 1440, height: 1200 })
    const errors = []; page.on('pageerror', (e) => errors.push(e.message))
    await page.setRequestInterception(true)
    page.on('request', (r) => r.url().startsWith('https://webapi.amap.com/maps?') ? r.respond({ contentType: 'text/javascript', body: mockSdk }) : r.continue())
    await page.goto('http://127.0.0.1:5187', { waitUntil: 'networkidle0' })
    await page.waitForSelector('.map-pin')
    const click = async (selector) => { await page.$eval(selector, (el) => el.scrollIntoView({ block: 'center' })); await page.click(selector) }
    const requestCount = async (n) => page.waitForFunction((n) => window.__qa.requests.length === n, {}, n)
    const done = async (n, fail = false) => page.evaluate((n, fail) => window.__qa.requests[n].done(fail), n, fail)
    const add = async () => { if (!await page.$('.candidate-add')) await click('.explore-heading button'); await click('[data-candidate-id="amap:B001B0I4K0"] .candidate-add'); await click('[data-candidate-id="amap:B0FFF5V6F4"] .candidate-add') }
    await add(); await requestCount(1); await done(0); await page.waitForSelector('.route-summary.ready')
    await click('[aria-label="在第 1 天后插入"]'); await add(); await requestCount(2); await done(1)
    // Reverse day 2 so overview needs two distinct directional legs.
    await click('.day-section.is-selected .visit-list > div:first-child .visit-actions button:nth-child(2)')
    await requestCount(3); await done(2); await page.waitForSelector('.route-summary.ready')
    await click('.route-scope button:nth-child(2)')
    await requestCount(4); await done(3, true)
    await requestCount(5); await done(4); await page.waitForSelector('.route-summary.partial')
    assert.match(await page.$eval('.route-summary', (el) => el.textContent), /1\/2/)
    assert.equal(await page.evaluate(() => window.__qa.lines.length), 1)
    assert.equal(await page.$$('.day-pin-labels span').then((x) => x.length), 4)
    assert.match(await page.$eval('.daily-routes', (el) => el.textContent), /步行可能受跨江/)
    await click('.route-summary button'); await requestCount(6); await done(5); await requestCount(7); await done(6)
    await page.waitForSelector('.route-summary.ready')
    const colors = await page.evaluate(() => window.__qa.lines.map((line) => line.opts.strokeColor))
    assert.equal(new Set(colors).size, 2)
    assert.equal(await page.$$('.route-leg').then((x) => x.length), 2)
    await click('[aria-label="交通方式"] button:nth-child(2)'); await requestCount(8)
    await click('.route-scope button:first-child')
    assert.equal(await page.evaluate(() => window.__qa.lines.length), 0)
    await done(7); await requestCount(9)
    assert.equal(await page.evaluate(() => window.__qa.lines.length), 0)
    await done(8); await page.waitForSelector('.route-summary.ready')
    assert.equal(await page.evaluate(() => window.__qa.requests[8].mode), 'driving')
    await page.screenshot({ path: '/tmp/tripflow-stage3-desktop.png', fullPage: true })
    await page.setViewport({ width: 390, height: 844 }); await click('.route-scope button:nth-child(2)')
    await requestCount(10); await done(9); await requestCount(11); await done(10); await page.waitForSelector('.route-summary.ready')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: '/tmp/tripflow-stage3-mobile.png', fullPage: true })
    await click('.mode-banner button'); await page.waitForSelector('.demo-map')
    assert.equal(await page.evaluate(() => window.__qa.lines.length), 0)
    assert.equal(await page.evaluate(() => window.__qa.destroyed), 1)
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ overview: true, partialAndRetry: true, dayColorsAndNumbering: true, staleResponse: true, driving: true, mobile: true, cleanup: true, pageErrors: errors, realAmapVerified: false }, null, 2))
  } catch (error) { await page?.screenshot({ path: '/tmp/tripflow-stage3-failure.png', fullPage: true }).catch(() => {}); throw error }
  finally { await browser?.close(); server.kill('SIGTERM') }
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
