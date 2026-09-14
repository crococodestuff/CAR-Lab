// Compatible with existing Emscripten IDBFS data; reads individual files, not the whole store.
const ROOT='/car-data',STORE='FILE_DATA';
let database;
const encoder=new TextEncoder(),decoder=new TextDecoder();
export const encodeJSON=value=>encoder.encode(JSON.stringify(value));
export const decodeJSON=bytes=>JSON.parse(decoder.decode(bytes));
export function openDatabase(){
 return database??=new Promise((resolve,reject)=>{
  const request=indexedDB.open(ROOT,21);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE)){const store=request.result.createObjectStore(STORE);store.createIndex('timestamp','timestamp',{unique:false});}};
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();database=undefined;};resolve(db);};
  request.onerror=()=>{database=undefined;reject(new Error('无法访问网站存储；可使用临时计算模式。'));};
  request.onblocked=()=>{database=undefined;reject(new Error('网站存储被其他标签页占用，请关闭其他 CAR Lab 页面。'));};
 });
}
async function readRequest(action){const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),r=action(tx.objectStore(STORE));r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function fileKeys(){return readRequest(store=>store.getAllKeys());}
export async function readFile(path){const entry=await readRequest(store=>store.get(path));return entry?.contents?new Uint8Array(entry.contents):null;}
export async function writeFiles(files){
 if(!files.length)return;for(const [path] of files)if(!path.startsWith(ROOT+'/')||path.includes('/../'))throw new Error('无效缓存路径');const db=await openDatabase();
 return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
  for(const [path,contents] of files)store.put({timestamp:new Date(),mode:33206,contents},path);
  tx.oncomplete=resolve;tx.onabort=()=>reject(new Error('网站空间不足或缓存写入失败；请导出结果或清理原始下载。'));tx.onerror=()=>{};
 });
}
export async function readJSON(path){const bytes=await readFile(path);return bytes?decodeJSON(bytes):null;}
export async function downloadCatalog(base){
 const response=await fetch(new URL('catalog.json',base),{cache:'no-cache'});
 if(!response.ok)throw new Error('公开病例目录加载失败，请检查网络后重试。');
 const data=await response.json();
 if(!Array.isArray(data.cases)||!data.cases.every(c=>Number.isInteger(c.caseid)&&c.tracks?.map&&(c.tracks.left||c.tracks.right)))throw new Error('公开目录格式无效');
 return data;
}
export async function storageOverview(){
 const keys=await fileKeys(),cases=[];
 for(const key of keys.filter(k=>/^\/car-data\/cases\/\d+\/manifest\.json$/.test(k))){const manifest=await readJSON(key);if(manifest)cases.push({caseid:manifest.case.caseid,channels:Object.keys(manifest.tracks).length});}
 const estimate=await navigator.storage?.estimate?.().catch(()=>null);
 return {usage:estimate?.usage??null,quota:estimate?.quota??null,cases,runs:keys.filter(k=>/^\/car-data\/runs\/[a-f0-9]+\/result\.json$/.test(k)).length};
}
export async function clearCaseDownloads(caseid){
 if(!Number.isInteger(caseid)||caseid<1)throw new Error('无效病例号');
 const path=`${ROOT}/cases/${caseid}/manifest.json`,manifest=await readJSON(path);if(!manifest)return;
 const paths=[path];for(const meta of Object.values(manifest.tracks)){if(!/^[a-fA-F0-9]{40,64}$/.test(meta.tid))throw new Error('缓存轨道 ID 无效');paths.push(`${ROOT}/tracks/${meta.tid}/raw.csv`,`${ROOT}/tracks/${meta.tid}/manifest.json`);}
 const db=await openDatabase();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');for(const p of paths)tx.objectStore(STORE).delete(p);tx.oncomplete=resolve;tx.onabort=()=>reject(new Error('清理下载失败'));});
}

export class WorkingFiles {
 constructor(py,{temporary=false,onWarning=()=>{}}={}){this.py=py;this.temporary=temporary;this.onWarning=onWarning;this.overlay=new Map();this.baseline=new Map();}
 async get(path){return this.overlay.get(path)??await readFile(path).catch(error=>{this.onWarning(error.message);return null;});}
 async json(path){const bytes=await this.get(path);return bytes?decodeJSON(bytes):null;}
 files(path=ROOT){const fs=this.py.FS,out=[];for(const name of fs.readdir(path)){if(name==='.'||name==='..')continue;const p=path+'/'+name;fs.isDir(fs.stat(p).mode)?out.push(...this.files(p)):out.push(p);}return out;}
 async prepare(request,catalog){
  const fs=this.py.FS,needed=new Set(),url=new URL(request.path,'https://local.invalid');
  const addRun=async id=>{if(!/^[a-f0-9]{64}$/.test(id))return null;const p=`${ROOT}/runs/${id}/result.json`;needed.add(p);const run=await this.json(p);if(url.pathname.endsWith('/export')||url.pathname.endsWith('/map-quality'))needed.add(`${ROOT}/runs/${id}/map_quality.csv`);return run;};
  let cid=request.body?.caseid,manifest=null;
  const caseMatch=url.pathname.match(/^\/cases\/(\d+)/);if(caseMatch)cid=+caseMatch[1];
  const runMatch=url.pathname.match(/^\/analyses\/([a-f0-9]{64})/);
  if(runMatch){const run=await addRun(runMatch[1]);cid=run?.manifest?.case?.caseid;manifest=run?.manifest;
   const other=url.pathname.match(/\/compare\/([a-f0-9]{64})$/);if(other)await addRun(other[1]);}
  if(Number.isInteger(cid)){
   for(const name of ['manifest.json','annotations.json','quality.json'])needed.add(`${ROOT}/cases/${cid}/${name}`);
   manifest??=await this.json(`${ROOT}/cases/${cid}/manifest.json`);
  }
  const needTracks=url.pathname==='/analyses'||/\/(signals|blocks|quality-preview|download)(\/|$)/.test(url.pathname);
  if(needTracks&&manifest?.tracks&&!manifest.generator)for(const meta of Object.values(manifest.tracks))if(/^[a-fA-F0-9]{40,64}$/.test(meta.tid))for(const name of ['raw.csv','manifest.json'])needed.add(`${ROOT}/tracks/${meta.tid}/${name}`);
  // Eviction affects only the worker's in-memory working set, never saved IndexedDB records.
  for(const path of this.files())if(!needed.has(path)&&!path.endsWith('/catalog/current.json'))fs.unlink(path);
  for(const path of needed){const bytes=await this.get(path);if(bytes){fs.mkdirTree(path.slice(0,path.lastIndexOf('/')));fs.writeFile(path,bytes);}}
  fs.mkdirTree(ROOT+'/catalog');fs.writeFile(ROOT+'/catalog/current.json',encodeJSON(catalog));
  for(const path of this.files())fs.utime(path,1,1);
  this.baseline=new Map(this.files().map(path=>[path,{mtime:fs.stat(path).mtime.getTime(),size:fs.stat(path).size}]));
 }
 async commit(){
  const fs=this.py.FS;
  for(const path of this.files()){const old=this.baseline.get(path),stat=fs.stat(path);if(!old||old.mtime!==stat.mtime.getTime()||old.size!==stat.size)this.overlay.set(path,fs.readFile(path).slice());}
  if(this.temporary){if(this.overlay.size)this.onWarning('临时模式：数据只保留在当前页面，关闭前请导出结果。');return;}
  try{await writeFiles([...this.overlay]);this.overlay.clear();}catch(error){this.onWarning(error.message+' 本次结果暂留当前页面，关闭前请导出。');}
 }
}
