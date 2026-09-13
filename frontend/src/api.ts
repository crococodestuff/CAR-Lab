export const BROWSER_MODE=import.meta.env.MODE==='pages';
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
  if(BROWSER_MODE)return (await import('./browserClient')).browserApi(path,options);
  const r=await fetch('/api'+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
  if(!r.ok){const e=await r.json().catch(()=>({detail:r.statusText}));throw new Error(typeof e.detail==='string'?e.detail:JSON.stringify(e.detail));}
  return r.json();
}
export const post=<T,>(path:string,body?:unknown)=>api<T>(path,{method:'POST',body:body===undefined?undefined:JSON.stringify(body)});
export interface Task {task_id:string;status:string;error:string|null;result:any;}
export async function downloadApi(path:string){
 if(!BROWSER_MODE){window.location.href='/api'+path;return;}
 const data=await api<any>(path);
 const blob=data.base64?new Blob([Uint8Array.from(atob(data.base64),c=>c.charCodeAt(0))],{type:data.mime}):new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=data.filename||`mapopt-${data.report_id?.slice(0,12)||'report'}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
