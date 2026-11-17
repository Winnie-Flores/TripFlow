import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as tick } from 'node:timers/promises'
import { createTripStore } from '../src/state/tripStore.js'
import { createDocument, parseDocument } from '../src/state/document.js'
import { createRouteController,routeSnapshot } from '../src/map/routeController.js'
import { dayLegs } from '../src/state/dayRoute.js'
import { dayTimeline } from '../src/state/timeline.js'
import { printableHtml,readableReport } from '../src/state/readableExport.js'
import { matchesPlace,arrangedIds } from '../src/state/placeFilters.js'
const setup=()=>{const store=createTripStore(),s=()=>store.getState(),day=s().days[0].id,ids=Object.keys(s().places).slice(0,3);for(const id of ids)s().addVisit(id,day);return {store,s,day,ids}}
test('撤销/重做恢复排序删除日期酒店等文档内容；输入分组合并；分支修改清重做，不记录运行时',()=>{
 const {s,day}=setup(),initial=JSON.stringify(createDocument(s()))
 const visit=s().days[0].visitIds[0]
 s().editVisit(visit,{notes:'午'});s().editVisit(visit,{notes:'午饭'})
 const count=s().undoCount;s().setRoute({status:'loading'});s().selectDay(day);assert.equal(s().undoCount,count)
 s().undo();assert.equal(JSON.stringify(createDocument(s())),initial)
 s().redo();assert.equal(s().visits[visit].notes,'午饭')
 s().removeVisit(visit);s().undo();assert.ok(s().visits[visit]);s().redo();assert.equal(s().visits[visit],undefined)
 s().undo();s().editVisit(visit,{durationMinutes:120});assert.equal(s().redoCount,0)
 s().insertDay();const days=s().days.length;s().undo();assert.equal(s().days.length,days-1)
 for(let i=0;i<30;i++)s().toggleFavorite(Object.keys(s().places)[0]);assert.ok(s().undoCount<=20)
 assert.equal(Object.hasOwn(createDocument(s()),'undoCount'),false)
})
test('导入/跨旅行切换清历史；旧请求遇到撤销立即作废，快照不含道路结果',async()=>{
 const {store,s,day}=setup(),calls=[]
 const control=createRouteController({store,delayMs:1,clear(){},draw(){},request:(a,b,m,signal)=>new Promise(resolve=>calls.push({signal,resolve}))})
 await tick(5);s().removeVisit(s().days[0].visitIds[0]);assert.equal(calls[0].signal.aborted,true)
 s().undo();assert.equal(s().days[0].visitIds.length,3)
 calls[0].resolve({path:[[114,30],[115,31]],distance:1,time:1});await tick(0);assert.notEqual(s().route.status,'ready');control.destroy()
 const doc=JSON.stringify(createDocument(s()));s().replaceDocument(doc);assert.equal(s().undoCount,0)
 s().addVisit(Object.keys(s().places)[0],day);s().createTrip({name:'杭州',city:'杭州',startDate:'2026-11-20',dayCount:1});assert.equal(s().undoCount,0);assert.equal(s().redo(),false)
})
test('分段方式走不同服务，修改立即作废旧请求；稳定端点保留，不相邻时清除；备份引用校验',async()=>{
 const {store,s,day}=setup(),legs=dayLegs(s(),s().days[0]);s().setLegMode(day,legs[0].key,'driving')
 const modes=[];const controller=createRouteController({store,delayMs:1,clear(){},draw(){},request:async(a,b,mode)=>{modes.push(mode);return{path:[a,b],distance:100,time:60}}})
 await tick(10);assert.deepEqual(modes,['driving','walking']);controller.destroy()
 assert.equal(parseDocument(JSON.stringify(createDocument(s()))).days[0].legModes[legs[0].key],'driving')
 const ids=s().days[0].visitIds;s().reorderVisit(day,ids[2],ids[1]);assert.equal(Object.keys(s().days[0].legModes).length,0)
 s().undo();assert.equal(s().days[0].legModes[legs[0].key],'driving')
 s().applyModeToAll('walking');assert.equal(Object.keys(s().days[0].legModes).length,0)
 const bad=createDocument(s());bad.days[0].legModes={bad:'walking'};assert.throws(()=>parseDocument(JSON.stringify(bad)),/分段交通/)
})
test('时间轴含交通、停留、预约等待；失败后的时间只有下限，跨日及迟到提示；时间编辑不重算道路',()=>{
 const {s,day}=setup(),visits=s().days[0].visitIds,signature=routeSnapshot(s()).signature
 s().setDepartureTime(day,'08:00');s().editVisit(visits[1],{fixedTime:'10:00'})
 assert.equal(routeSnapshot(s()).signature,signature)
 s().setRoute({signature,days:[{dayId:day,legs:[{status:'ready',time:600,distance:100},{status:'error'}]}]})
 const result=dayTimeline(s(),s().days[0]);assert.equal(result.rows[1].arrival,550);assert.equal(result.rows[1].wait,50)
 assert.equal(result.rows[2].uncertain,true);assert.equal(result.incomplete,true)
 s().editVisit(visits[2],{fixedTime:'08:30',durationMinutes:1440});assert.ok(dayTimeline(s(),s().days[0]).crossesDay);assert.ok(dayTimeline(s(),s().days[0]).conflicts)
 s().retryRoute();s().setRoute({status:'loading'});assert.equal(dayTimeline(s(),s().days[0]).completed,0)
 const bad=createDocument(s());bad.days[0].departureTime='25:00';assert.throws(()=>parseDocument(JSON.stringify(bad)),/出发时间/)
})
test('可读导出隔离HTML注入，未计算日期明确缺失，不持久化运行时；旧文件兼容新字段',()=>{
 const {s}=setup(),visit=s().days[0].visitIds[0];s().editVisit(visit,{notes:'<script>alert(1)</script>\n午饭 & 晚饭'})
 const html=printableHtml(readableReport(s()));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('交通未完整'))
 const old=createDocument(s());for(const d of old.days){delete d.legModes;delete d.departureTime}for(const v of old.visits)delete v.fixedTime;for(const p of old.places)delete p.favorite
 const parsed=parseDocument(JSON.stringify(old));assert.equal(parsed.days[0].departureTime,'09:00');assert.deepEqual(parsed.days[0].legModes,{})
})
test('收藏与分类/已安排筛选组合且不会触发道路；收藏随导出恢复',()=>{
 const {s,ids}=setup(),before=routeSnapshot(s()).signature;s().toggleFavorite(ids[0]);const place=s().places[ids[0]]
 assert.equal(routeSnapshot(s()).signature,before);assert.equal(matchesPlace(place,{category:'all',favoriteOnly:true,arrangedOnly:true},arrangedIds(s())),true)
 assert.equal(matchesPlace(place,{category:'food',favoriteOnly:true},arrangedIds(s())),false)
 assert.equal(matchesPlace({...place,category:'food'},{category:'food',favoriteOnly:true},arrangedIds(s())),true)
 assert.equal(parseDocument(JSON.stringify(createDocument(s()))).places[ids[0]].favorite,true)
})
