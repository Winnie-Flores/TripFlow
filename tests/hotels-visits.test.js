import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as tick } from 'node:timers/promises'
import { createTripStore } from '../src/state/tripStore.js'
import { createDocument, parseDocument } from '../src/state/document.js'
import { routeSnapshot, createRouteController } from '../src/map/routeController.js'
import { WUHAN_PLACES } from '../src/data/wuhan.js'
import { HANGZHOU_PLACES } from '../src/data/hangzhou.js'
const a=WUHAN_PLACES[0].id,b=WUHAN_PLACES[1].id
const hotel=id=>({id:`amap:${id}`,sourceId:id,name:'测试酒店'+id,city:'武汉',adcode:'420106',address:'测试地址',coordinates:id==='H1'?[114.31,30.55]:[114.32,30.56],category:'hotel',shape:'landmark',popular:false,color:'#35796c'})
function setup(){const store=createTripStore();store.getState().insertDay();store.getState().addCandidate(hotel('H1'));store.getState().addCandidate(hotel('H2'));return store}
test('武汉 25/杭州 24 个精选点，旧旅行补齐候选且保留原样式、游览和酒店',()=>{
 assert.equal(WUHAN_PLACES.length,25);assert.equal(HANGZHOU_PLACES.length,24)
 const store=setup(),day=store.getState().days[0].id
 store.getState().addVisit(a,day);store.getState().editPlace(a,{shape:'heart',color:'#123abc'});store.getState().setTripHotel('amap:H1')
 const doc=createDocument(store.getState());doc.places=doc.places.filter(p=>p.id===a||p.category==='hotel')
 store.getState().replaceDocument(JSON.stringify(doc));assert.equal(Object.values(store.getState().places).filter(p=>p.popular).length,25)
 assert.equal(store.getState().places[a].shape,'heart');assert.equal(store.getState().days[0].startHotelId,'amap:H1')
 assert.equal(store.getState().days[0].visitIds.length,1)
})
test('同日多次安排同一地点，各自备注时长、移动/删除/导入不混淆',()=>{
 const store=setup(),[d1,d2]=store.getState().days.map(d=>d.id)
 store.getState().addVisit(a,d1);store.getState().addVisit(b,d1);store.getState().addVisit(a,d1)
 const ids=store.getState().days[0].visitIds;assert.equal(new Set(ids).size,3)
 store.getState().editVisit(ids[0],{notes:'午饭',durationMinutes:60});store.getState().editVisit(ids[2],{notes:'晚饭',durationMinutes:90})
 assert.equal(parseDocument(JSON.stringify(createDocument(store.getState()))).days[0].visitIds.length,3)
 store.getState().moveVisit(ids[2],d2,0);assert.equal(store.getState().visits[ids[2]].notes,'晚饭')
 store.getState().moveVisit(ids[2],d1,0);store.getState().removeVisit(ids[0]);assert.equal(store.getState().visits[ids[2]].durationMinutes,90)
})
test('酒店→每次游览→入住酒店顺序，换住酒店同步次日起点，新增天继承；空天不空转',()=>{
 const store=setup(),state=()=>store.getState(),[d1,d2]=state().days.map(d=>d.id)
 state().setTripHotel('amap:H1');assert.deepEqual(routeSnapshot(state()).points,[])
 state().addVisit(a,d1);state().addVisit(b,d1);state().addVisit(a,d1)
 state().setDayHotels(d1,{endHotelId:'amap:H2'})
 assert.equal(state().days[1].startHotelId,'amap:H2')
 assert.deepEqual(routeSnapshot(state()).points,[hotel('H1').coordinates,WUHAN_PLACES[0].coordinates,WUHAN_PLACES[1].coordinates,WUHAN_PLACES[0].coordinates,hotel('H2').coordinates])
 assert.equal(state().setDayHotels(d1,{endHotelId:a}),false)
 assert.equal(parseDocument(JSON.stringify(createDocument(state()))).days[0].endHotelId,'amap:H2')
 state().selectDay(d2);assert.equal(routeSnapshot(state()).points.length,2)
 state().insertDay();assert.equal(state().days.at(-1).startHotelId,'amap:H1')
})
test('酒店变化立即取消旧道路，备注不重算；连续同地点是零交通段且不发伪路线请求',async()=>{
 const store=setup(),calls=[],draw=[];const day=store.getState().days[0].id
 store.getState().addVisit(a,day);store.getState().addVisit(a,day)
 const controller=createRouteController({store,delayMs:1,clear(){},draw:legs=>draw.push(legs),request:(a,b,m,signal)=>new Promise(resolve=>calls.push({signal,resolve}))})
 await tick(5);assert.equal(calls.length,0);assert.equal(store.getState().route.status,'ready');assert.equal(store.getState().route.days[0].legs[0].sameLocation,true)
 store.getState().setTripHotel('amap:H1');await tick(5);assert.equal(calls.length,1)
 store.getState().setDayHotels(day,{startHotelId:'amap:H2'});assert.equal(calls[0].signal.aborted,true)
 calls[0].resolve({path:[[114,30],[115,31]],distance:100,time:60});await tick(0);assert.equal(draw.length,0)
 const signature=routeSnapshot(store.getState()).signature;store.getState().editVisit(store.getState().days[0].visitIds[0],{notes:'午饭'});assert.equal(routeSnapshot(store.getState()).signature,signature)
 controller.destroy()
})

test('酒店加入候选不改变任一天住宿；可直接选为某晚酒店且原全程设置不被覆盖',()=>{
 const store=createTripStore();store.getState().insertDay();const [d1,d2]=store.getState().days
 store.getState().addCandidate(hotel('H1'));assert.equal(store.getState().days[0].endHotelId ?? null,null)
 store.getState().setTripHotel('amap:H1');store.getState().addCandidate(hotel('H2'))
 assert.equal(store.getState().days[0].endHotelId,'amap:H1');assert.equal(store.getState().days[1].endHotelId,'amap:H1')
 store.getState().setDayHotels(d1.id,{endHotelId:'amap:H2'})
 assert.equal(store.getState().days.find(d=>d.id===d2.id).endHotelId,'amap:H1')
 assert.equal(store.getState().days[1].startHotelId,'amap:H2')
 const data=parseDocument(JSON.stringify(createDocument(store.getState())))
 assert.equal(data.days[0].endHotelId,'amap:H2');assert.equal(data.places['amap:H2'].category,'hotel')
 assert.ok(WUHAN_PLACES.some(p=>p.category==='shopping'));assert.ok(HANGZHOU_PLACES.some(p=>p.name.includes('in77')))
})
