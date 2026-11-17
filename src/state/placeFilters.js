export const CATEGORY_LABELS={all:'全部地点',sights:'景点与街区',food:'餐厅美食',shopping:'商场购物',hotel:'酒店住宿'}
export function matchesPlace(place,filter={category:'all'},arranged=new Set()){
 const categoryMatches=filter.category==='all'||(filter.category==='sights'?!['food','shopping','hotel'].includes(place.category):place.category===filter.category)
 return categoryMatches&&(!filter.favoriteOnly||!!place.favorite)&&(!filter.arrangedOnly||arranged.has(place.id))
}
export function arrangedIds(state){return new Set([...Object.values(state.visits).map(v=>v.placeId),...state.days.flatMap(d=>[d.startHotelId,d.endHotelId]).filter(Boolean)])}
