/* Layout + actual browser native/list drag, SDK mocked. Does not force editors open. */
const pp=require(process.env.TRIPFLOW_PUPPETEER_MODULE||'puppeteer-core')
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs')
const {spawn}=require('node:child_process'),{setTimeout:wait}=require('node:timers/promises')
const {mockSdk}=require('./verify-stage1.cjs')
async function run(){
 const server=spawn(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5190','--strictPort'],{env:{...process.env,VITE_AMAP_KEY:'tripflow-test-key',VITE_AMAP_SECURITY_JS_CODE:'tripflow-test-code'},stdio:'ignore'})
 let browser,page;const keep=setInterval(()=>{},1000)
 try{
  for(let i=0;i<60;i++){try{const r=await fetch('http://127.0.0.1:5190');await r.body.cancel();if(r.ok)break}catch{/* starting */}await wait(100)}
  browser=await pp.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});page=await browser.newPage();page.setDefaultTimeout(8000)
  const errors=[];page.on('pageerror',()=>errors.push('page script error'))
  await page.setViewport({width:1440,height:1000});await page.setRequestInterception(true)
  page.on('request',r=>r.url().startsWith('https://webapi.amap.com/maps?')?r.respond({contentType:'text/javascript',body:mockSdk.replace('window.___onAPILoaded();','MockMap.prototype.setZoomAndCenter=function(){};window.___onAPILoaded();')}):r.continue())
  await page.goto('http://127.0.0.1:5190',{waitUntil:'networkidle0'});await page.waitForSelector('.map-pin')
  const click=async(sel)=>{await page.$eval(sel,el=>el.scrollIntoView({block:'center'}));await page.click(sel)}
  const fill=async(sel,value)=>{await page.$eval(sel,(el,value)=>{const p=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))},value)}
  await click('.settings-disclosure summary');await fill('[name="dayCount"]','3');await click('.settings-save');await click('.settings-disclosure summary')
  await click('.explore-heading button')
  const ids=await page.$$eval('.candidate-card',els=>els.slice(0,5).map(el=>el.dataset.candidateId))
  for(const id of ids)await click(`[data-candidate-id="${id}"] .candidate-add`)
  await click('.explore-heading button')
  assert.equal((await page.$$('.visit-details[open]')).length,0)
  const sizes=await page.$$eval('.visit-card',els=>els.map(el=>el.getBoundingClientRect().height))
  assert.ok(sizes.every(n=>n<150),JSON.stringify(sizes))
  assert.equal(await page.$eval('.days-scroll',el=>getComputedStyle(el).overflowY),'visible')
  await click('.visit-details summary');await fill('.visit-details[open] textarea','展开编辑后收起，内容仍保留');await click('.visit-details[open] summary')
  assert.match(await page.$eval('.visit-details summary',el=>el.textContent),/有备注/)
  await page.$eval('.workspace',el=>window.scrollTo(0,el.getBoundingClientRect().top+scrollY+250));await wait(100)
  const bounds=await page.$eval('.map-column',el=>({top:el.getBoundingClientRect().top,height:el.getBoundingClientRect().height}))
  assert.ok(Math.abs(bounds.top-14)<3,JSON.stringify(bounds));assert.ok(bounds.height<=1000)
  await page.screenshot({path:'/tmp/tripflow-layout-scrolled.png'})
  await page.evaluate(()=>window.scrollTo(0,0));await wait(100)
  await page.screenshot({path:'/tmp/tripflow-layout-desktop.png',fullPage:true})
  // Map stays on screen while the document scrolls to a distant day's target.
  const days=await page.$$eval('.day-section',els=>els.map(el=>el.dataset.dayId))
  const target=`[data-day-id="${days[2]}"] .drop-slot`,source='[data-place-id="amap:B001B0I4K0"] .map-pin'
  await page.$eval(target,el=>el.scrollIntoView({block:'center'}));await wait(100)
  const center=async(sel)=>{const b=await(await page.$(sel)).boundingBox();return{x:b.x+b.width/2,y:b.y+b.height/2}}
  await page.setDragInterception(true)
  let dragTimer;try{await Promise.race([page.mouse.dragAndDrop(await center(source),await center(target),{delay:100}),new Promise((_,reject)=>{dragTimer=setTimeout(()=>reject(new Error('native drag timeout')),8000)})])}finally{clearTimeout(dragTimer)}
  await page.waitForFunction(id=>document.querySelector(`[data-day-id="${id}"]`).querySelectorAll('[data-visit-id]').length===1,{},days[2]);await page.setDragInterception(false)
  // Cross-day move with the expanded action, and keyboard grab/cancel preserves data.
  await click(`[data-day-id="${days[2]}"] .visit-details summary`)
  await page.select(`[data-day-id="${days[2]}"] .move-day-select`,days[1])
  assert.equal((await page.$$(`[data-day-id="${days[1]}"] [data-visit-id]`)).length,1)
  const handle=`[data-day-id="${days[1]}"] .sort-handle`
  await page.$eval(handle,el=>el.scrollIntoView({block:'center'}));await page.focus(handle);await page.keyboard.press('Space');await wait(100);await page.keyboard.press('Escape')
  assert.equal((await page.$$('[data-visit-id]')).length,6)
  for(const width of [1280,1024,768,390]){await page.setViewport({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}
  await click('.mobile-view-switch button:last-child');assert.equal(await page.$eval('.map-panel',el=>getComputedStyle(el).visibility),'visible')
  if(!await page.$('.candidate-add'))await click('.explore-heading button');await click(`[data-candidate-id="${ids[1]}"] .candidate-add`)
  assert.equal((await page.$$('[data-visit-id]')).length,7)
  await click('.mobile-view-switch button:first-child');assert.equal(await page.$eval('.itinerary',el=>getComputedStyle(el).visibility),'visible')
  assert.equal(await page.$eval('.itinerary',el=>getComputedStyle(el).height==='740px'),false)
  await page.screenshot({path:'/tmp/tripflow-layout-mobile.png',fullPage:true})
  await page.reload({waitUntil:'networkidle0'});assert.equal((await page.$$('[data-visit-id]')).length,7)
  assert.ok((await page.$$eval('textarea',els=>els.map(el=>el.value))).includes('展开编辑后收起，内容仍保留'))
  assert.deepEqual(errors,[])
  const result={compactCards:true,naturalDocumentScroll:true,stickyMap:true,distantDayNativeDrag:true,crossDayAndKeyboardCancel:true,mobileButtonsAndViews:true,savedAfterReload:true,pageErrors:errors}
  fs.writeFileSync('/tmp/tripflow-layout-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
 }catch(error){await page?.screenshot({path:'/tmp/tripflow-layout-failure.png',fullPage:true}).catch(()=>{});throw error}finally{if(browser){await Promise.race([browser.close().catch(()=>{}),wait(5000)]);browser.process()?.kill('SIGKILL')}server.kill('SIGTERM');clearInterval(keep)}
}
run().catch(e=>{console.error(e.message);process.exitCode=1})
