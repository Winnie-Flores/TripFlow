# 来源与复用记录

查阅日期：2026-11-07。通过 GitHub API 读取当前 main 的提交与相关文件；未安装或运行三个完整参考项目。终端 git 访问先遇本地代理不可用，去除代理后 DNS 不可用；通过 GitHub 接口完成源码读取。下列 SHA 是本次读取的提交，不代表以后 main 不再变化。

## 决策概览

| 项目/模块 | 已查阅提交 | 许可证核对 | 采用方式 | 当前实际落地 |
| --- | --- | --- | --- | --- |
| liketrek/TREK：地图标记 → 每日行程 | `dc36c21c08f681fd2806764fad8e17b270f6f175` | 根 LICENSE 为 GNU AGPL v3；另查 NOTICE.md | 参考思路，自行实现高德 HTML 标记与原生拖放 | 阶段 1 已自行实现 DOM 来源与会话校验，未复制 TREK 代码 |
| mirrorxyjiang/travel-planner：高德搜索、分段路线 | `0a5df73de8cd393761c6fc1119d65317dadad731` | MIT，Copyright (c) 2026 Mirror xianyue jiang | 分段请求函数修改复用；搜索仍为后续候选 | 阶段 1 已修改复用 fetchLeg 至 src/map/requestLeg.js，保留完整 MIT 许可 |
| zh-lon/travel-planner：多天、dnd-kit | `ff7bac6dabe87df30f80fc00fa33aa9f6aa21508` | 递归文件树无 LICENSE/COPYING/NOTICE；package.json 无 license 字段，未发现明确授权 | 只参考思路，自行实现；不复制其组件 | 阶段 2 已自行实现多容器落点与预览，未复制该组件 |

阶段 0 没有直接复制三个仓库代码。阶段 1 已修改复用 MIT 的路线适配片段，见下文。继续复制 MIT 片段时必须在对应文件标注来源、修改范围，并保留完整 MIT 版权许可文本；不能将“可复用”记为“已复用”。不引入完整参考工程及其后端、UI 库、数据库。

## TREK：已阅读的相关源码

- [markerDrag.ts](https://github.com/liketrek/TREK/blob/dc36c21c08f681fd2806764fad8e17b270f6f175/client/src/components/Map/markerDrag.ts)：`startPlaceDrag`、`endPlaceDrag`、`makeMarkerDraggable`。DOM draggable、DataTransfer placeId、copy 语义、mousedown 阻止地图平移、dragend 清理及事件解绑。源码用 window 镜像支持 dragover 时读取标识。
- [DayPlanSidebar.tsx](https://github.com/liketrek/TREK/blob/dc36c21c08f681fd2806764fad8e17b270f6f175/client/src/components/Planner/DayPlanSidebar.tsx)：重点读 getDragData（约 332 行）、handleDropOnDay（约 1062 行）、日期头/空白处/卡片插入落点（约 1596–1948 行）。区分 placeId 新增与 assignmentId 移动。
- [LICENSE](https://github.com/liketrek/TREK/blob/dc36c21c08f681fd2806764fad8e17b270f6f175/LICENSE)、[NOTICE.md](https://github.com/liketrek/TREK/blob/dc36c21c08f681fd2806764fad8e17b270f6f175/NOTICE.md)。本项目只研究上述机制，不复制 AGPL 实现，不带入其地图引擎与数据集。
- TripFlow 的适配计划：使用模块内拖放会话与自定义 MIME 类型；地图拖放只提交 Place ID，创建 Visit；列表由 dnd-kit 处理原 Visit。不沿用全局业务状态和复杂预订/交通模型。

## mirrorxyjiang：可修改复用的部分

- [src/map.js](https://github.com/mirrorxyjiang/travel-planner/blob/0a5df73de8cd393761c6fc1119d65317dadad731/src/map.js)：已完整读相关文件。`searchTips` 用 AutoComplete；`resolveTip` 在缺坐标时 PlaceSearch；`fetchLeg` 对相邻两点调用 Driving/Walking 并从 steps 汇总路径；`route` 逐段绘制 Polyline、缓存与 token 校验；`sync` 延迟 400ms 重算。
- [package.json](https://github.com/mirrorxyjiang/travel-planner/blob/0a5df73de8cd393761c6fc1119d65317dadad731/package.json)、[LICENSE](https://github.com/mirrorxyjiang/travel-planner/blob/0a5df73de8cd393761c6fc1119d65317dadad731/LICENSE)。该项目用 Vite 5、SortableJS，不能原样当作本工程依赖配置。
- 必要改动：原源码拖地图 Marker 会改坐标，与本项目要求冲突，不采用。原 `resolveTip` 名称搜索取第一条易误选，优先按来源 ID 查详情并限制城市；旧结果需校验。原 token 在延迟后的 route 入口递增，防抖等待窗口可能接受旧结果，需在输入变化时立即失效。部分完成统计不算全程；不照搬 350ms 为平台保证配额。缓存策略后续按高德服务要求核对。

## zh-lon：多天与列表拖拽思路

- [src/components/ItineraryBoard.tsx](https://github.com/zh-lon/travel-planner/blob/ff7bac6dabe87df30f80fc00fa33aa9f6aa21508/src/components/ItineraryBoard.tsx)：重点读 buildColumns、碰撞检测、SortableItemCard、DayColumn、handleDragStart/Over/End/Cancel（约 612–708 行）。跨天预览 columns、快照签名、取消后从 items 恢复；空列作为容器落点。
- [package.json](https://github.com/zh-lon/travel-planner/blob/ff7bac6dabe87df30f80fc00fa33aa9f6aa21508/package.json)：dnd-kit core ^6.3.1、sortable ^10.0.0、utilities ^3.2.2；React 19、Next 15、TS、Ant Design、Prisma。本工程只选兼容的 dnd-kit 包，不引入其完整栈。
- 不采用 dayIndex + sortOrder 双字段排序；TripFlow 坚持 Day.visitIds 唯一顺序。拖动预览与状态提交分离，取消和无效落点不提交。

## 官方资料与本项目接入

- [高德 JS API 2.0 加载](https://lbs.amap.com/api/javascript-api-v2/guide/abc/load)：官方支持 npm loader，设置安全配置后调用 load；SDK 只在线加载，不本地打包 SDK。TripFlow 的 `src/map/loadMap.js` 按官方 API 自行编写。
- [安全密钥](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode)：先设置 `_AMapSecurityConfig`；本地课程开发使用 securityJsCode 明文方式。前端环境变量不保密；公开服务的代理方案不在当前无后端课程范围内。
- [准备](https://lbs.amap.com/api/javascript-api-v2/prerequisites)：申请平台为 Web端（JS API），同时获取 Key 与安全密钥。未验证当前账号授权、配额或域名配置。
- 依赖版本通过 npm 官方 registry 的对应版本元数据核对 engines、peerDependencies、license，而非从旧调研推定。`package.json` 固定直接依赖；`package-lock.json` 固定传递依赖。

## 依赖基线

React/React DOM 19.2.6；Vite 7.2.7；plugin-react 5.1.2；ESLint/@eslint/js 9.39.2；react-hooks 7.0.1；react-refresh 0.4.24；globals 16.5.0；Zustand 5.0.8；dnd-kit core 6.3.1 / sortable 10.0.0 / utilities 3.2.2；高德 loader 1.0.1。上述 npm 元数据声明 MIT。依赖内原版权许可文件保留在安装包；高德服务使用另受平台条款约束。

Vite 与 React 插件要求 Node ^20.19.0 或 >=22.12.0；工程选择 Node 22.12+（.nvmrc 指向 22，建议使用该线最新补丁）或 >=24。当前验证环境 Node 25.8.0 / npm 11.11.0。并未声称已在 Node 22 实机验证。

## 阶段 1 · 实际引用与地点数据（2026-11-07）

| 本项目文件 | 原来源 | 实际采用/修改 |
| --- | --- | --- |
| `src/map/requestLeg.js` | 上述 mirrorxyjiang 提交的 `src/map.js` / `fetchLeg`，MIT | 保留按 Walking/Driving 选择服务、search 回调解析 routes[0] 与 steps.path 的小段实现；注入 SDK/交通方式，增加 abort、12 秒超时、结果验证和 clear 清理。不传 map，避免 SDK 在旧请求返回时自动画图 |
| `licenses/mirrorxyjiang-MIT.txt` | 上述提交根 LICENSE | 完整保留版权及许可原文；适配代码头部标注提交与许可路径 |
| `src/map/routeController.js` | 自行实现 | 同步订阅 Zustand，状态变化立即使 generation 失效并清图，200ms 防抖，核对坐标签名后才绘制。不复制原 route 的缓存、固定等待或全局状态 |
| `src/map/placeMarker.js`、`src/drag/mapDrag.js` | TREK 仅参考交互机制 | 自行实现自定义 MIME + nonce 的一次性会话；mousedown/pointerdown 隔离与 map.dragEnable 锁定恢复；原生拖入仅提交 Place ID |
| `src/components/Itinerary.jsx` | dnd-kit npm 依赖（MIT）公开 API | 自行实现单日 SortableContext、鼠标/键盘排序、取消不提交；未复制 zh-lon 组件 |

### 两个武汉 POI

直接从高德地点页核对 ID、名称、地址与坐标；不混用 WGS-84 或百度坐标。网页按纬度、经度显示，本项目统一存 `[经度, 纬度]`，仅保存两条定位事实，不带入评价/照片或大规模数据集。此核验不是实际道路服务联调。

| 地点 | 来源 ID | 项目坐标（高德 GCJ-02） | 高德地点页 |
| --- | --- | --- | --- |
| 黄鹤楼 | B001B0I4K0 | [114.302467, 30.544649] | https://ditu.amap.com/place/B001B0I4K0 |
| 户部巷 | B0FFF5V6F4 | [114.298068, 30.547412] | https://ditu.amap.com/place/B0FFF5V6F4 |

### 本阶段官方 API 依据

- [高德自定义 Marker](https://lbs.amap.com/api/javascript-api-v2/guide/amap-marker/custom-marker)：content 支持 DOM，项目用固定坐标 Marker 承载原生可拖 DOM，SDK draggable=false。
- [JS API 2.0 手册](https://a.amap.com/jsapi/static/doc/index.html)：Map getStatus/setStatus/on/off/destroy、Marker、Polyline、Walking/Driving。
- [JS API 2.0 步行自绘路线示例](https://lbs.amap.com/demo/javascript-api-v2/example/walking-route/walk-custom)：从服务返回 steps.path 构造 Polyline，不自行用两点直线代替道路。

## 阶段 2 · 复用范围更新

没有新增复制第三方源码或依赖。继续使用原锁文件中的 dnd-kit / Zustand，沿用阶段 1 的 MIT 道路适配。日期运算、旅行设置、Visit 迁移预览和结构 revision 检查均自行实现于 `src/state/plan.js` / `tripStore.js`。

多容器实现只参考前述 zh-lon 模块的预览/提交分离思想；本项目采用插入指示与独立浮层，不复制其按 dayIndex/sortOrder 回写的方案。碰撞检测优先插入位、卡片、日期容器，指针必须在实际滚动区内；通过已安装包的 `core.cjs.development.js` pointerWithin 与 `sortable.cjs.development.js` sortableKeyboardCoordinates 核对公开 API 的数据结构，直接调用 npm 包函数，没有把包源码复制进项目。

## 阶段 3 · 官方道路与配额资料（2026-11-07）

- [高德 JS API 2.0 参考手册](https://a.amap.com/jsapi/static/doc/index.html)：Walking/Driving 的回调与 steps.path；继续沿用既有 MIT 修改适配，不新增第三方复制片段。
- [JS API 流量限制说明](https://lbs.amap.com/api/javascript-api-v2/flowlevel)：页面说明 QPS 应在控制台流量分析/配额管理查看。当前未登录账号、不推定具体 Key 权益；实现串行、1100ms 最小起点间隔、短时防抖和同批去重，不声称保证共享账号全局配额。
- 本阶段多天队列/部分统计/概览自行实现；服务道路仅保留当前计算批次及当前显示结果，不持久化或跨批建立道路缓存。


## 阶段 4 · 城市/搜索与精选 POI（2026-11-07）

搜索适配、查询代际控制、城市选择和 SVG 路径由本项目自行实现；本阶段未新增复制第三方代码。此前 mirrorxyjiang 的搜索源码仅作为思路线索，未直接复制其按名称取首条结果的 resolveTip。

- [输入提示与 POI 搜索（官方 JS API 2.0）](https://lbs.amap.com/api/javascript-api-v2/guide/services/autocomplete)：AutoComplete.search、限定城市、PlaceSearch.search/getDetails；缺坐标时仅按准确来源 ID 解析详情，不凭名称取第一条。
- [行政区查询（官方 JS API 2.0）](https://lbs.amap.com/api/javascript-api-v2/guide/services/district-search)：DistrictSearch；仅接受城市级和四个直辖市，保留 adcode 与中心点。
- [地图状态（官方）](https://lbs.amap.com/api/javascript-api-v2/guide/map/state)：setZoomAndCenter 的 immediately 参数；定位立即完成，避免过渡动画中命中其他标记。
- 搜索类共用串行队列，起点至少间隔 1100ms，输入防抖 450ms，无跨查询持久化服务结果缓存；实际账号 QPS/每日配额以平台控制台为准。

### 武汉 12 个精选地点

前两处沿用已核验地点页。新增十处从用户已配置的高德 JS API PlaceSearch 在线查询核对名称、地址、POI ID 和 GCJ-02 坐标，限定武汉；逐条检查返回候选后选择对应 POI，未把同名道路/公交站自动当景点。江汉路选择有具体交叉口地址的 B001B0J07F；黎黄陂路选择街头博物馆这一具体 POI。查询古琴台无结果不采用；古德寺返回名称含暂停开放，改选其他地点。以下只记录定位事实，不包含评价/照片或批量 POI 数据。

| 地点 | 高德来源 ID | GCJ-02 [经度, 纬度] | 核对入口 |
| --- | --- | --- | --- |
| 黄鹤楼 | B001B0I4K0 | [114.302467, 30.544649] | [地点页](https://ditu.amap.com/place/B001B0I4K0) |
| 户部巷 | B0FFF5V6F4 | [114.298068, 30.547412] | [地点页](https://ditu.amap.com/place/B0FFF5V6F4) |
| 武汉大学 | B001B0IZY1 | [114.364514, 30.536243] | [地点页](https://ditu.amap.com/place/B001B0IZY1) |
| 凌波门 | B0LAGRAG9F | [114.370732, 30.543449] | [地点页](https://ditu.amap.com/place/B0LAGRAG9F) |
| 湖北省博物馆 | B001B0JYXS | [114.365446, 30.561506] | [地点页](https://ditu.amap.com/place/B001B0JYXS) |
| 东湖听涛景区 | B001B1ASJQ | [114.376688, 30.564713] | [地点页](https://ditu.amap.com/place/B001B1ASJQ) |
| 汉口江滩 | B0FFGCIG85 | [114.319404, 30.610162] | [地点页](https://ditu.amap.com/place/B0FFGCIG85) |
| 江汉路步行街 | B001B0J07F | [114.288045, 30.58364] | [地点页](https://ditu.amap.com/place/B001B0J07F) |
| 晴川阁 | B001B0IZ9U | [114.284786, 30.555551] | [地点页](https://ditu.amap.com/place/B001B0IZ9U) |
| 黎黄陂路街头博物馆 | B001B0B59E | [114.302226, 30.586444] | [地点页](https://ditu.amap.com/place/B001B0B59E) |
| 昙华林 | B001B1H7IS | [114.308791, 30.55194] | [地点页](https://ditu.amap.com/place/B001B1H7IS) |
| 武汉长江大桥 | B001B0JP4S | [114.292874, 30.547225] | [地点页](https://ditu.amap.com/place/B001B0JP4S) |

分类 SVG（塔楼、餐饮、校园、博物馆、水岸、街区、公园、桥梁）以及五角星/圆形/菱形/爱心由本地固定路径绘制，无外部图标包与新增许可依赖；SVG 不包含搜索服务返回的文本。精选为地点定位清单，不提供开放/预约承诺，出行前仍以场馆公告为准。

## 景点与酒店迭代 · 新增地点来源（2026-11-08）

新增 24 处通过已配置的真实高德 JS API PlaceSearch 限定城市查询，人工核对精确返回项，保存定位字段；不保存搜索响应、评价、照片或道路服务缓存。地点名使用实际服务名称，避免把公交站或同名店铺当作景点。原武汉 12 处保留上表的原核验事实。龙井村本次未找到合适精确 POI，未加入；湖北美术馆返回暂停开放，替换为武汉美术馆（汉口馆）。不承诺营业、预约或出行资格。

| 城市 | 地点 | 高德来源 ID | GCJ-02 [经度, 纬度] | 核对入口 |
| --- | --- | --- | --- | --- |
| 武汉 | 武汉园博园 | B0FFG83RE8 | [114.218047, 30.623962] | [地点页](https://ditu.amap.com/place/B0FFG83RE8) |
| 武汉 | 武汉博物馆 | B001B065B6 | [114.256463, 30.611407] | [地点页](https://ditu.amap.com/place/B001B065B6) |
| 武汉 | 宝通禅寺 | B001B0K786 | [114.340959, 30.532157] | [地点页](https://ditu.amap.com/place/B001B0K786) |
| 武汉 | 武汉美术馆(汉口馆) | B001B0II9U | [114.293, 30.583931] | [地点页](https://ditu.amap.com/place/B001B0II9U) |
| 武汉 | 武汉欢乐谷 | B001B16KKA | [114.394011, 30.594312] | [地点页](https://ditu.amap.com/place/B001B16KKA) |
| 武汉 | 楚河汉街 | B0FFID01CO | [114.340697, 30.557103] | [地点页](https://ditu.amap.com/place/B0FFID01CO) |
| 武汉 | 东湖磨山景区 | B001B0J0B5 | [114.413148, 30.548737] | [地点页](https://ditu.amap.com/place/B001B0J0B5) |
| 武汉 | 海合安武汉极地海洋度假区 | B001B15T7P | [114.276769, 30.664028] | [地点页](https://ditu.amap.com/place/B001B15T7P) |
| 杭州 | 杭州西湖风景名胜区 | B023B13L9M | [120.121358, 30.222692] | [地点页](https://ditu.amap.com/place/B023B13L9M) |
| 杭州 | 杭州西湖风景名胜区-断桥残雪 | B023B01EE6 | [120.151347, 30.258151] | [地点页](https://ditu.amap.com/place/B023B01EE6) |
| 杭州 | 雷峰塔景区 | B023B09LKR | [120.148849, 30.230934] | [地点页](https://ditu.amap.com/place/B023B09LKR) |
| 杭州 | 灵隐寺 | B023B02842 | [120.101406, 30.240826] | [地点页](https://ditu.amap.com/place/B023B02842) |
| 杭州 | 西溪国家湿地公园 | B023B06P06 | [120.061159, 30.255079] | [地点页](https://ditu.amap.com/place/B023B06P06) |
| 杭州 | 河坊街景区 | B0FFF3DPR8 | [120.169895, 30.240584] | [地点页](https://ditu.amap.com/place/B0FFF3DPR8) |
| 杭州 | 南宋御街中山路步行街 | B023B14PP8 | [120.169526, 30.240249] | [地点页](https://ditu.amap.com/place/B023B14PP8) |
| 杭州 | 中国丝绸博物馆 | B023B09JLL | [120.151292, 30.22287] | [地点页](https://ditu.amap.com/place/B023B09JLL) |
| 杭州 | 浙江省博物馆(孤山馆区) | B023B06XVX | [120.143778, 30.251243] | [地点页](https://ditu.amap.com/place/B023B06XVX) |
| 杭州 | 杭州植物园 | B023B09LTB | [120.117009, 30.25291] | [地点页](https://ditu.amap.com/place/B023B09LTB) |
| 杭州 | 九溪烟树 | B0FFHMH4J8 | [120.11335, 30.202395] | [地点页](https://ditu.amap.com/place/B0FFHMH4J8) |
| 杭州 | 虎跑公园 | B023B08Q06 | [120.1299, 30.208087] | [地点页](https://ditu.amap.com/place/B023B08Q06) |
| 杭州 | 杭州西湖风景名胜区-湖滨公园 | B023B05MLT | [120.158818, 30.256583] | [地点页](https://ditu.amap.com/place/B023B05MLT) |
| 杭州 | 六和塔文化公园 | B023B08SQK | [120.131487, 30.196338] | [地点页](https://ditu.amap.com/place/B023B08SQK) |
| 杭州 | 城市阳台 | B023B1FB36 | [120.216803, 30.241827] | [地点页](https://ditu.amap.com/place/B023B1FB36) |
| 杭州 | 湘湖国家旅游度假区 | B023B07SNT | [120.217125, 30.13226] | [地点页](https://ditu.amap.com/place/B023B07SNT) |

酒店沿用[官方 PlaceSearch 说明](https://lbs.amap.com/api/javascript-api/reference/lnglat-to-address#placesearch)，按 type“住宿服务”与当前城市检索；自动提示缺坐标时依准确 POI ID 查详情，仍遵循串行队列及短时输入合并，不按名称合并不同地址。床形 SVG 由项目本地路径绘制，未增加图标依赖或复制第三方代码。酒店与重复游览功能自行实现。

## 逛吃与城市打卡地点补充（2026-11-08）

通过真实高德 PlaceSearch 限定城市查询，逐项选择对应商场/餐厅分店/街区，非停车场或管理机构。杭州大厦选同名购物城而非中央商城；武汉天地采用芦沟桥路28号的武汉新天地定位。古德寺仍返回暂停开放，未增加。仅核对定位，不承诺门店营业或推荐排名。

| 城市 | 地点 | 地址 | GCJ-02 | 来源 |
| --- | --- | --- | --- | --- |
| 杭州 | 杭州湖滨in77 | 延安路258号(龙翔桥地铁站C口步行200米) | [120.163749,30.25283] | [B0FFIMEKW0](https://ditu.amap.com/place/B0FFIMEKW0) |
| 杭州 | 杭州大厦购物城 | 杭州大厦(武林广场地铁站B口步行220米) | [120.161794,30.272797] | [B0G0DN5EN3](https://ditu.amap.com/place/B0G0DN5EN3) |
| 杭州 | 杭州万象城 | 富春路701号(江锦路地铁站B3口旁) | [120.215513,30.251753] | [B023B0A4ZD](https://ditu.amap.com/place/B023B0A4ZD) |
| 杭州 | 知味观(湖滨总店) | 仁和路83-1号(龙翔桥地铁站C口步行210米) | [120.163591,30.252629] | [B0FFH154X7](https://ditu.amap.com/place/B0FFH154X7) |
| 杭州 | 外婆家(湖滨店) | 平海路245号湖滨in77B区2楼(近音乐喷泉) | [120.16363,30.254309] | [B0FFILGZJR](https://ditu.amap.com/place/B0FFILGZJR) |
| 杭州 | 小河历史文化街区 | 小河直街51号 | [120.135337,30.308302] | [B0FFFWQ8DS](https://ditu.amap.com/place/B0FFFWQ8DS) |
| 杭州 | 拱宸桥西历史文化街区 | 桥西直街1号(拱宸桥西) | [120.137752,30.316781] | [B0FFFFZRBD](https://ditu.amap.com/place/B0FFFFZRBD) |
| 杭州 | 馒头山社区 | 上城区 | [120.168072,30.218267] | [B023B09LIH](https://ditu.amap.com/place/B023B09LIH) |
| 武汉 | 武汉新天地 | 芦沟桥路28号 | [114.311362,30.607643] | [B001B0IVZP](https://ditu.amap.com/place/B001B0IVZP) |
| 武汉 | 武汉万象城 | 建设大道668号 | [114.280583,30.599266] | [B0FFHFHITS](https://ditu.amap.com/place/B0FFHFHITS) |
| 武汉 | 武汉国际广场购物中心 | 解放大道690号(近中山公园地铁站) | [114.270356,30.580823] | [B0FFKP7WYS](https://ditu.amap.com/place/B0FFKP7WYS) |
| 武汉 | 老通城豆皮大王(吉庆街店) | 中山大道667号、669号吉庆民俗街一期1区1栋1层3商室1-114 | [114.293621,30.585488] | [B0FFHR1P6C](https://ditu.amap.com/place/B0FFHR1P6C) |
| 武汉 | 蔡林记(户部巷店) | 民主路69号附4号(司门口民主巷小区西门旁) | [114.297921,30.547035] | [B0K3B7Y32E](https://ditu.amap.com/place/B0K3B7Y32E) |

## 旅行足迹地图（2026-11-08）

继续使用已安装高德 JS API 2.0 Map、Marker、Scale、ToolBar、complete事件、setFitView、destroy API（官方手册链接见前文），只读取本地旅行中已确认的 cityInfo.center；不新增行政边界素材或复制地图数据。足迹展示为城市点标记，不填充行政区域、不伪造跨旅行交通路线。双色标记、折叠布局、状态聚合和 DOM/ResizeObserver 清理由项目自行实现；无新增依赖。

## 中国城市区域点亮与 Trek 参考（2026-11-10）

- 用户提供的 [Trek dashboard](https://demo.liketrek.com/dashboard)；实际进入无需注册演示并查看 [Atlas](https://demo.liketrek.com/atlas)，可见国家/区域/旅行/地点/城市/天数等统计。Atlas 地图在本次网络环境下持续加载，未宣称完整观察到其填色与点击交互；本项目具体的灰底/市域填色行为依据用户描述实现。未复制 Trek 源码、地图素材或边界数据。
- [高德 JS API 2.0 简易行政区图官方说明](https://lbs.amap.com/api/javascript-api-v2/guide/layers/districtlayer)：Country 的 SOC=CHN、depth=2 展示中国市级行政区；按行政编码映射 fill，国/省/市边线沿用官方图层。没有下载或持久化服务行政边界几何，图层按SDK在线加载。
- 城市状态聚合与行政代码映射由项目实现，直辖市统一映射省级编码；已去过优先绿色、仅规划橙色、其余灰色。城市名仅用作文字，不靠同名匹配边界；国家图层只显示中国。图下保留来源说明，官方Logo/审图文字和控件保持可见。
