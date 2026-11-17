const { expandEditorsForRegression } = require('./browser-helpers.cjs')
/* Browser acceptance: real UI/storage/files, mocked AMap only. No real credentials. */
const puppeteer = require(process.env.TRIPFLOW_PUPPETEER_MODULE || 'puppeteer-core')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { setTimeout: wait } = require('node:timers/promises')
const { mockSdk } = require('./verify-stage1.cjs')
const dir = '/tmp/tripflow-stage5-qa', base = 'http://127.0.0.1:5189'
const key = 'tripflow.trips.v1'
async function run() {
  fs.mkdirSync(dir,{recursive:true})
  const server=spawn(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5189','--strictPort'],
    {env:{...process.env,VITE_AMAP_KEY:'tripflow-test-key',VITE_AMAP_SECURITY_JS_CODE:'tripflow-test-code'},stdio:'ignore'})
  let browser,page
  const keepAlive=setInterval(()=>{},1000)
  try {
    for(let i=0;i<60;i++){try{const r=await fetch(base);await r.body.cancel();if(r.ok)break}catch{/* starting */}await wait(100)}
    browser=await puppeteer.launch({executablePath:process.env.TRIPFLOW_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
    page=await browser.newPage(); await expandEditorsForRegression(page);page.setDefaultTimeout(8000);await page.setViewport({width:1440,height:1200})
    const errors=[];page.on('pageerror',()=>errors.push('page script error'))
    await page.setRequestInterception(true)
    const sdk=mockSdk.replace('window.___onAPILoaded();', 'MockMap.prototype.setZoomAndCenter=function(){};window.___onAPILoaded();')
    page.on('request',r=>r.url().startsWith('https://webapi.amap.com/maps?')?r.respond({contentType:'text/javascript',body:sdk}):r.continue())
    const click=async(sel)=>{await page.$eval(sel,el=>el.scrollIntoView({block:'nearest'}));await page.click(sel)}
    const fill=async(sel,value)=>{await page.$eval(sel,(el,value)=>{const p=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))},value)}
    const saved=()=>page.waitForFunction(()=>document.querySelector('.save-state').classList.contains('saved'))
    const storage=()=>page.evaluate(key=>{const raw=localStorage.getItem(key);try{const data=JSON.parse(raw);return JSON.stringify(data.records.find(record=>record.document.trip.id===data.activeTripId).document)}catch{return raw}},key)
    const finish=async(n)=>{await page.waitForFunction(n=>window.__qa.requests.length===n,{},n);await page.evaluate(n=>window.__qa.requests[n-1].done(),n);await page.waitForSelector('.route-summary.ready')}
    await page.goto(base,{waitUntil:'networkidle0'});await page.waitForSelector('.map-pin')
    await click('.settings-disclosure summary');await fill('[name="name"]','武汉两日慢游');await fill('[name="dayCount"]','2');await fill('[name="startDate"]','2026-11-08');await click('.settings-save')
    await click('.explore-heading button');await click('[data-candidate-id="amap:B001B0I4K0"] .candidate-focus')
    await page.select('[aria-label="标记形状"]','heart');await fill('[aria-label="标记颜色"]','#7944aa')
    await click('[data-candidate-id="amap:B001B0I4K0"] .candidate-add');await click('[data-candidate-id="amap:B0FFF5V6F4"] .candidate-add');await finish(1)
    await fill('[data-visit-id]:first-of-type textarea','预约后再出发');await page.$eval('[data-visit-id]:first-of-type textarea',el=>el.dispatchEvent(new FocusEvent('focusout',{bubbles:true})))
    await click('.visit-list > div:first-child .visit-actions button:nth-child(2)');await finish(2)
    await click('[aria-label="交通方式"] button:nth-child(2)');await finish(3);await saved()
    const before=JSON.parse(await storage())
    assert.equal(before.schemaVersion,1);assert.equal(before.settings.routeMode,'driving');assert.equal(before.route,undefined)
    assert.equal(before.places.find(p=>p.sourceId==='B001B0I4K0').shape,'heart');assert.equal(before.visits.some(v=>v.notes==='预约后再出发'),true)
    const order=await page.$$eval('.visit-top>strong',els=>els.map(el=>el.textContent))
    await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('[data-visit-id]');await finish(1)
    assert.deepEqual(await page.$$eval('.visit-top>strong',els=>els.map(el=>el.textContent)),order)
    assert.equal(await page.$eval('[data-place-id="amap:B001B0I4K0"]',el=>el.style.getPropertyValue('--pin-color')),'#7944aa')
    assert.deepEqual(await page.$$eval('.day-select time',els=>els.map(el=>el.dateTime)),['2026-11-08','2026-11-09'])
    // Download the actual exported file.
    const downloadDir=fs.mkdtempSync(path.join(dir,'download-'))
    const cdp=await page.createCDPSession();await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir})
    await click('.data-actions button:first-child')
    let exported
    for(let i=0;i<40;i++){const name=fs.readdirSync(downloadDir).find(n=>n.endsWith('.json'));if(name){exported=path.join(downloadDir,name);break}await wait(100)}
    assert.ok(exported);assert.deepEqual(JSON.parse(fs.readFileSync(exported,'utf8')),before)
    const invalid={...before,schemaVersion:88};const badFile=path.join(dir,'bad.json');fs.writeFileSync(badFile,JSON.stringify(invalid))
    await(await page.$('[aria-label="导入旅行文件"]')).uploadFile(badFile)
    await page.waitForFunction(()=>document.querySelector('.data-feedback').textContent.includes('未导入'))
    assert.deepEqual(JSON.parse(await storage()),before)
    const oversized=path.join(dir,'oversized.json');fs.writeFileSync(oversized,' '.repeat(2*1024*1024+1))
    await(await page.$('[aria-label="导入旅行文件"]')).uploadFile(oversized)
    await page.waitForFunction(()=>document.querySelector('.data-feedback').textContent.includes('2 MB'))
    assert.deepEqual(JSON.parse(await storage()),before)
    page.once('dialog',d=>d.dismiss());await(await page.$('[aria-label="导入旅行文件"]')).uploadFile(exported)
    await page.waitForFunction(()=>document.querySelector('.data-feedback').textContent.includes('取消'))
    // Same IDs with changed note and shape: forces clean UI/SDK remount and fresh roads.
    const imported=structuredClone(before);imported.places.find(p=>p.sourceId==='B001B0I4K0').shape='diamond';imported.visits[0].notes='导入后的备注'
    const goodFile=path.join(dir,'good.json');fs.writeFileSync(goodFile,JSON.stringify(imported))
    page.once('dialog',d=>d.accept());await(await page.$('[aria-label="导入旅行文件"]')).uploadFile(goodFile)
    await page.waitForFunction(()=>window.__qa.created===2)
    await finish(2);await saved()
    assert.equal(await page.$eval('[data-place-id="amap:B001B0I4K0"] .pin-number svg path',el=>el.getAttribute('d')),'m12 2 9 10-9 10L3 12Z')
    assert.ok((await page.$$eval('textarea',els=>els.map(el=>el.value))).includes('导入后的备注'))
    assert.deepEqual(JSON.parse(await storage()),imported)
    const firstText=await page.$('textarea');await firstText.focus();await page.keyboard.press('End');await page.keyboard.type('（即时输入）')
    await page.reload({waitUntil:'networkidle0'});await finish(1)
    assert.ok((await page.$$eval('textarea',els=>els.map(el=>el.value))).some(v=>v.includes('（即时输入）')))
    await page.screenshot({path:'/tmp/tripflow-stage5-desktop.png',fullPage:true})
    for(const width of [1280,1024,768,390]){await page.setViewport({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}
    await click('.mobile-view-switch button:last-child');assert.equal(await page.$eval('.itinerary',el=>getComputedStyle(el).visibility),'hidden')
    assert.equal(await page.$eval('.map-panel',el=>getComputedStyle(el).visibility),'visible')
    const created=await page.evaluate(()=>window.__qa.created)
    await click('.mobile-view-switch button:first-child');assert.equal(await page.evaluate(()=>window.__qa.created),created)
    await page.screenshot({path:'/tmp/tripflow-stage5-mobile-itinerary.png',fullPage:true})
    await click('.mobile-view-switch button:last-child');await page.screenshot({path:'/tmp/tripflow-stage5-mobile-map.png',fullPage:true})
    // Corrupt saved data survives a load and edits until explicit repair.
    await page.evaluate(key=>localStorage.setItem(key,'{broken'),key);await page.reload({waitUntil:'networkidle0'})
    await page.waitForSelector('.save-state.blocked');assert.equal(await storage(),'{broken')
    await click('.add-day');await wait(350);assert.equal(await storage(),'{broken')
    page.once('dialog',d=>d.accept());await click('.data-actions button:last-of-type');await saved();assert.equal(JSON.parse(await storage()).days.length,2)
    // Browser storage denial leaves a usable app and export path.
    const denied=await browser.newPage(); await expandEditorsForRegression(denied);await denied.evaluateOnNewDocument(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('blocked','SecurityError')}}))
    await denied.goto(base,{waitUntil:'networkidle0'});await denied.waitForSelector('.save-state.error');assert.ok(await denied.$('.data-actions button'))
    assert.deepEqual(errors,[])
    const result={restoreOrderDatesStyles:true,realDownload:true,invalidAndOversizedPreserve:true,cancelImport:true,atomicSameIdImport:true,freshRoadsAfterRestoreImport:true,unblurredNotesSurviveReload:true,corruptStoragePreserved:true,storageDenied:true,mobileViews:true,desktopWidths:[1440,1280,1024,768],mobileWidth:390,pageErrors:errors,realAmapVerified:false}
    fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
  }catch(error){await page?.screenshot({path:'/tmp/tripflow-stage5-failure.png',fullPage:true}).catch(()=>{});throw error}
  finally{if(browser){await Promise.race([browser.close().catch(()=>{}),wait(5000)]);browser.process()?.kill('SIGKILL')}server.kill('SIGTERM');clearInterval(keepAlive)}
}
run().catch(error=>{console.error(error.message);process.exitCode=1})
