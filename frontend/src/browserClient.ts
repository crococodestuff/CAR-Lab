type Request = {path:string;method:string;body?:unknown;temporary?:boolean};
type Pending = {resolve:(value:any)=>void;reject:(reason:Error)=>void;timer:ReturnType<typeof setTimeout>};
let worker:Worker|null=null,temporary=false;
const pending=new Map<string,Pending>();
const tasks=new Map<string,{task_id:string;status:string;error:string|null;result:any}>();
export let runtimeStatus='轻量浏览就绪 · 计算时才加载 Python';
function status(message:string){runtimeStatus=message;window.dispatchEvent(new CustomEvent('car-runtime',{detail:message}));}
function stop(message:string){worker?.terminate();worker=null;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error(message));}pending.clear();status(message);}
let storageModule:Promise<any>|undefined,catalogPromise:Promise<any>|undefined;
const storage=()=>storageModule??=import(/* @vite-ignore */ new URL('browser-storage.mjs',new URL(import.meta.env.BASE_URL,location.href)).href);
function catalog(refresh=false):Promise<any>{
 if(refresh)catalogPromise=undefined;
 return catalogPromise??=(async()=>{const s=await storage();const saved=!refresh&&await s.readJSON('/car-data/catalog/current.json').catch(()=>null);const c=(saved?.public_track_files?saved:null)||await s.downloadCatalog(new URL(import.meta.env.BASE_URL,location.href));
  if(refresh&&!temporary)await s.writeFiles([['/car-data/catalog/current.json',s.encodeJSON(c)]]).catch((e:Error)=>status(e.message));return c;
 })().catch(e=>{catalogPromise=undefined;throw e;});
}
async function rpc(request:Request):Promise<any>{
 const publicCatalog=await catalog();
 if(!worker){
  worker=new Worker(new URL('python-worker.mjs',new URL(import.meta.env.BASE_URL,location.href)),{type:'module'});
  worker.onmessage=({data})=>{if(data.progress){status(data.progress);return;}const p=pending.get(data.id);if(!p)return;pending.delete(data.id);clearTimeout(p.timer);if(data.error){p.reject(new Error(data.error));if(data.fatal)stop(data.error);}else p.resolve(data.result);};
  worker.onerror=()=>stop('浏览器计算环境加载失败，请检查网络后重启计算环境');
 }
 const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>stop('等待计算或网络响应超时；可重启计算环境后重试'),240000);pending.set(id,{resolve,reject,timer});worker!.postMessage({id,request:{...request,temporary},catalog:publicCatalog});});
}
// One persistent writer per browser tab; read-only catalog browsing does not need a lock.
let ownership:Promise<void>|undefined;
function ownStorage():Promise<void>{return ownership??=new Promise<void>((resolve,reject)=>{
 if(!navigator.locks){temporary=true;status('此浏览器使用临时模式：关闭页面前请导出结果');resolve();return;}
 void navigator.locks.request('car-lab-python-cache-v1',{ifAvailable:true},async lock=>{
  if(!lock){reject(new Error('另一个标签页正在使用 CAR Lab；请关闭它后重试'));return;}
  resolve();await new Promise(()=>{});
 }).catch(reject);
}).catch(error=>{ownership=undefined;throw error;});}
export async function browserApi(path:string,options:RequestInit={}){
 const taskMatch=path.match(/^\/tasks\/([^/]+)$/);
 if(taskMatch){
  const task=tasks.get(taskMatch[1]);if(!task)throw new Error('任务不存在');
  if(options.method==='DELETE'&&(task.status==='running'||task.status==='queued')){stop('任务已取消；下次操作将重新加载内核');for(const t of tasks.values())if(t.status==='running'){t.status='cancelled';t.error='任务已取消';}}
  return {...task};
 }
 const request={path,method:options.method||'GET',body:typeof options.body==='string'?JSON.parse(options.body):undefined};
 if(request.method==='GET'){
  if(path==='/cases'||path==='/catalog'){
   const [s,c]=await Promise.all([storage(),catalog()]);if(path==='/catalog'){const {cases,...meta}=c;return meta;}
   const keys=new Set(await s.fileKeys().catch(()=>[]));return Promise.all(c.cases.map(async(row:any)=>({...row,cached:keys.has(`/car-data/cases/${row.caseid}/manifest.json`),quality:await s.readJSON(`/car-data/cases/${row.caseid}/quality.json`).catch(()=>null)})));
  }
  if(/^\/cases\/\d+\/annotations$/.test(path)&&worker)return rpc(request);
  if(/^\/cases\/\d+\/annotations$/.test(path))return await(await storage()).readJSON('/car-data'+path+'.json').catch(()=>null)??{version:0,items:[]};
  if(path==='/storage')return {...await(await storage()).storageOverview(),temporary};
 }
 if(path==='/runtime/restart'&&request.method==='POST'){temporary=!!request.body?.temporary||!navigator.locks;stop(temporary?'临时模式：下次操作重新加载内核，关闭前请导出':'计算环境已释放；下次计算按需加载');return {temporary};}
 await ownStorage();
 if(path==='/catalog/refresh'&&request.method==='POST'){
  const c=await catalog(true);return {task_id:'catalog',status:'complete',error:null,result:c};
 }
 const clear=path.match(/^\/storage\/cases\/(\d+)$/);
 if(clear&&request.method==='DELETE'){stop('已释放计算环境；准备清理所选病例的原始下载');await(await storage()).clearCaseDownloads(+clear[1]);return {cleared:true};}
 if(request.method==='POST'&&(path==='/analyses'||/^\/cases\/\d+\/download/.test(path))){
  const task={task_id:crypto.randomUUID(),status:'running',error:null as string|null,result:null as any};tasks.set(task.task_id,task);
  void rpc(request).then(result=>{if(task.status==='running'){task.result=result;task.status='complete';}}).catch(error=>{if(task.status==='running'){task.error=error.message;task.status='failed';}});
  return {...task};
 }
 return rpc(request);
}
