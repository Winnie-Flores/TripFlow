/* Optional browser regression: uses externally installed puppeteer-core (not a product dependency).
 * TRIPFLOW_PUPPETEER_MODULE=/absolute/path/to/puppeteer-core node scripts/verify-stage1.cjs
 * Start npm run dev first. Real AMap services are NOT verified by this script.
 */
const puppeteer = require(process.env.TRIPFLOW_PUPPETEER_MODULE || 'puppeteer-core')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const path = require('node:path')
const { setTimeout: wait } = require('node:timers/promises')
const base = process.env.TRIPFLOW_TEST_URL || 'http://127.0.0.1:5173'
const mockBase = 'http://127.0.0.1:5184'
const chrome = process.env.TRIPFLOW_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const hhl = '[data-place-id="amap:B001B0I4K0"]'
const hbx = '[data-place-id="amap:B0FFF5V6F4"]'
const mockSdk = `
window.__qa = { requests: [], lines: [], markers: [], statuses: [], created: 0, destroyed: 0 };
class MockMap {
 constructor(element) { this.element=element; this.status={dragEnable:true}; this.callbacks={}; window.__qa.created++; }
 addControl(){} getStatus(){return this.status} setStatus(s){Object.assign(this.status,s);window.__qa.statuses.push(s.dragEnable)}
 on(event,cb){this.callbacks[event]=cb;if(event==='complete')setTimeout(()=>this.callbacks[event]?.(),25)}
 off(event){delete this.callbacks[event]} setFitView(){} destroy(){window.__qa.destroyed++;this.callbacks={};this.element.replaceChildren()}
}
class Marker {
 constructor(opts){this.opts=opts;window.__qa.markers.push(this)}
 setMap(map){this.map=map;if(!map){this.opts.content.remove();return}
 const el=this.opts.content;el.style.position='absolute';el.style.left=(12+(this.opts.position[0]-114.28)/.1*75)+'%';
 el.style.top=(10+(30.615-this.opts.position[1])/.085*75)+'%';el.style.transform='translate(-50%,-50%)';map.element.append(el)}
}
class Polyline {
 constructor(opts){this.opts=opts;this.setMap(opts.map)}
 setMap(map){this.map=map;window.__qa.lines=window.__qa.lines.filter(x=>x!==this);if(map)window.__qa.lines.push(this)}
}
class Service { constructor(mode){this.mode=mode} clear(){} search(a,b,cb){window.__qa.requests.push({a,b,mode:this.mode,
 done(fail=false){if(fail)return cb('error',{});cb('complete',{routes:[{distance:1234,time:600,steps:[{path:[a,[a[0]+.0001,b[1]+.0002],b]}]}]})}})} }
window.AMap={Map:MockMap,Marker,Polyline,Scale:class{},ToolBar:class{},
 Walking:class extends Service {constructor(){super('walking')}},Driving:class extends Service {constructor(){super('driving')}}};
window.___onAPILoaded();`

async function center(page, selector) {
  const handle = await page.$(selector)
  assert.ok(handle, `Missing ${selector}`)
  const rect = await handle.boundingBox()
  assert.ok(rect)
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}
async function nativeDrag(page, source, target) {
  await page.$eval(target, element => element.scrollIntoView({ block: 'nearest' }))
  await wait(80)
  await page.setDragInterception(true)
  await page.mouse.dragAndDrop(await center(page, source), await center(page, target), { delay: 70 })
  await wait(80)
}
async function ids(page) { return page.$$eval('[data-visit-id]', nodes => nodes.map(el => el.dataset.visitId)) }
async function names(page) { return page.$$eval('[data-visit-id] .visit-top>strong', nodes => nodes.map(el => el.textContent)) }
async function pointerSort(page) {
  await page.setDragInterception(false)
  await page.$eval('.sort-handle', element => element.scrollIntoView({ block: 'nearest' }));await wait(60)
  const from = await center(page, '.sort-handle')
  await page.mouse.move(from.x, from.y);await page.mouse.down()
  await page.mouse.move(from.x + 10, from.y + 8, { steps: 3 });await wait(70)
  const target = '.drop-slot[data-insert-index="2"]'
  await page.$eval(target, element => element.scrollIntoView({ block: 'nearest' }));await wait(80)
  let to = await center(page, target)
  await page.mouse.move(to.x, to.y, { steps: 15 });await wait(80)
  for (let i = 0; i < 3; i++) {
    to = await center(page, target)
    await page.mouse.move(to.x, to.y, { steps: 3 });await wait(50)
  }
  await page.mouse.up();await wait(150)
}

async function run() {
  const mockServer = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5184', '--strictPort'],
    { cwd: process.cwd(), env: { ...process.env, VITE_AMAP_KEY: 'tripflow-test-key', VITE_AMAP_SECURITY_JS_CODE: 'tripflow-test-code' }, stdio: 'ignore' })
  let browser
  try {
    let serverReady = false
    for (let i=0;i<60;i++) { try { serverReady = (await fetch(mockBase)).ok; if(serverReady)break } catch { /* wait for the local QA server */ } await wait(100) }
    assert.equal(serverReady, true)
    browser = await puppeteer.launch({ executablePath: chrome, headless: true })
    const page = await browser.newPage(), errors=[];page.setDefaultTimeout(5000)
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewport({ width:1440, height:1600 })
    await page.goto(base, {waitUntil:'networkidle0'})
    assert.equal(await page.$eval('.mode-banner', el=>el.textContent.includes('演示模式')),true)
    assert.equal(await page.evaluate(()=>[...document.scripts].some(s=>s.src.includes('webapi.amap.com'))),false)
    await page.screenshot({ path:'/tmp/tripflow-stage1-empty.png', fullPage:true })
    // Native HTML drag from a real DOM marker, not a synthetic drop event.
    await nativeDrag(page, hhl+' .map-pin', '.drop-slot.is-empty')
    assert.deepEqual(await names(page),['黄鹤楼'])
    await nativeDrag(page, hbx+' .map-pin', '.drop-slot[data-insert-index="0"]')
    assert.deepEqual(await names(page),['户部巷','黄鹤楼'])
    const before = await ids(page)
    await nativeDrag(page, hbx+' .map-pin', '.drop-slot[data-insert-index="2"]')
    const repeated=(await ids(page))[2];assert.notEqual(repeated,before[0]);await page.$eval(`[data-visit-id="${repeated}"] details`,el=>el.open=true);await page.click(`[data-visit-id="${repeated}"] .remove-visit`);assert.deepEqual(await ids(page),before)
    await pointerSort(page)
    assert.deepEqual(await ids(page),[before[1],before[0]])
    assert.deepEqual(await names(page),['黄鹤楼','户部巷'])
    assert.equal(await page.$eval(hhl+' .pin-number',el=>el.textContent),'1')
    // Keyboard cancellation leaves the stored order unchanged.
    await page.focus('.sort-handle');await page.keyboard.press('Space');await wait(80);await page.keyboard.press('ArrowDown');await wait(80);await page.keyboard.press('Escape');await wait(80)
    assert.deepEqual(await ids(page),[before[1],before[0]])
    // Keyboard sorting is also an actual dnd-kit path.
    await page.focus('.sort-handle');await page.keyboard.press('Space');await wait(80);await page.keyboard.press('ArrowDown');await wait(80);await page.keyboard.press('Space');await wait(100)
    assert.deepEqual(await ids(page),before)
    await page.screenshot({ path:'/tmp/tripflow-stage1-desktop.png', fullPage:true })
    // Remove all, invalid native drop and native Escape must not add a visit.
    await page.click('[aria-label="移除黄鹤楼"]');await page.waitForFunction(()=>document.querySelectorAll('[data-visit-id]').length===1);await page.click('[aria-label="移除户部巷"]');await page.waitForFunction(()=>document.querySelectorAll('[data-visit-id]').length===0)
    await nativeDrag(page, hhl+' .map-pin', '.topbar')
    assert.equal((await ids(page)).length,0)
    await page.setDragInterception(false)
    const start=await center(page,hhl+' .map-pin')
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x-80,start.y+20,{steps:10});await page.keyboard.press('Escape');await page.mouse.up()
    assert.equal((await ids(page)).length,0)
    // Touch-size layout has working supplementary buttons.
    await page.setViewport({width:390,height:844});await page.goto(base,{waitUntil:'networkidle0'})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    await page.click('[aria-label="安排黄鹤楼"]');assert.deepEqual(await names(page),['黄鹤楼'])
    await page.screenshot({path:'/tmp/tripflow-stage1-mobile.png',fullPage:true})
    // AMap adapter mocked at the SDK request boundary. No real service assertion.
    const live=await browser.newPage();live.on('pageerror',error=>errors.push(error.message));await live.setViewport({width:1440,height:1600})
    await live.setRequestInterception(true)
    live.on('request',request=>request.url().startsWith('https://webapi.amap.com/maps?')
      ? request.respond({status:200,contentType:'application/javascript',body:mockSdk}) : request.continue())
    await live.goto(mockBase,{waitUntil:'networkidle0'});await live.waitForSelector(hhl+' .map-pin')
    assert.equal(await live.evaluate(()=>window.__qa.created),1)
    await nativeDrag(live,hhl+' .map-pin','.drop-slot.is-empty')
    await nativeDrag(live,hbx+' .map-pin','.drop-slot[data-insert-index="1"]')
    await live.waitForFunction(()=>window.__qa.requests.length===1)
    assert.equal(await live.evaluate(()=>window.__qa.lines.length),0)
    await live.evaluate(()=>window.__qa.requests[0].done())
    await live.waitForSelector('.route-summary.ready')
    assert.equal(await live.evaluate(()=>window.__qa.lines[0].opts.path.length),3)
    assert.deepEqual(await live.evaluate(()=>window.__qa.markers.slice(0,2).map(m=>m.opts.position)),[[114.302467,30.544649],[114.298068,30.547412]])
    assert.ok(await live.evaluate(()=>window.__qa.statuses.includes(false)&&window.__qa.statuses.at(-1)===true))
    await pointerSort(live)
    assert.equal(await live.evaluate(()=>window.__qa.lines.length),0)
    await live.waitForFunction(()=>window.__qa.requests.length===2)
    assert.deepEqual(await live.evaluate(()=>window.__qa.requests[1].a),[114.298068,30.547412])
    await live.evaluate(()=>window.__qa.requests[1].done())
    await live.waitForSelector('.route-summary.ready')
    // Failure + retry: never substitute a straight connection.
    await live.click('.travel-mode button:nth-child(2)')
    await live.waitForFunction(()=>window.__qa.requests.length===3)
    await live.evaluate(()=>window.__qa.requests[2].done(true))
    await live.waitForSelector('.route-summary.error')
    assert.equal(await live.evaluate(()=>window.__qa.lines.length),0)
    await live.click('.route-summary.error button')
    await live.waitForFunction(()=>window.__qa.requests.length===4)
    await live.evaluate(()=>window.__qa.requests[3].done())
    await live.waitForSelector('.route-summary.ready')
    await live.click('[aria-label="移除黄鹤楼"]')
    assert.equal(await live.evaluate(()=>window.__qa.lines.length),0)
    assert.equal(await live.evaluate(()=>window.__qa.requests.length),4)
    // Unmount live SDK: clears subscriptions, DOM and map. Return mounts one fresh map.
    await live.click('.mode-banner button')
    assert.equal(await live.evaluate(()=>window.__qa.destroyed),1)
    assert.equal(await live.evaluate(()=>window.__qa.lines.length),0)
    await live.click('.mode-banner button');await live.waitForSelector('[aria-label="真实高德地图"] .map-pin')
    assert.equal(await live.evaluate(()=>window.__qa.created),2)
    assert.deepEqual(errors,[])
    console.log(JSON.stringify({demoNativeDrag:true,insertBefore:true,duplicateGuard:true,pointerSort:true,keyboardSort:true,cancel:true,invalidDrop:true,numbering:true,mobileButtons:true,mockSdkRoute:true,mockReverseRoute:true,mockClearAtOne:true,mockFailureRetry:true,mockLifecycle:true,realAmapVerified:false,pageErrors:errors},null,2))
  } finally { if(browser)await browser.close();mockServer.kill('SIGTERM') }
}
if (require.main === module) run().catch(error=>{console.error(error);process.exitCode=1})
module.exports = { mockSdk }
