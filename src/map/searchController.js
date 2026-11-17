// 输入、清空、切城、选择和卸载同步推进代际；旧 SDK 回调不发布结果或候选地点。
export function createSearchController({ search, resolve, onChange, onPlace, delayMs = 450 }) {
  let generation = 0, timer, abort, disposed = false, query = ''
  const invalidate = () => { ++generation; clearTimeout(timer); abort?.abort() }
  const start = () => { invalidate(); abort = new AbortController(); return { current: generation, signal: abort.signal } }
  const valid = (token) => !disposed && token.current === generation && !token.signal.aborted
  const run = async (token, full) => {
    try {
      const results = await search(query, token.signal, full)
      if (valid(token)) onChange({ status: 'ready', results })
    } catch (error) { if (valid(token)) onChange({ status: 'error', results: [], message: error.message }) }
  }
  return {
    query(value, full = false) {
      query = value.trim()
      const token = start()
      if (!query) { onChange({ status: 'idle', results: [] }); return }
      onChange({ status: 'loading', results: [] })
      if (full) void run(token, true)
      else timer = setTimeout(() => { void run(token, false) }, delayMs)
    },
    async select(item) {
      const token = start()
      onChange({ status: 'resolving', results: [] })
      try {
        const place = await resolve(item, token.signal)
        if (valid(token)) { onPlace(place); onChange({ status: 'ready', results: [], message: `已定位「${place.name}」，可从地图拖入行程。` }) }
      } catch (error) { if (valid(token)) onChange({ status: 'error', results: [], message: error.message }) }
    },
    destroy() { disposed = true; invalidate() },
  }
}
