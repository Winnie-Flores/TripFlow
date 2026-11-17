const { expandEditorsForRegression } = require('./browser-helpers.cjs')
/* Real AMap reload/import acceptance in a fresh browser profile; no SDK interception. */
const pp=require(process.env.TRIPFLOW_PUPPETEER_MODULE||'puppeteer-core')
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {spawn}=require('node:child_process')
const {setTimeout:wait}=require('node:timers/promises')
async function run(){
 let browser,page
 const preview=process.env.TRIPFLOW_PREVIEW==='1'
 const base=process.env.TRIPFLOW_TEST_URL||(preview?'http://127.0.0.1:4175':'http://127.0.0.1:5173')
 const server=preview?spawn(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','4175','--strictPort'],{stdio:'ignore'}):null
 const timer=setInterval(()=>{},1000)
 try{
  if(preview)for(let i=0;i<60;i++){try{const r=await fetch(base);await r.body.cancel();if(r.ok)break}catch{/* starting */}await wait(100)}
  browser=await pp.launch({executablePath:process.env.TRIPFLOW_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
  page=await browser.newPage(); await expandEditorsForRegression(page);page.setDefaultTimeout(25000);await page.setViewport({width:1440,height:1000})
  const errors=[];page.on('pageerror',()=>errors.push('page script error'))
  const click=async(sel)=>{await page.$eval(sel,el=>el.scrollIntoView({block:'nearest'}));await page.click(sel)}
  await page.goto(base,{waitUntil:'networkidle2'})
  await page.waitForSelector('.map-pin');await click('.explore-heading button')
  await click('[data-candidate-id="amap:B001B0I4K0"] .candidate-focus');await page.select('[aria-label="标记形状"]','heart')
  await click('[data-candidate-id="amap:B001B0I4K0"] .candidate-add');await click('[data-candidate-id="amap:B0FFF5V6F4"] .candidate-add')
  await page.waitForSelector('.route-summary.ready');await page.waitForSelector('.save-state.saved')
  const initial=await page.$eval('.route-summary',el=>el.textContent)
  await page.reload({waitUntil:'networkidle2'});await page.waitForSelector('.route-summary.ready')
  assert.equal((await page.$$('[data-visit-id]')).length,2)
  const content=await page.evaluate(()=>JSON.stringify((()=>{const d=JSON.parse(localStorage.getItem('tripflow.trips.v1'));return d.records.find(r=>r.document.trip.id===d.activeTripId).document})()))
  const data=JSON.parse(content);data.visits[0].notes='真实服务导入后重新计算';data.places.find(p=>p.sourceId==='B001B0I4K0').shape='diamond'
  fs.writeFileSync('/tmp/tripflow-stage5-real-import.json',JSON.stringify(data))
  page.once('dialog',d=>d.accept());await(await page.$('[aria-label="导入旅行文件"]')).uploadFile('/tmp/tripflow-stage5-real-import.json')
  await page.waitForFunction(()=>document.querySelector('.data-feedback')?.textContent.includes('已载入'))
  await page.waitForSelector('.route-summary.ready')
  assert.ok((await page.$$eval('textarea',els=>els.map(el=>el.value))).includes('真实服务导入后重新计算'))
  assert.equal(await page.$eval('[data-place-id="amap:B001B0I4K0"] svg path',el=>el.getAttribute('d')),'m12 2 9 10-9 10L3 12Z')
  await page.$eval('.map-panel',el=>el.scrollIntoView({block:'center'}));await wait(1200)
  await page.screenshot({path:'/tmp/tripflow-stage5-real-desktop.png',fullPage:true})
  await page.setViewport({width:390,height:844});await click('.mobile-view-switch button:last-child')
  await page.$eval('.map-panel',el=>el.scrollIntoView({block:'center'}));await wait(1800)
  assert.equal(await page.$eval('.map-panel',el=>getComputedStyle(el).visibility),'visible')
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await page.screenshot({path:'/tmp/tripflow-stage5-real-mobile.png',fullPage:true})
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({realAmapVerified:true,productionPreview:preview,reloadRoads:true,importRoads:true,restoredIconsAndNotes:true,mobileMap:true,initialRoad:initial,pageErrors:errors},null,2))
 }finally{if(browser){await Promise.race([browser.close().catch(()=>{}),wait(5000)]);browser.process()?.kill('SIGKILL')}server?.kill('SIGTERM');clearInterval(timer)}
}
run().catch(error=>{console.error(error.message);process.exitCode=1})
