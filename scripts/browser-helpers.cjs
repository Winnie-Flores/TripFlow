// Existing functional regressions exercise the expanded editors. Layout checks separately verify collapsed defaults.
exports.expandEditorsForRegression = async function (page) {
  await page.evaluateOnNewDocument(() => {
    const expand = () => document.querySelectorAll('.visit-details,.route-disclosure').forEach(el => { if (!el.open) el.open = true })
    document.addEventListener('DOMContentLoaded', () => { expand(); new MutationObserver(expand).observe(document.body,{childList:true,subtree:true}) }, {once:true})
  })
}
