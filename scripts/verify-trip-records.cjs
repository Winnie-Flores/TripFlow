/* Real browser UI and local storage. SDK mocked by default; optional real production preview flow. */
const pp=require(process.env.TRIPFLOW_PUPPETEER_MODULE||'puppeteer-core')
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs')
const {spawn}=require('node:child_process'),{setTimeout:wait}=require('node:timers/promises')
const {mockSdk}=require('./verify-stage1.cjs')
const real=process.env.TRIPFLOW_REAL==='1',preview=process.env.TRIPFLOW_PREVIEW==='1'
const base=real?(preview?'http://127.0.0.1:4176':'http://127.0.0.1:5173'):'http://127.0.0.1:5191'
const sdk=mockSdk.replace('(12+(this.opts.position[0]-114.28)/.1*75)','(this.opts.position[0]>115?50:(12+(this.opts.position[0]-114.28)/.1*75))')
 .replace('(10+(30.615-this.opts.position[1])/.085*75)','(this.opts.position[0]>115?50:(10+(30.615-this.opts.position[1])/.085*75))')
 .replace('window.___onAPILoaded();',`
 MockMap.prototype.setZoomAndCenter=function(){};
 class Routes{clear(){}search(a,b,cb){setTimeout(()=>cb('complete',{routes:[{distance:700,time:600,steps:[{path:[a,b]}]}]}),50)}}
 window.AMap.Walking=Routes;window.AMap.Driving=Routes;
 const poi={id:'HZ-DEMO',name:'杭州西湖景点',address:'杭州市西湖区',adcode:'330106',location:{lng:120.15,lat:30.25}};
 window.AMap.AutoComplete=class{search(q,cb){setTimeout(()=>cb('complete',{tips:[poi]}),50)}};
 window.AMap.PlaceSearch=class{search(q,cb){cb('complete',{poiList:{pois:[poi]}})}};
 window.AMap.DistrictSearch=class{search(q,cb){cb('complete',{districtList:[{name:'杭州市',adcode:'330100',level:'city',center:{lng:120.15,lat:30.25}}]})}};
 window.___onAPILoaded();`)
async function run(){
 const {createTripStore}=await import('../src/state/tripStore.js'),{createDocument}=await import('../src/state/document.js')
 const legacy=createTripStore({today:'2026-10-01'});legacy.getState().configureTrip({...legacy.getState().trip,name:'武汉旧规划',dayCount:1})
 legacy.getState().addVisit('amap:B001B0I4K0',legacy.getState().days[0].id)
 legacy.getState().editVisit(legacy.getState().days[0].visitIds[0],{notes:'武汉原备注'})
 legacy.getState().editPlace('amap:B001B0I4K0',{shape:'heart',color:'#7944aa'})
 const old=JSON.stringify(createDocument(legacy.getState()))
 const args=real?['preview','--host','127.0.0.1','--port','4176','--strictPort']:['--host','127.0.0.1','--port','5191','--strictPort']
 const server=(!real||preview)?spawn(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),...args],{env:{...process.env,...(!real?{VITE_AMAP_KEY:'tripflow-test-key',VITE_AMAP_SECURITY_JS_CODE:'tripflow-test-code'}:{})},stdio:'ignore'}):null
 let browser,page;const keep=setInterval(()=>{},1000)
 try{
  for(let i=0;i<60;i++){try{const r=await fetch(base);await r.body.cancel();if(r.ok)break}catch{/* starting */}await wait(100)}
  browser=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});page=await browser.newPage();page.setDefaultTimeout(20000);await page.setViewport({width:1440,height:1100})
  const errors=[];page.on('pageerror',()=>errors.push('page script error'))
  await page.evaluateOnNewDocument(old=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('tripflow.document.v1',old);sessionStorage.setItem('seeded','yes')}},old)
  if(!real){await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith('https://webapi.amap.com/maps?')?r.respond({contentType:'text/javascript',body:sdk}):r.continue())}
  const click=async(sel)=>{await page.$eval(sel,el=>el.scrollIntoView({block:'center'}));await page.click(sel)}
  const fill=async(sel,value)=>{await page.$eval(sel,(el,value)=>{const p=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))},value)}
  const records=()=>click('.main-navigation button:last-child')
  const saved=()=>page.waitForSelector('.save-state.saved')
  await page.goto(base+'/#records',{waitUntil:'networkidle2'});await page.waitForSelector('.trip-record-card')
  assert.equal((await page.$$('.trip-record-card')).length,1)
  assert.equal(await page.evaluate(()=>localStorage.getItem('tripflow.document.v1')),old)
  const wuhan=await page.$eval('.trip-record-card',el=>el.dataset.tripId)
  await click('.record-open');await page.waitForSelector('.map-pin');assert.match(await page.$eval('h1',el=>el.textContent),/武汉旧规划/)
  await click('.nav-new-trip');await page.waitForSelector('dialog[open]')
  await fill('[name="newName"]','杭州周末计划');await fill('[name="newCity"]','杭州');await fill('[name="newDate"]','2026-11-20');await fill('[name="newDays"]','2')
  await click('.dialog-actions button[type="submit"]');await page.waitForFunction(()=>document.querySelector('h1').textContent==='杭州周末计划')
  await page.waitForFunction(()=>!document.querySelector('[aria-label="搜索当前城市地点"]').disabled)
  assert.equal((await page.$$('[data-visit-id]')).length,0);assert.equal(await page.$('[data-place-id="amap:B001B0I4K0"]'),null)
  await fill('[aria-label="搜索当前城市地点"]',real?'馒头山社区':'西湖');await click('.poi-search button:first-of-type')
  await page.waitForSelector('.search-results li');await click('.search-results li button');await page.waitForSelector('.place-marker.is-focused')
  await page.$eval('.drop-slot',el=>el.scrollIntoView({block:'center'}));await page.$eval('.place-marker.is-focused',el=>el.scrollIntoView({block:'nearest'}));await wait(300)
  const center=async(sel)=>{const b=await(await page.$(sel)).boundingBox();return{x:b.x+b.width/2,y:b.y+b.height/2}}
  await page.setDragInterception(true);let timeout
  try{await Promise.race([page.mouse.dragAndDrop(await center('.place-marker.is-focused .map-pin'),await center('.drop-slot'),{delay:100}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('native drag timeout')),10000)})])}finally{clearTimeout(timeout)}
  await page.waitForSelector('[data-visit-id]');await page.setDragInterception(false)
  await click('.visit-details summary');await fill('textarea','杭州独立备注');await page.select('[aria-label="标记形状"]','circle');await saved()
  await records();assert.equal((await page.$$('.trip-record-card')).length,2)
  const hangzhou=await page.$eval('.trip-record-card.is-current',el=>el.dataset.tripId)
  await page.screenshot({path:`/tmp/tripflow-records-${real?'real':'mock'}-desktop.png`,fullPage:true})
  await click(`[data-trip-id="${wuhan}"] .record-open`);await page.waitForSelector('[data-visit-id]')
  assert.equal(await page.$eval('textarea',el=>el.value),'武汉原备注')
  await page.waitForSelector('[data-place-id="amap:B001B0I4K0"]')
  assert.equal(await page.$eval('[data-place-id="amap:B001B0I4K0"]',el=>el.style.getPropertyValue('--pin-color')),'#7944aa')
  await click('.visit-details summary');await fill('textarea','武汉继续编辑');await records()
  await click(`[data-trip-id="${hangzhou}"] .record-open`);await page.waitForSelector('[data-visit-id]')
  assert.equal(await page.$eval('textarea',el=>el.value),'杭州独立备注');assert.equal((await page.$$('[data-visit-id]')).length,1)
  await saved();await page.reload({waitUntil:'networkidle2'});await page.waitForSelector('[data-visit-id]');assert.equal(await page.$eval('textarea',el=>el.value),'杭州独立备注')
  await records();assert.equal((await page.$$('.trip-record-card')).length,2)
  await fill('[aria-label="查找旅行记录"]','武汉');assert.equal((await page.$$('.trip-record-card')).length,1);await fill('[aria-label="查找旅行记录"]','')
  await page.setViewport({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await page.screenshot({path:`/tmp/tripflow-records-${real?'real':'mock'}-mobile.png`,fullPage:true})
  page.once('dialog',d=>d.dismiss());await click(`[data-trip-id="${wuhan}"] .record-footer button:last-child`);assert.equal((await page.$$('.trip-record-card')).length,2)
  page.once('dialog',d=>d.accept());await click(`[data-trip-id="${wuhan}"] .record-footer button:last-child`);assert.equal((await page.$$('.trip-record-card')).length,1)
  assert.equal(await page.$eval('.trip-record-card h2',el=>el.textContent),'杭州周末计划')
  await saved();await page.reload({waitUntil:'networkidle2'});await page.waitForSelector('.trip-record-card');assert.equal((await page.$$('.trip-record-card')).length,1)
  assert.deepEqual(errors,[])
  const result={legacyMigration:true,newTripPreservesOld:true,hangzhouNativeDrag:true,independentNotesAndStyles:true,openAndContinue:true,refreshRecords:true,searchCards:true,deleteCancelAndIsolation:true,mobile:true,pageErrors:errors,realAmapVerified:real,productionPreview:preview}
  fs.writeFileSync(`/tmp/tripflow-records-${real?'real':'mock'}-result.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
 }catch(error){await page?.screenshot({path:'/tmp/tripflow-records-failure.png',fullPage:true}).catch(()=>{});throw error}
 finally{if(browser){await Promise.race([browser.close().catch(()=>{}),wait(5000)]);browser.process()?.kill('SIGKILL')}server?.kill('SIGTERM');clearInterval(keep)}
}
run().catch(error=>{console.error(error.message);process.exitCode=1})
