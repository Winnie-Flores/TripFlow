/* Browser acceptance for the five improvements. Set TRIPFLOW_REAL=1 after building to use AMap. */
const puppeteer = require(process.env.TRIPFLOW_PUPPETEER_MODULE || 'puppeteer-core')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { setTimeout: wait } = require('node:timers/promises')
const { mockSdk } = require('./verify-stage1.cjs')
const real = process.env.TRIPFLOW_REAL === '1'
const port = real ? '4179' : '5194'
const base = `http://127.0.0.1:${port}`
const sdk = mockSdk.replace('window.___onAPILoaded();', `
MockMap.prototype.setZoomAndCenter=function(){};
class Roads { constructor(mode){this.mode=mode} clear(){} search(a,b,cb){
 window.__qa.requests.push({mode:this.mode});
 setTimeout(()=>cb('complete',{routes:[{distance:900,time:600,steps:[{path:[a,b]}]}]}),50);
}}
window.AMap.Walking=class extends Roads{constructor(){super('walking')}};
window.AMap.Driving=class extends Roads{constructor(){super('driving')}};
window.___onAPILoaded();`)
async function run() {
  const { createTripStore } = await import('../src/state/tripStore.js')
  const { createLibrary } = await import('../src/state/tripLibrary.js')
  const store = createTripStore({today:'2026-11-11'}), state = () => store.getState()
  const wuhan = state().trip.id
  for (const id of ['amap:B001B0I4K0','amap:B0FFF5V6F4','amap:B001B1H7IS']) assert.ok(state().addVisit(id,state().days[0].id))
  assert.ok(state().createTrip({name:'杭州历史',city:'杭州',startDate:'2025-10-01',dayCount:1,cityInfo:{name:'杭州',adcode:'330100',center:[120.155,30.25]}}).ok)
  state().setTripStatus(state().trip.id,'visited')
  assert.ok(state().openTrip(wuhan).ok)
  const seed = JSON.stringify(createLibrary(state()))
  const server = spawn(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),...(real?['preview']:[]),'--host','127.0.0.1','--port',port,'--strictPort'],{
    env:{...process.env,...(!real?{VITE_AMAP_KEY:'test-key',VITE_AMAP_SECURITY_JS_CODE:'test-code'}:{})},stdio:'ignore',
  })
  const keep = setInterval(()=>{},1000)
  let browser, page
  try {
    for (let i=0;i<60;i++) { try { if ((await fetch(base)).ok) break } catch { /* server starting */ } await wait(100) }
    browser = await puppeteer.launch({executablePath:process.env.TRIPFLOW_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
    page = await browser.newPage()
    page.setDefaultTimeout(20000)
    await page.setViewport({width:1440,height:1100})
    const errors = []
    page.on('pageerror',e=>errors.push(e.message))
    await page.evaluateOnNewDocument(value=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('tripflow.trips.v1',value);sessionStorage.setItem('seeded','yes')}},seed)
    if (!real) {
      await page.setRequestInterception(true)
      page.on('request',r=>r.url().startsWith('https://webapi.amap.com/maps?')?r.respond({contentType:'text/javascript',body:sdk}):r.continue())
    }
    const click = async selector => { await page.$eval(selector,el=>el.scrollIntoView({block:'center'})); await page.click(selector) }
    const fill = (selector,value) => page.$eval(selector,(el,value)=>{
      const prototype = el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(prototype,'value').set.call(el,value)
      el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}))
    },value)
    const ready = () => page.waitForSelector('.route-summary.ready',{timeout:45000})
    const count = async selector => (await page.$$(selector)).length
    const departure = '[aria-label="第1天出发时间"]'
    const segment = '[aria-label="第1天第1段交通方式"]'
    const artifacts = fs.mkdtempSync(`/tmp/tripflow-improvements-${real?'real':'mock'}-`)
    console.log('Artifacts:',artifacts)
    await page.goto(base,{waitUntil:'networkidle2'})
    await ready()
    assert.ok(await page.$eval('.history-controls button:first-child',el=>el.disabled))
    await click('.visit-details summary'); await click('.visit-details[open] .remove-visit')
    assert.equal(await count('[data-visit-id]'),2)
    await click('.history-controls button:first-child'); assert.equal(await count('[data-visit-id]'),3)
    await click('.history-controls button:last-of-type'); assert.equal(await count('[data-visit-id]'),2)
    await click('.history-controls button:first-child'); await ready()
    await click('.route-disclosure summary'); await page.select(segment,'driving'); await ready()
    assert.equal(await page.$eval(segment,el=>el.value),'driving')
    if(!real) assert.deepEqual((await page.evaluate(()=>window.__qa.requests.map(r=>r.mode))).slice(-2),['driving','walking'])
    await fill(departure,'08:00')
    const second = await page.$$eval('[data-visit-id]',els=>els[1].dataset.visitId)
    const visit = `[data-visit-id="${second}"]`
    await click(`${visit} .visit-details summary`)
    await fill(`${visit} input[type=time]`,'10:00')
    await fill(`${visit} textarea`,'午饭 <script>alert(1)</script> & 备忘')
    await click('.day-timeline summary')
    assert.match(await page.$eval('.day-timeline',el=>el.innerText),/预约 10:00/)
    await click('.explore-heading button'); await page.select('[aria-label="地点分类筛选"]','shopping')
    const shopping = await page.$eval('.candidate-card',el=>el.dataset.candidateId)
    await click(`[data-candidate-id="${shopping}"] .favorite-toggle`)
    await click('.place-filters label:nth-child(2) input')
    assert.equal(await count('.candidate-card'),1)
    assert.equal(await page.$eval('[data-place-id="amap:B001B0I4K0"]',el=>getComputedStyle(el).display!=='none'),true)
    await page.screenshot({path:path.join(artifacts,'desktop.png'),fullPage:true})
    await click('.readable-export-open')
    assert.equal(await count('.readable-report script'),0)
    assert.match(await page.$eval('.readable-report',el=>el.textContent),/<script>alert\(1\)<\/script>/)
    const session = await page.createCDPSession()
    await session.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:artifacts})
    await click('.print-toolbar button:first-child')
    for(let i=0;i<30&&!fs.readdirSync(artifacts).some(file=>file.endsWith('.html'));i++) await wait(100)
    const file = fs.readdirSync(artifacts).find(file=>file.endsWith('.html'))
    assert.ok(file)
    const html = fs.readFileSync(path.join(artifacts,file),'utf8')
    assert.match(html,/&lt;script&gt;/)
    assert.match(html,/11:00 离开/)
    assert.match(html,/09:\d{2}/)
    await page.emulateMediaType('print')
    await page.pdf({path:path.join(artifacts,'itinerary.pdf'),format:'A4',printBackground:true,margin:{top:'12mm',bottom:'12mm',left:'12mm',right:'12mm'}})
    await page.emulateMediaType('screen')
    await page.screenshot({path:path.join(artifacts,'export.png')})
    await click('.print-toolbar button:last-child'); await page.waitForSelector('.save-state.saved')
    await page.reload({waitUntil:'networkidle2'}); await ready()
    assert.equal(await page.$eval(departure,el=>el.value),'08:00')
    assert.equal(await page.$eval(segment,el=>el.value),'driving')
    assert.equal(await page.$eval(`${visit} input[type=time]`,el=>el.value),'10:00')
    await click('.explore-heading button')
    assert.equal(await page.$eval(`[data-candidate-id="${shopping}"] .favorite-toggle`,el=>el.getAttribute('aria-pressed')),'true')
    assert.ok(await page.$eval('.history-controls button:first-child',el=>el.disabled))
    for (const width of [1280,1024,767,390]) {
      await page.setViewport({width,height:900})
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`)
    }
    await page.screenshot({path:path.join(artifacts,'mobile.png'),fullPage:true})
    await click('.main-navigation button:last-child')
    await page.select('[aria-label="旅行状态筛选"]','visited')
    assert.equal(await count('.trip-record-card'),1)
    assert.match(await page.$eval('.trip-record-card h2',el=>el.textContent),/杭州/)
    await page.select('[aria-label="旅行年份筛选"]','2025'); assert.equal(await count('.trip-record-card'),1)
    await page.select('[aria-label="旅行年份筛选"]','2026'); assert.equal(await count('.trip-record-card'),0)
    await click('.record-filters button'); assert.equal(await count('.trip-record-card'),2)
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
    assert.deepEqual(errors,[])
    console.log(JSON.stringify({undoRedo:true,perLegMode:true,timeline:true,favoriteFilters:true,htmlDownload:true,pdfPrint:true,restoreFields:true,recordFilters:true,responsive:true,realAmapVerified:real}))
  } catch(error) {
    await page?.screenshot({path:'/tmp/tripflow-improvements-failure.png',fullPage:true}).catch(()=>{})
    throw error
  } finally {
    if(browser){await browser.close().catch(()=>{});browser.process()?.kill('SIGKILL')}
    server.kill('SIGTERM');clearInterval(keep)
  }
}
run().catch(error=>{console.error(error.stack);process.exitCode=1})
