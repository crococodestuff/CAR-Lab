type Request = {path:string;method:string;body?:unknown};
type Pending = {resolve:(value:any)=>void;reject:(reason:Error)=>void};
let worker:Worker|null=null;
const pending=new Map<string,Pending>();
const tasks=new Map<string,{task_id:string;status:string;error:string|null;result:any}>();
export let runtimeStatus='准备浏览器计算环境';
function status(message:string){runtimeStatus=message;window.dispatchEvent(new CustomEvent('car-runtime',{detail:message}));}
function stop(message:string){worker?.terminate();worker=null;for(const p of pending.values())p.reject(new Error(message));pending.clear();status(message);}
function rpc(request:Request):Promise<any>{
 if(!worker){
  worker=new Worker(new URL('python-worker.mjs',new URL(import.meta.env.BASE_URL,location.href)),{type:'module'});
  worker.onmessage=({data})=>{if(data.progress){status(data.progress);return;}const p=pending.get(data.id);if(!p)return;pending.delete(data.id);if(data.error)p.reject(new Error(data.error));else p.resolve(data.result);};
  worker.onerror=()=>stop('浏览器计算环境加载失败，请检查网络后重试');
 }
 const id=crypto.randomUUID();return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker!.postMessage({id,request});});
}
// Hold one Web Lock for this tab's worker lifetime. Prevents two tabs overwriting IDBFS snapshots.
let ownership:Promise<void>|undefined;
function ownStorage(){return ownership??=new Promise<void>((resolve,reject)=>{
 if(!navigator.locks){reject(new Error('浏览器不支持安全缓存锁，请使用新版 Chrome、Edge、Firefox 或 Safari'));return;}
 void navigator.locks.request('car-lab-python-cache-v1',{ifAvailable:true},async lock=>{
  if(!lock){reject(new Error('另一个标签页正在使用 CAR Lab；请关闭它后刷新此页'));return;}
  resolve();await new Promise(()=>{});
 }).catch(reject);
});}
export async function browserApi(path:string,options:RequestInit={}){
 const taskMatch=path.match(/^\/tasks\/([^/]+)$/);
 if(taskMatch){
  const task=tasks.get(taskMatch[1]);if(!task)throw new Error('任务不存在');
  if(options.method==='DELETE'&&(task.status==='running'||task.status==='queued')){stop('任务已取消；下次操作将重新加载内核');for(const t of tasks.values())if(t.status==='running'){t.status='cancelled';t.error='任务已取消';}}
  return {...task};
 }
 await ownStorage();
 const request={path,method:options.method||'GET',body:typeof options.body==='string'?JSON.parse(options.body):undefined};
 if(request.method==='POST'&&(path==='/catalog/refresh'||path==='/analyses'||/^\/cases\/\d+\/download/.test(path))){
  const task={task_id:crypto.randomUUID(),status:'running',error:null as string|null,result:null as any};tasks.set(task.task_id,task);
  void rpc(request).then(result=>{if(task.status==='running'){task.result=result;task.status='complete';}}).catch(error=>{if(task.status==='running'){task.error=error.message;task.status='failed';}});
  return {...task};
 }
 return rpc(request);
}
