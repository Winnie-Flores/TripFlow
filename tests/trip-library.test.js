import test from 'node:test'
import assert from 'node:assert/strict'
import { createStore } from 'zustand/vanilla'
import { createTripStore } from '../src/state/tripStore.js'
import { createDocument } from '../src/state/document.js'
import { createLibrary, parseLibrary, LIBRARY_KEY, MAX_LIBRARY_BYTES } from '../src/state/tripLibrary.js'
import { startLibraryPersistence } from '../src/state/libraryPersistence.js'
import { STORAGE_KEY } from '../src/state/persistence.js'
const input={name:'杭州三日游',city:'杭州',startDate:'2026-11-20',dayCount:3,cityInfo:{name:'杭州',adcode:'330100',center:[120.15,30.25]}}
const setup=()=>{const s=createTripStore({today:'2026-11-08'});const state=s.getState();state.addVisit('amap:B001B0I4K0',state.days[0].id);state.editVisit(s.getState().days[0].visitIds[0],{notes:'武汉备注'});state.editPlace('amap:B001B0I4K0',{shape:'heart',color:'#7944aa'});return s}
test('新增杭州保留武汉，切回编辑、刷新、同 ID 导入均不影响其他旅行',()=>{
 const s=setup(),wuhan=createDocument(s.getState()),oldEpoch=s.getState().documentEpoch
 assert.equal(s.getState().createTrip(input).ok,true)
 const hz=s.getState().trip.id
 assert.notEqual(hz,wuhan.trip.id);assert.equal(s.getState().trip.city,'杭州');assert.equal(Object.keys(s.getState().visits).length,0)
 assert.deepEqual(s.getState().tripRecords[wuhan.trip.id].document,wuhan)
 assert.ok(s.getState().documentEpoch>oldEpoch)
 assert.equal(s.getState().openTrip(wuhan.trip.id).ok,true);assert.deepEqual(createDocument(s.getState()),wuhan)
 s.getState().editVisit(s.getState().days[0].visitIds[0],{notes:'武汉继续编辑'})
 s.getState().openTrip(hz);assert.equal(s.getState().trip.city,'杭州')
 const restored=createTripStore();restored.getState().restoreLibrary(JSON.stringify(createLibrary(s.getState())))
 assert.equal(restored.getState().trip.id,hz);assert.equal(createLibrary(restored.getState()).records.length,2)
 restored.getState().openTrip(wuhan.trip.id);assert.equal(Object.values(restored.getState().visits)[0].notes,'武汉继续编辑')
 const same=createDocument(restored.getState());same.trip.name='武汉新版';restored.getState().replaceDocument(JSON.stringify(same))
 assert.equal(createLibrary(restored.getState()).records.length,2)
 restored.getState().openTrip(hz);assert.equal(restored.getState().trip.name,'杭州三日游')
})
test('单旅行旧存档原样保留并迁移，只生成一条真实记录；优先恢复新记录集',()=>{
 const doc=JSON.stringify(createDocument(setup().getState())),memory=new Map([[STORAGE_KEY,doc]])
 const storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)},status=createStore(()=>({}))
 const s=createTripStore(),p=startLibraryPersistence(s,{storage,statusStore:status})
 assert.equal(memory.get(STORAGE_KEY),doc);assert.equal(parseLibrary(memory.get(LIBRARY_KEY)).activeTripId,s.getState().trip.id)
 assert.equal(Object.keys(parseLibrary(memory.get(LIBRARY_KEY)).records).length,1)
 s.getState().createTrip(input);p.flush();p.destroy()
 const s2=createTripStore(),p2=startLibraryPersistence(s2,{storage,statusStore:status})
 assert.equal(s2.getState().trip.city,'杭州');assert.equal(createLibrary(s2.getState()).records.length,2);p2.destroy()
})
test('删除只作用于指定非当前记录；新建失败/非法集合不损坏当前数据',()=>{
 const s=setup(),id=s.getState().trip.id;s.getState().createTrip(input)
 assert.equal(s.getState().deleteTrip(s.getState().trip.id).ok,false)
 const before=JSON.stringify(createLibrary(s.getState()))
 assert.equal(s.getState().createTrip({...input,name:''}).ok,false);assert.equal(JSON.stringify(createLibrary(s.getState())),before)
 const valid=JSON.parse(before)
 for(const mutate of [d=>d.schemaVersion=99,d=>d.records.push(d.records[0]),d=>d.activeTripId='missing',d=>d.records[0].document.days[0].visitIds.push('missing'),d=>d.records[0].updatedAt='invalid']){
  const bad=structuredClone(valid);mutate(bad);assert.throws(()=>s.getState().restoreLibrary(JSON.stringify(bad)));assert.equal(JSON.stringify(createLibrary(s.getState())),before)
 }
 assert.throws(()=>parseLibrary('x'.repeat(MAX_LIBRARY_BYTES+1)))
 assert.equal(s.getState().deleteTrip(id).ok,true);assert.equal(createLibrary(s.getState()).records.length,1)
})
test('记录集损坏/未来版本或写入失败时保留旧存档；不因道路请求变化写盘',()=>{
 const memory=new Map([[LIBRARY_KEY,'{"schemaVersion":99}']]),status=createStore(()=>({})),s=setup();let writes=0,fail=false
 const storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>{if(fail)throw new Error('quota');writes++;memory.set(k,v)}}
 const p=startLibraryPersistence(s,{storage,statusStore:status,delayMs:100})
 assert.equal(status.getState().status,'blocked');s.getState().createTrip(input);p.flush();assert.equal(writes,0)
 assert.equal(memory.get(LIBRARY_KEY),'{"schemaVersion":99}')
 p.retry();assert.equal(status.getState().status,'saved');const count=writes
 s.getState().setRoute({status:'loading'});p.flush();assert.equal(writes,count)
 const saved=memory.get(LIBRARY_KEY);fail=true;s.getState().insertDay();p.flush();assert.equal(status.getState().status,'error');assert.equal(memory.get(LIBRARY_KEY),saved)
 fail=false;p.retry();assert.equal(status.getState().status,'saved');p.destroy()
})

test('记录数量达到上限时阻止新增但仍可打开、删除和重新新增，不自动淘汰旧旅行',()=>{
 const document=createDocument(setup().getState()),time=new Date().toISOString()
 const records=Array.from({length:50},(_,i)=>({createdAt:time,updatedAt:time,document:{...structuredClone(document),trip:{...document.trip,id:`trip-limit-${i}`,name:`旅行${i}`}}}))
 const s=createTripStore();s.getState().restoreLibrary(JSON.stringify({schemaVersion:1,activeTripId:'trip-limit-0',records}))
 const before=JSON.stringify(createLibrary(s.getState()))
 assert.equal(s.getState().createTrip(input).ok,false);assert.equal(JSON.stringify(createLibrary(s.getState())),before)
 assert.equal(s.getState().openTrip('trip-limit-1').ok,true)
 assert.equal(s.getState().deleteTrip('trip-limit-0').ok,true)
 assert.equal(s.getState().createTrip(input).ok,true);assert.equal(createLibrary(s.getState()).records.length,50)
})
