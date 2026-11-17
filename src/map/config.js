export function readMapConfig(env = {}) {
  const key = typeof env.VITE_AMAP_KEY === 'string' ? env.VITE_AMAP_KEY.trim() : ''
  const securityJsCode = typeof env.VITE_AMAP_SECURITY_JS_CODE === 'string'
    ? env.VITE_AMAP_SECURITY_JS_CODE.trim() : ''
  const missing = []
  if (!key) missing.push('VITE_AMAP_KEY')
  if (!securityJsCode) missing.push('VITE_AMAP_SECURITY_JS_CODE')
  return { key, securityJsCode, missing, configured: missing.length === 0 }
}
