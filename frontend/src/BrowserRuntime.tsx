import {useState} from 'react';
import {api,post} from './api';
type StorageInfo={usage:number|null;quota:number|null;cases:{caseid:number;channels:number}[];runs:number;temporary:boolean};
const mb=(n:number|null)=>n===null?'浏览器未提供':`${(n/1048576).toFixed(1)} MB`;
export function BrowserRuntime({status,busy,onRefresh}:{status:string;busy:boolean;onRefresh:()=>Promise<void>}){
 const [info,setInfo]=useState<StorageInfo|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false),[confirm,setConfirm]=useState<number|null>(null),[temporary,setTemporary]=useState(false);
 async function action(fn:()=>Promise<void>){setPending(true);setError('');try{await fn();}catch(e){setError((e as Error).message);}finally{setPending(false);}}
 const refresh=async()=>{const value=await api<StorageInfo>('/storage');setInfo(value);setTemporary(value.temporary);};
 return <section className="browser-runtime"><strong role="status">浏览器计算版 · {status}</strong><span>浏览目录无需加载计算环境；分析时按需下载。数据仅留在此浏览器，不跨设备同步。首次计算需联网，建议保持页面在前台。</span>
 <details onToggle={e=>{if(e.currentTarget.open)void action(refresh);}}><summary>计算环境与缓存管理</summary>
 <p>只读取当前病例所需文件，不将整库历史数据载入内存。浏览器仍需下载 Python 与 NumPy / pandas；普通网页缓存可加速再次打开。</p>
 <div className="runtime-actions"><button className="outline" disabled={busy||pending} onClick={()=>void action(async()=>{await post('/runtime/restart',{temporary});})}>重启计算环境</button><label><input type="checkbox" checked={temporary} disabled={busy||pending} onChange={e=>{const next=e.target.checked;void action(async()=>{const result=await post<{temporary:boolean}>('/runtime/restart',{temporary:next});setTemporary(result.temporary);await refresh();});}}/>临时模式（切换会释放计算环境）</label><button disabled={busy||pending} onClick={()=>void action(async()=>{await onRefresh();await refresh();})}>重试读取目录与缓存</button></div>
 <p>临时模式不保存新下载、标记或分析；重启、切换模式或关闭页面前请导出报告。已保存的内容不会被这些操作删除。</p>
 {info&&<><p>站点存储占用 {mb(info.usage)} · 配额 {mb(info.quota)} · {info.cases.length} 个缓存病例 · {info.runs} 次保存的分析{info.temporary?' · 当前为临时模式':''}</p><p>清理仅删除所选病例的原始下载，保留标记与已保存结果；再查看原始记录需重新下载。配额不代表必须占用的空间。</p><div className="runtime-cases">{info.cases.map(c=><div key={c.caseid}><span>病例 #{c.caseid} · {c.channels} 通道</span>{confirm===c.caseid?<><button disabled={busy||pending} onClick={()=>void action(async()=>{await api(`/storage/cases/${c.caseid}`,{method:'DELETE'});setConfirm(null);await onRefresh();await refresh();})}>确认清理原始下载</button><button onClick={()=>setConfirm(null)}>取消</button></>:<button disabled={busy||pending} onClick={()=>setConfirm(c.caseid)}>清理原始下载</button>}</div>)}</div></>}
 {error&&<p role="alert">{error}</p>}</details></section>;
}
