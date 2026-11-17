/* Default: UI + storage with mocked SDK. TRIPFLOW_REAL=1: built production + actual AMap. */
const pp=require(process.env.TRIPFLOW_PUPPETEER_MODULE||'puppeteer-core'),assert=require('node:assert/strict'),path=require('node:path')
const {spawn}=require('node:child_process'),{setTimeout:wait}=require('node:timers/promises'),{mockSdk}=require('./verify-stage1.cjs')
const real=process.env.TRIPFLOW_REAL==='1',port=real?'4178':'5193',base=`http://127.0.0.1:${port}`
const sdk=mockSdk.replace('window.___onAPILoaded();',`window.AMap.Bounds=class{constructor(sw,ne){this.sw=sw;this.ne=ne}};MockMap.prototype.setBounds=function(){};MockMap.prototype.setZoomAndCenter=function(){};window.__regions=[];window.AMap.DistrictLayer={Country:class{constructor(opts){this.opts=opts;window.__regions.push(this)}setStyles(styles){this.styles=styles}setMap(map){this.map=map}getDistrictByContainerPos(){return {adcode:'420100'}}}};window.___onAPILoaded();`).replace('(12+(this.opts.position[0]-114.28)/.1*75)','(20+(this.opts.position[0]-114)/7*60)').replace('(10+(30.615-this.opts.position[1])/.085*75)','(35+(this.opts.position[1]-30)*10)')
async function run(){
 const {createTripStore}=await import('../src/state/tripStore.js'),{createLibrary}=await import('../src/state/tripLibrary.js')
 const store=createTripStore();store.getState().configureTrip({...store.getState().trip,name:'武汉回忆',dayCount:2});const wh=store.getState().trip.id
 store.getState().setTripStatus(wh,'visited')
 store.getState().createTrip({name:'武汉再出发',city:'武汉',startDate:'2026-12-01',dayCount:2,cityInfo:{name:'武汉',adcode:'420100',center:[114.305,30.593]}})
 store.getState().createTrip({name:'杭州新计划',city:'杭州',startDate:'2026-12-10',dayCount:2,cityInfo:{name:'杭州',adcode:'330100',center:[120.155,30.25]}})
 const hz=store.getState().trip.id,seed=JSON.stringify(createLibrary(store.getState()))
 const server=spawn(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),...(real?['preview']:[]),'--host','127.0.0.1','--port',port,'--strictPort'],{env:{...process.env,...(!real?{VITE_AMAP_KEY:'tripflow-test-key',VITE_AMAP_SECURITY_JS_CODE:'tripflow-test-code'}:{})},stdio:'ignore'})
 let browser,page;const keep=setInterval(()=>{},1000)
 try{
  for(let i=0;i<60;i++){try{if((await fetch(base)).ok)break}catch{/* starting */}await wait(100)}
  browser=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});page=await browser.newPage();page.setDefaultTimeout(20000);await page.setViewport({width:1551,height:1000})
  const net=[];if(real){page.on('requestfailed',r=>net.push({host:new URL(r.url()).hostname,path:new URL(r.url()).pathname,error:r.failure()?.errorText}));page.on('response',r=>{if(r.status()>=400)net.push({host:new URL(r.url()).hostname,path:new URL(r.url()).pathname,status:r.status()})})}
  const errors=[];page.on('pageerror',e=>errors.push(e.message));let sdkCalls=0
  await page.evaluateOnNewDocument(seed=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('tripflow.trips.v1',seed);sessionStorage.setItem('seeded','yes')}},seed)
  if(!real){await page.setRequestInterception(true);page.on('request',async r=>{if(r.url().startsWith('https://webapi.amap.com/maps?')){sdkCalls++;await wait(300);await r.respond({contentType:'text/javascript',body:sdk})}else r.continue()})}
  const click=async sel=>{await page.$eval(sel,el=>el.scrollIntoView({block:'center'}));await page.click(sel)}
  await page.goto(base+'/#records',{waitUntil:'networkidle2'});assert.equal((await page.$$('.trip-record-card')).length,3);assert.equal(await page.$('.footprint-panel'),null);if(!real)assert.equal(sdkCalls,0)
  const fullWidth=await page.$eval('.trip-record-card',el=>el.getBoundingClientRect().width)
  if(!real){await click('.footprint-toggle');await click('.footprint-toggle');await wait(600);assert.equal(await page.evaluate(()=>window.__qa?.created??0),0)}
  await click('.footprint-toggle');if(real){await page.waitForFunction(()=>document.querySelector('.footprint-pin')||document.querySelector('.footprint-map-state button'));if(await page.$('.footprint-map-state button'))await click('.footprint-map-state button')}await page.waitForSelector('.footprint-pin',{timeout:30000});assert.equal((await page.$$('.footprint-pin')).length,2)
  assert.equal((await page.$$('.footprint-pin.is-mixed')).length,1)
  if(!real){assert.deepEqual(await page.evaluate(()=>{const layer=window.__regions.at(-1);return{depth:layer.opts.depth,SOC:layer.opts.SOC,visited:layer.styles.fill({adcode:420100}),planned:layer.styles.fill({adcode:330100}),unvisited:layer.styles.fill({adcode:320100})}}),{depth:2,SOC:'CHN',visited:'#3f8c73',planned:'#dfad79',unvisited:'#dce1df'})}
  const layout=await page.evaluate(()=>({map:document.querySelector('.footprint-panel').getBoundingClientRect().x,cards:document.querySelector('.records-results').getBoundingClientRect().x,cardWidth:document.querySelector('.trip-record-card').getBoundingClientRect().width}))
  assert.ok(layout.map<layout.cards);assert.ok(layout.cardWidth<fullWidth)
  await wait(real?7000:100);if(real)console.log(JSON.stringify({mapDiagnostics:await page.$$eval('.footprint-map canvas',els=>els.map(el=>({width:el.width,height:el.height,display:getComputedStyle(el).display}))),network:net}));await page.screenshot({path:`/tmp/tripflow-footprints-${real?'real':'mock'}-desktop.png`,fullPage:true})
  await click('.footprint-pin.is-mixed');if(real){await wait(3000);await page.screenshot({path:'/tmp/tripflow-footprints-city-boundary.png',fullPage:true})}assert.equal((await page.$$('.trip-record-card')).length,2);assert.equal((await page.$$('.footprint-pin')).length,2)
  await page.$eval('[aria-label="查找旅行记录"]',el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'');el.dispatchEvent(new Event('input',{bubbles:true}))})
  await page.select(`[data-trip-id="${hz}"] .record-status-row select`,'visited');await page.waitForFunction(()=>document.querySelectorAll('.footprint-pin.is-visited').length===2)
  await page.waitForSelector('.save-state.saved');await page.reload({waitUntil:'networkidle2'});assert.equal(await page.$('.footprint-panel'),null);assert.equal(await page.$eval(`[data-trip-id="${hz}"] select`,el=>el.value),'visited')
  await click('.footprint-toggle');await page.waitForSelector('.footprint-pin')
  await page.select(`[data-trip-id="${wh}"] select`,'planned');await page.waitForFunction(()=>!document.querySelector('.footprint-pin.is-mixed'))
  await page.focus('.footprint-toggle');await page.keyboard.press('Enter');assert.equal(await page.$('.footprint-panel'),null)
  if(!real){const counts=await page.evaluate(()=>({created:window.__qa.created,destroyed:window.__qa.destroyed}));assert.equal(counts.created,counts.destroyed)}
  await click('.footprint-toggle');await page.waitForSelector('.footprint-pin')
  for(const width of[1280,1024,767,390]){await page.setViewport({width,height:900});await wait(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}
  await wait(real?7000:100);await page.screenshot({path:`/tmp/tripflow-footprints-${real?'real':'mock'}-mobile.png`,fullPage:true})
  await click(`[data-trip-id="${hz}"] .record-open`);await page.waitForSelector('.itinerary');await click('.main-navigation button:last-child');assert.equal(await page.$('.footprint-panel'),null)
  assert.equal(await page.$eval(`[data-trip-id="${hz}"] select`,el=>el.value),'visited');assert.deepEqual(errors,[])
  if(!real){
   const failure=await browser.newPage();await failure.setRequestInterception(true)
   const failSdk=sdk.replace('window.___onAPILoaded();',"window.AMap.Map=class extends MockMap{constructor(el){if(!window.__mapFailedOnce){window.__mapFailedOnce=true;throw new Error('simulated map failure')}super(el)}};window.___onAPILoaded();")
   failure.on('request',r=>r.url().startsWith('https://webapi.amap.com/maps?')?r.respond({contentType:'text/javascript',body:failSdk}):r.continue())
   await failure.goto(base+'/#records',{waitUntil:'networkidle2'});await failure.click('.footprint-toggle');await failure.waitForSelector('.footprint-map-state button')
   assert.equal((await failure.$$('.trip-record-card')).length,3);await failure.click('.footprint-map-state button');await failure.waitForSelector('.footprint-pin');await failure.close()
  }
  console.log(JSON.stringify({collapsedUnchanged:true,expandedMapLeftCompactCards:true,mixedCity:true,cityFilter:true,statusPersists:true,unmountCleanup:!real,mobile:true,pageErrors:errors,realAmapVerified:real},null,2))
 }catch(e){await page?.screenshot({path:'/tmp/tripflow-footprints-failure.png',fullPage:true}).catch(()=>{});throw e}
 finally{if(browser){await browser.close().catch(()=>{});browser.process()?.kill('SIGKILL')}server.kill('SIGTERM');clearInterval(keep)}
}
run().catch(e=>{console.error(e.stack);process.exitCode=1})
