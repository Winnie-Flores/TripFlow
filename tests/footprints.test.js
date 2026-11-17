import test from 'node:test'
import assert from 'node:assert/strict'
import { createTripStore } from '../src/state/tripStore.js'
import { createDocument, parseDocument } from '../src/state/document.js'
import { createLibrary } from '../src/state/tripLibrary.js'
import { footprints } from '../src/state/footprints.js'
import { routeSnapshot } from '../src/map/routeController.js'
test('足迹状态按旅行独立保存，非当前旅行修改不污染当前行程，恢复/导入保留', () => {
 const store=createTripStore(),wh=store.getState().trip.id
 store.getState().setTripStatus(wh,'visited')
 const signature=routeSnapshot(store.getState()).signature
 assert.equal(store.getState().setTripStatus(wh,'bad'),false)
 assert.equal(routeSnapshot(store.getState()).signature,signature)
 store.getState().createTrip({name:'杭州',city:'杭州',startDate:'2026-11-10',dayCount:2,cityInfo:{name:'杭州',adcode:'330100',center:[120.155,30.25]}})
 const hz=store.getState().trip.id
 assert.equal(store.getState().trip.status,'planned')
 assert.equal(store.getState().tripRecords[wh].document.trip.status,'visited')
 store.getState().setTripStatus(wh,'planned');assert.equal(store.getState().trip.id,hz)
 store.getState().setTripStatus(wh,'visited')
 const restored=createTripStore();restored.getState().restoreLibrary(JSON.stringify(createLibrary(store.getState())))
 assert.equal(restored.getState().tripRecords[wh].document.trip.status,'visited')
 restored.getState().openTrip(wh);assert.equal(restored.getState().trip.status,'visited')
 assert.equal(parseDocument(JSON.stringify(createDocument(restored.getState()))).trip.status,'visited')
})
test('旧存档默认规划中，非法状态拒绝；编辑设置保留状态，重建默认为规划', () => {
 const store=createTripStore();const old=createDocument(store.getState());delete old.trip.status
 assert.equal(parseDocument(JSON.stringify(old)).trip.status,'planned')
 old.trip.status='unknown';assert.throws(()=>parseDocument(JSON.stringify(old)),/状态/)
 store.getState().setTripStatus(store.getState().trip.id,'visited')
 store.getState().configureTrip({...store.getState().trip,name:'修改名称',dayCount:1})
 assert.equal(store.getState().trip.status,'visited')
 store.getState().configureTrip({...store.getState().trip,name:'重建',dayCount:1},{reset:true,confirmed:true})
 assert.equal(store.getState().trip.status,'planned')
})
test('同城足迹合并两种状态，不点亮候选景点，缺城市坐标不猜位置，删除后统计更新', () => {
 const record=(city,status,center)=>({document:{trip:{city,status},cityInfo:center?{center}:null,places:[{coordinates:[0,0]}]}})
 const rows=[record('武汉','visited',[114.3,30.59]),record('武汉市','planned'),record('杭州','planned',[120.15,30.25]),record('未定位目的地','visited')]
 assert.deepEqual(footprints(rows),{cities:[{name:'武汉',adcode:null,coordinates:[114.3,30.59],visited:1,planned:1},{name:'杭州',adcode:null,coordinates:[120.15,30.25],visited:0,planned:1}],missing:['未定位目的地']})
 assert.equal(footprints(rows.slice(1)).cities.length,1)
})

test('中国区域填色匹配稳定行政编码，已去过优先；直辖市不拆成市辖区', async () => {
 const { cityCode, chinaFootprintStyles, footprintRegionCity, FOOTPRINT_COLORS } = await import('../src/map/chinaFootprints.js')
 const cities=[{name:'武汉',adcode:'420100',visited:1,planned:2},{name:'杭州',adcode:'330100',visited:0,planned:1},{name:'北京',adcode:'110000',visited:1,planned:0}]
 const styles=chinaFootprintStyles(cities)
 assert.equal(styles.fill({adcode:420100}),FOOTPRINT_COLORS.visited)
 assert.equal(styles.fill({adcode:'330100'}),FOOTPRINT_COLORS.planned)
 assert.equal(styles.fill({adcode:'320100'}),FOOTPRINT_COLORS.unvisited)
 assert.equal(styles.fill({adcode:'110100'}),FOOTPRINT_COLORS.visited)
 assert.equal(styles.fill({adcode:'110101',adcode_cit:'110100'}),FOOTPRINT_COLORS.visited)
 assert.equal(footprintRegionCity({adcode:'420106',adcode_cit:'420100'},cities).name,'武汉')
 assert.equal(cityCode('4201'),null);assert.equal(cityCode(null),null)
 // 仅按行政编码匹配，同名标签不会误染其他城市。
 assert.equal(styles.fill({NAME_CHN:'武汉',adcode:'320100'}),FOOTPRINT_COLORS.unvisited)
 const reset=chinaFootprintStyles(cities.map(c=>({...c,visited:0,planned:0})))
 assert.equal(reset.fill({adcode:'420100'}),FOOTPRINT_COLORS.unvisited)
})
test('中国行政层只请求中国市级边界，服务缺失不能冒充区域绘制成功', async () => {
 const { createChinaFootprintLayer }=await import('../src/map/chinaFootprints.js')
 const layer=createChinaFootprintLayer({DistrictLayer:{Country:class {constructor(options){this.options=options}}}},[])
 assert.equal(layer.options.SOC,'CHN');assert.equal(layer.options.depth,2)
 assert.throws(()=>createChinaFootprintLayer({},[]),/图层未加载/)
})
