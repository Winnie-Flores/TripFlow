import { iconSvg } from '../map/placeStyle.js'
export default function PlaceIcon({ place }) {
  // SVG 只由本地固定路径构成，不插入服务返回的字符串。
  return <span className="place-icon" style={{ color: place.color }} dangerouslySetInnerHTML={{ __html: iconSvg(place) }} />
}
