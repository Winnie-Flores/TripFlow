import { useEffect, useRef } from 'react'
import { printableHtml, reportBody } from '../state/readableExport.js'
export default function ReadableExport({ report, onClose }){
 const ref=useRef(null)
 useEffect(()=>{ref.current.showModal()},[])
 const download=()=>{const url=URL.createObjectURL(new Blob([printableHtml(report)],{type:'text/html;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`TripFlow-行程-${report.start}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return <dialog ref={ref} className="print-dialog" aria-label="行程导出预览" onCancel={onClose}><div className="print-toolbar"><strong>行程快照 · 可离线阅读</strong><div><button onClick={download}>下载行程 HTML</button><button onClick={()=>window.print()}>打印 / 保存 PDF</button><button onClick={onClose}>关闭</button></div></div><article className="readable-report" dangerouslySetInnerHTML={{__html:reportBody(report)}} /></dialog>
}
