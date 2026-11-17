const { expandEditorsForRegression } = require('./browser-helpers.cjs')
/* Browser UI acceptance. Default uses mocked SDK; TRIPFLOW_REAL=1 uses configured real services. No credentials logged. */
const puppeteer = require(process.env.TRIPFLOW_PUPPETEER_MODULE || 'puppeteer-core')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { setTimeout: wait } = require('node:timers/promises')
const path = require('node:path')
const fs = require('node:fs')
const { mockSdk } = require('./verify-stage1.cjs')
const real = process.env.TRIPFLOW_REAL === '1'
const searchMock = mockSdk.replace("(20+(this.opts.position[0]-114.297)/.007*60)", "(12+(this.opts.position[0]-114.28)/.1*75)")
  .replace("(27+(30.548-this.opts.position[1])/.005*45)", "(10+(30.615-this.opts.position[1])/.085*75)")
  .replace('window.___onAPILoaded();', `
window.__searchqa={details:[],focus:[],cityCalls:[]};
MockMap.prototype.setZoomAndCenter=function(zoom,center){window.__searchqa.focus.push(center)};
const point={lng:114.33,lat:30.57};
const tip=(id,name,address,location)=>({id,name,address,district:'武汉市武昌区',adcode:'420106',location});
window.AMap.AutoComplete=class {search(q,cb){
 const tips=q==='同名'?[tip('QA1','同名咖啡馆','第一地址',[]),tip('QA2','同名咖啡馆','第二地址',point)]:[tip(q==='旧'?'OLD':'NEW',q+'地点','具体地址',point)];
 setTimeout(()=>cb('complete',{tips}),q==='旧'?1800:50);
}};
window.AMap.PlaceSearch=class {constructor(options){this.city=options.city}clear(){}getDetails(id,cb){window.__searchqa.details.push(id);setTimeout(()=>cb('complete',{poiList:{pois:[tip(id,'同名咖啡馆','第一地址',point)]}}),60)}search(q,cb){cb('complete',{poiList:{pois:[{id:'HZ1',name:'杭州小众地点',address:'杭州市具体地址',adcode:'330106',location:{lng:120.15,lat:30.25}}]}})}};
window.AMap.DistrictSearch=class {search(q,cb){window.__searchqa.cityCalls.push(q);cb('complete',{districtList:[{name:'杭州市',adcode:'330100',level:'city',center:{lng:120.15,lat:30.25}}]})}};
window.___onAPILoaded();`)
async function run() {
  const {WUHAN_PLACES}=await import('../src/data/wuhan.js'),{HANGZHOU_PLACES}=await import('../src/data/hangzhou.js');const baseline=WUHAN_PLACES.length,hzCount=HANGZHOU_PLACES.length
  const server = !real && spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5188', '--strictPort'],
    { env: { ...process.env, VITE_AMAP_KEY: 'tripflow-test-key', VITE_AMAP_SECURITY_JS_CODE: 'tripflow-test-code' }, stdio: 'ignore' })
  const base = real ? 'http://127.0.0.1:5173' : 'http://127.0.0.1:5188'
  let browser, page
  const keepAlive = setInterval(() => {}, 1000)
  try {
    for(let i=0;i<60;i++){try{const r=await fetch(base);await r.body.cancel();if(r.ok)break}catch{/* starting */}await wait(100)}
    browser = await puppeteer.launch({ executablePath: process.env.TRIPFLOW_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
    page = await browser.newPage(); await expandEditorsForRegression(page); page.setDefaultTimeout(15000)
    const errors=[];page.on('pageerror',()=>errors.push('page script error'))
    await page.setViewport({width:1440,height:1700})
    if(!real){await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith('https://webapi.amap.com/maps?')?r.respond({contentType:'text/javascript',body:searchMock}):r.continue())}
    await page.goto(base,{waitUntil:'networkidle2'})
    await page.waitForFunction(n=>document.querySelectorAll('.map-pin').length===n,{timeout:30000},baseline)
    const click=async(sel)=>{await page.$eval(sel,el=>el.scrollIntoView({block:'nearest'}));await page.click(sel)}
    const fill=async(sel,value)=>{await page.$eval(sel,(el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))},value)}
    const center=async(sel)=>{const box=await(await page.$(sel)).boundingBox();assert.ok(box);return{x:box.x+box.width/2,y:box.y+box.height/2}}
    const drag = async (source, target) => {
      await page.$eval(source,el=>el.scrollIntoView({block:'nearest'}))
      await wait(350)
      const from = await center(source), to = await center(target)
      const hit = await page.evaluate(({x,y}) => document.elementFromPoint(x,y)?.closest('.place-marker')?.dataset.placeId, from)
      const expected = await page.$eval(source,el=>el.closest('.place-marker').dataset.placeId)
      assert.equal(hit, expected, 'Visible native drag source must be the intended marker')
      let timer
      try { await Promise.race([page.mouse.dragAndDrop(from,to,{delay:100}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Native browser drag did not start/finish')),10000)})]) }
      finally { clearTimeout(timer) }
    }
    const input='[aria-label="搜索当前城市地点"]'
    await page.waitForFunction(()=>!document.querySelector('[aria-label="搜索当前城市地点"]').disabled)
    // Popular POI keeps fixed coordinates and can be dragged directly from the map.
    await click('.explore-heading button')
    await click('[data-candidate-id="amap:B001B0I4K0"] .candidate-focus')
    await page.$eval('.drop-slot',el=>el.scrollIntoView({block:'nearest'}));await wait(100)
    await page.setDragInterception(true)
    await drag('[data-place-id="amap:B001B0I4K0"] .map-pin','.drop-slot')
    await page.waitForSelector('[data-visit-id]');await page.setDragInterception(false)
    assert.match(await page.$eval('.visit-top',el=>el.textContent),/黄鹤楼/)
    await click('.remove-visit');await click('.explore-heading button')
    if(!real){
      await fill(input,'旧');await wait(600);await fill(input,'新');await wait(2300)
      await page.waitForSelector('.search-results li');assert.match(await page.$eval('.search-results',el=>el.textContent),/新地点/)
      await fill(input,'旧');await wait(600);await click('.poi-search button:last-child');await wait(1900)
      assert.equal(await page.$('.search-results'),null)
    }
    await fill(input,real?'大水的店':'同名');await page.waitForSelector('.search-results li')
    if(!real)assert.equal((await page.$$('.search-results li')).length,2)
    await click('.search-results li button')
    await page.waitForFunction(n=>document.querySelectorAll('.map-pin').length===n,{},baseline+1)
    if(!real)assert.deepEqual(await page.evaluate(()=>window.__searchqa.details),['QA1'])
    assert.equal(await page.$eval('[aria-label="标记形状"]',el=>el.value),'star')
    const source='.place-marker.is-focused .map-pin'
    await page.$eval('.drop-slot',el=>el.scrollIntoView({block:'nearest'}));await wait(100)
    await page.setDragInterception(true)
    await drag(source,'.drop-slot')
    await page.waitForSelector('[data-visit-id]');await page.setDragInterception(false)
    await click('[aria-label="在第 1 天后插入"]')
    await page.$eval('.day-section.is-selected .drop-slot',el=>el.scrollIntoView({block:'nearest'}));await wait(100)
    await page.setDragInterception(true)
    await drag(source,'.day-section.is-selected .drop-slot')
    await page.waitForFunction(()=>document.querySelectorAll('[data-visit-id]').length===2);await page.setDragInterception(false)
    await page.select('[aria-label="标记形状"]','heart')
    await fill('[aria-label="标记颜色"]','#7944aa')
    assert.equal(await page.$eval('.place-marker.is-focused',el=>el.style.getPropertyValue('--pin-color')),'#7944aa')
    assert.equal(await page.$eval('.place-marker.is-focused .pin-number svg path',el=>el.getAttribute('d')),await page.$eval('.visit-number svg path',el=>el.getAttribute('d')))
    assert.equal(await page.$eval('.visit-number',el=>el.style.backgroundColor),'rgb(121, 68, 170)')
    if(!real){
      await fill(input,'');await fill(input,'同名');await page.waitForSelector('.search-results li');await click('.search-results li:nth-child(2) button')
      await page.waitForFunction(n=>document.querySelectorAll('.map-pin').length===n,{},baseline+2)
    }
    // Repeated search uses stable source ID and preserves custom style.
    await fill(input,'');await fill(input,real?'大水的店':'同名');await page.waitForSelector('.search-results li');await click('.search-results li button')
    await page.waitForFunction(()=>document.querySelector('[aria-label="标记形状"]').value==='heart')
    assert.equal((await page.$$('.map-pin')).length,real?baseline+1:baseline+2)
    if(real){await page.$eval('.map-panel',el=>el.scrollIntoView({block:'center'}));await wait(1800)}
    await page.screenshot({path:`/tmp/tripflow-stage4-${real?'real':'mock'}-desktop.png`,fullPage:true})
    // City changes are checked online and confirmed; cancel preserves old contents.
    await click('.settings-disclosure summary')
    await fill('[name="city"]','杭州');await click('.city-search-controls button')
    await page.waitForFunction(()=>document.querySelector('.city-search-controls').textContent.includes('330100'))
    const cancel=d=>d.dismiss();page.once('dialog',cancel);await click('.settings-save')
    await page.waitForFunction(()=>document.querySelector('.settings-feedback').textContent.includes('取消'))
    assert.equal((await page.$$('[data-visit-id]')).length,2)
    page.once('dialog',d=>d.accept());await click('.settings-save')
    await page.waitForFunction(()=>document.querySelector('.city-badge').textContent.includes('杭州'))
    await page.waitForFunction(n=>document.querySelectorAll('.map-pin').length===n,{},hzCount)
    assert.equal((await page.$$('[data-visit-id]')).length,0)
    assert.equal(await page.$('.place-style-editor'),null)
    await page.waitForFunction(()=>!document.querySelector('[aria-label="搜索当前城市地点"]').disabled)
    await fill(input,real?'馒头山社区':'杭州小众地点');await click('.poi-search button:first-of-type')
    await page.waitForSelector('.search-results li');await click('.search-results li button')
    await page.waitForFunction(n=>document.querySelectorAll('.map-pin').length===n,{},hzCount+1)
    await click('.explore-heading button')
    await page.waitForSelector('.candidate-add');await click('.candidate-add')
    await page.waitForSelector('[data-visit-id]')
    await page.setViewport({width:390,height:844})
    await click('.mobile-view-switch button:last-child')
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
    if(real){await page.$eval('.map-panel',el=>el.scrollIntoView({block:'center'}));await wait(1800)}
    await page.screenshot({path:`/tmp/tripflow-stage4-${real?'real':'mock'}-mobile.png`,fullPage:true})
    assert.deepEqual(errors,[])
    const result={mode:real?'real AMap':'mock SDK',popularCount:baseline,popularNativeDrag:true,searchCrossDayDrag:true,searchResolve:true,missingCoordinateDetails:real?'covered by mock':true,nativeDrag:true,styleSync:true,stableId:true,cityCancelAndReset:true,otherCitySearch:true,mobile:true,pageErrors:errors}
    fs.writeFileSync(`/tmp/tripflow-stage4-${real?'real':'mock'}-result.json`,JSON.stringify(result,null,2))
    console.log(JSON.stringify(result,null,2))
  } catch(error){await page?.screenshot({path:'/tmp/tripflow-stage4-failure.png',fullPage:true}).catch(()=>{});throw error}
  finally{if(browser){await Promise.race([browser.close().catch(()=>{}),wait(5000)]);browser.process()?.kill('SIGKILL')}server?.kill?.('SIGTERM');clearInterval(keepAlive)}
}
run().catch(error=>{console.error(error.message);process.exitCode=1})
