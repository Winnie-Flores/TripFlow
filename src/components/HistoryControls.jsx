import { useEffect } from 'react'
import { useTripStore } from '../state/useTripStore.js'
import { tripStore } from '../state/tripStore.js'
export default function HistoryControls(){
 const undo=useTripStore(s=>s.undoCount),redo=useTripStore(s=>s.redoCount)
 useEffect(()=>{const handler=event=>{
  if(!((event.metaKey||event.ctrlKey)&&!event.altKey&&event.key.toLowerCase()==='z'))return
  if(event.target.closest?.('input,textarea,select,[contenteditable="true"],dialog'))return
  event.preventDefault();tripStore.getState()[event.shiftKey?'redo':'undo']()
 };window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[])
 return <div className="history-controls" aria-label="编辑历史"><button disabled={!undo} onClick={()=>tripStore.getState().undo()}>↶ 撤销{undo?` (${undo})`:''}</button><button disabled={!redo} onClick={()=>tripStore.getState().redo()}>↷ 重做{redo?` (${redo})`:''}</button><small>⌘ / Ctrl＋Z · Shift 重做 · 输入框保留原生撤销</small></div>
}
