/* Catalog upgrade, hotel loop and repeated visits. Default SDK mock; TRIPFLOW_REAL=1 uses real production build. */
const pp=require(process.env.TRIPFLOW_PUPPETEER_MODULE||'puppeteer-core'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {spawn}=require('node:child_process'),{setTimeout:wait}=require('node:timers/promises'),{mockSdk}=require('./verify-stage1.cjs')
const real=process.env.TRIPFLOW_REAL==='1',base=real?'http://127.0.0.1:4177':'http://127.0.0.1:5192'
const sdk=mockSdk.replace('(12+(this.opts.position[0]-114.28)/.1*75)','(15+(this.opts.position[0]-120.05)/.18*65)').replace('(10+(30.615-this.opts.position[1])/.085*75)','(10+(30.28-this.opts.position[1])/.15*70)')
.replace('window.___onAPILoaded();',`
MockMap.prototype.setZoomAndCenter=function(){};
window.__hotelqa={types:[],roads:[]};
const hotel=(id)=>({id,name:'湖滨测试酒店'+id,address:'杭州湖滨测试地址',adcode:'330106',type:'住宿服务;宾馆酒店',location:{lng:id==='HOTEL1'?120.16:120.17,lat:30.25}});
window.AMap.AutoComplete=class{constructor(options){this.options=options}search(q,cb){window.__hotelqa.types.push(this.options.type);cb('complete',{tips:[hotel(q.includes('二')?'HOTEL2':'HOTEL1')]})}};
window.AMap.PlaceSearch=class{constructor(options){this.options=options}clear(){}search(q,cb){window.__hotelqa.types.push(this.options.type);cb('complete',{poiList:{pois:[hotel(q.includes('二')?'HOTEL2':'HOTEL1')]}})}};
class Roads{clear(){}search(a,b,cb){window.__hotelqa.roads.push({a,b});setTimeout(()=>cb('complete',{routes:[{distance:800,time:600,steps:[{path:[a,b]}]}]}),60)}}
window.AMap.Walking=Roads;window.AMap.Driving=Roads;window.___onAPILoaded();`)
async function run(){
 const {createTripStore}=await import('../src/state/tripStore.js'),{createDocument}=await import('../src/state/document.js')
 const legacy=createTripStore();legacy.getState().configureTrip({name:'杭州酒店往返规划',city:'杭州',cityInfo:{name:'杭州',adcode:'330100',center:[120.155,30.25]},startDate:'2026-11-15',dayCount:2},{confirmed:true})
 const old=createDocument(legacy.getState());old.places=[];old.days.forEach(d=>{delete d.startHotelId;delete d.endHotelId})
 const server=spawn(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),...(real?['preview']:[]),'--host','127.0.0.1','--port',real?'4177':'5192','--strictPort'],{env:{...process.env,...(!real?{VITE_AMAP_KEY:'tripflow-test-key',VITE_AMAP_SECURITY_JS_CODE:'tripflow-test-code'}:{})},stdio:'ignore'})
 let browser,page;const keep=setInterval(()=>{},1000)
 try{
  for(let i=0;i<60;i++){try{const r=await fetch(base);await r.body.cancel();if(r.ok)break}catch{/* starting */}await wait(100)}
  browser=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});page=await browser.newPage();page.setDefaultTimeout(25000);await page.setViewport({width:1440,height:1100})
  const errors=[];page.on('pageerror',()=>errors.push('page script error'))
  await page.evaluateOnNewDocument(doc=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('tripflow.document.v1',doc);sessionStorage.setItem('seeded','yes')}},JSON.stringify(old))
  if(!real){await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith('https://webapi.amap.com/maps?')?r.respond({contentType:'text/javascript',body:sdk}):r.continue())}
  await page.goto(base,{waitUntil:'networkidle2'});await page.waitForFunction(()=>document.querySelectorAll('.map-pin').length===24)
  const click=async(sel)=>{await page.$eval(sel,el=>el.scrollIntoView({block:'center'}));await page.click(sel)}
  const fill=async(sel,value)=>{await page.$eval(sel,(el,value)=>{const p=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))},value)}
  await click('.nav-new-trip');await page.waitForSelector('dialog[open]')
  const buttons=await page.$$eval('.dialog-actions>button',els=>els.map(el=>({height:el.getBoundingClientRect().height,y:el.getBoundingClientRect().y})))
  assert.equal(buttons[0].height,buttons[1].height);assert.equal(buttons[0].y,buttons[1].y)
  await click('.dialog-actions>button:first-child')
  await click('.explore-heading button')
  const a='amap:B023B01EE6',b='amap:B023B05MLT'
  for(const id of[a,b,a])await click(`[data-candidate-id="${id}"] .candidate-add`)
  assert.equal((await page.$$('[data-visit-id]')).length,3)
  const visits=await page.$$eval('[data-visit-id]',els=>els.map(el=>el.dataset.visitId));assert.equal(new Set(visits).size,3)
  for(const [index,note]of[[0,'午饭'],[2,'晚饭']]){await click(`[data-visit-id="${visits[index]}"] .visit-details summary`);await fill(`[data-visit-id="${visits[index]}"] textarea`,note)}
  assert.equal(await page.$eval(`[data-place-id="${a}"] .pin-order`,el=>el.textContent),'1·3')
  await click('.explore-tabs button:last-child');await page.waitForFunction(()=>!document.querySelector('.poi-search input').disabled)
  await fill('.poi-search input',real?'杭州西湖湖滨君亭酒店':'测试酒店');await click('.poi-search button:first-of-type')
  await page.waitForSelector('.search-results li');await click('.search-results li button');await page.waitForSelector('.hotel-confirm')
  assert.equal(await page.$eval('[aria-label="第1天入住酒店"]',el=>el.value),'');assert.equal(await page.$eval('[aria-label="第2天入住酒店"]',el=>el.value),'');
  const firstHotel=await page.$eval('[aria-label="第1天入住酒店"] option:last-child',el=>el.value);await page.select('[aria-label="第1天出发酒店"]',firstHotel);await click('.hotel-confirm .hotel-day-add');assert.equal(await page.$eval('[aria-label="第1天入住酒店"]',el=>el.value),firstHotel);assert.equal(await page.$eval('[aria-label="第2天入住酒店"]',el=>el.value),'');
  for(const width of [1551,767,390]){
   await page.setViewport({width,height:876})
   if(width>650){
    const badges=await page.$$eval('.visit-number b',els=>els.map(el=>{const b=el.getBoundingClientRect(),r=document.createRange();r.selectNodeContents(el);const t=r.getBoundingClientRect();return {offset:Math.abs(t.x+t.width/2-b.x-b.width/2),display:getComputedStyle(el).display,align:getComputedStyle(el).alignItems}}))
    assert.ok(badges.every(b=>b.offset<1&&b.display==='grid'&&b.align==='center'),JSON.stringify(badges))
   }else await click('.mobile-view-switch button:last-child')
   const geometry=await page.evaluate(()=>{const rect=sel=>{const r=document.querySelector(sel).getBoundingClientRect();return{y:r.y,height:r.height}};const buttons=[...document.querySelectorAll('.hotel-confirm .hotel-actions button')].map(el=>{const s=getComputedStyle(el);return{height:el.getBoundingClientRect().height,radius:s.borderRadius,border:s.borderTopWidth}});return{input:rect('.poi-search input'),search:rect('.poi-search .primary-button'),margin:getComputedStyle(document.querySelector('.poi-search .primary-button')).marginTop,buttons,overflow:document.documentElement.scrollWidth>innerWidth}})
   if(width===1551){assert.equal(geometry.input.y,geometry.search.y);assert.equal(geometry.input.height,geometry.search.height)}
   assert.equal(geometry.margin,'0px');assert.deepEqual(geometry.buttons[0],geometry.buttons[1]);assert.equal(geometry.overflow,false)
   await page.screenshot({path:`/tmp/tripflow-controls-${width}.png`,fullPage:true})
  }
  await page.setViewport({width:1440,height:1100});await click('.mobile-view-switch button:first-child').catch(()=>{})
  await page.screenshot({path:`/tmp/tripflow-hotel-choices-${real?'real':'mock'}.png`,fullPage:true});
  await click('.hotel-confirm .hotel-trip-add');await page.waitForSelector('.route-summary.ready',{timeout:45000})
  const hotelId=await page.$eval('[aria-label="第1天出发酒店"]',el=>el.value)
  assert.ok(hotelId);assert.equal(await page.$eval('[aria-label="第1天入住酒店"]',el=>el.value),hotelId)
  assert.equal(await page.$eval('[aria-label="第2天出发酒店"]',el=>el.value),hotelId)
  await click('.route-disclosure summary');await page.waitForFunction(()=>document.querySelectorAll('.route-leg').length===4)
  const legs=await page.$$eval('.route-leg>span',els=>els.map(el=>el.textContent))
  assert.match(legs[0],/出发酒店/);assert.match(legs.at(-1),/入住酒店/)
  if(!real){assert.ok((await page.evaluate(()=>window.__hotelqa.types)).every(type=>type==='住宿服务'))
   const roads=await page.evaluate(()=>window.__hotelqa.roads);const hotelPoint=[120.16,30.25]
   assert.ok(roads.some(leg=>JSON.stringify(leg.a)===JSON.stringify(hotelPoint)));assert.deepEqual(roads.at(-1).b,hotelPoint)
   await fill('.poi-search input','测试二酒店');await click('.poi-search button:first-of-type');await page.waitForSelector('.search-results li');await click('.search-results li button')
   await page.waitForFunction(()=>document.querySelectorAll('[aria-label="第1天入住酒店"] option').length===3)
   assert.equal(await page.$eval('[aria-label="第1天入住酒店"]',el=>el.value),hotelId);assert.equal(await page.$eval('[aria-label="第2天入住酒店"]',el=>el.value),hotelId);
   await click('.hotel-confirm .hotel-day-add');assert.equal(await page.$eval('[aria-label="第1天入住酒店"]',el=>el.value),'amap:HOTEL2');assert.equal(await page.$eval('[aria-label="第2天出发酒店"]',el=>el.value),'amap:HOTEL2')
  }
  await page.waitForSelector('.save-state.saved');await page.reload({waitUntil:'networkidle2'});await page.waitForSelector('.route-summary.ready',{timeout:45000})
  assert.equal((await page.$$('[data-visit-id]')).length,3)
  const notes=await page.$$eval('textarea',els=>els.map(el=>el.value));assert.equal(notes[0],'午饭');assert.equal(notes[2],'晚饭')
  assert.equal(await page.$eval('[aria-label="第1天出发酒店"]',el=>el.value),hotelId)
  await click('.route-disclosure summary');await page.$eval('.map-panel',el=>el.scrollIntoView({block:'center'}));await wait(real?1500:100)
  await page.screenshot({path:`/tmp/tripflow-hotels-${real?'real':'mock'}-desktop.png`,fullPage:true})
  await page.setViewport({width:390,height:844});await click('.mobile-view-switch button:last-child');await wait(500)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await page.screenshot({path:`/tmp/tripflow-hotels-${real?'real':'mock'}-mobile.png`,fullPage:true})
  assert.deepEqual(errors,[])
  const result={hangzhouPresets:24,wuhanPresets:25,legacyEnriched:true,dialogButtonsEqual:true,sameDayRepeatedVisits:true,separateNotesAfterReload:true,hotelSearch:true,dailyHotelLoop:true,nextDayHotel:!real,mobile:true,pageErrors:errors,realAmapVerified:real}
  fs.writeFileSync(`/tmp/tripflow-hotels-${real?'real':'mock'}-result.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
 }catch(error){await page?.screenshot({path:'/tmp/tripflow-hotels-failure.png',fullPage:true}).catch(()=>{});throw error}
 finally{if(browser){await Promise.race([browser.close().catch(()=>{}),wait(5000)]);browser.process()?.kill('SIGKILL')}server.kill('SIGTERM');clearInterval(keep)}
}
run().catch(error=>{console.error(error.stack);process.exitCode=1})
