import {test,expect} from '@playwright/test';
test('兼容旧文件记录、只加载当前病例、清理保留标记和结果、写入失败可恢复',async({page})=>{
 await page.goto('python-build.json');
 const result=await page.evaluate(async()=>{
  const s=await import(/* @vite-ignore */ new URL('browser-storage.mjs',location.href).href);
  const root='/car-data',tid='a'.repeat(40),run='b'.repeat(64),other='c'.repeat(40);
  const manifest={case:{caseid:251},tracks:{map:{tid}}};
  await s.writeFiles([[`${root}/cases/251/manifest.json`,s.encodeJSON(manifest)],[`${root}/cases/251/annotations.json`,s.encodeJSON({version:3,items:[{start:1,end:2}]})],[`${root}/tracks/${tid}/raw.csv`,new TextEncoder().encode('time,value\n0,70')],[`${root}/tracks/${other}/raw.csv`,new Uint8Array(2_000_000)],[`${root}/runs/${run}/result.json`,s.encodeJSON({manifest})]]);
  // Minimal MEMFS substitute verifies selection without instantiating the Python runtime.
  const files=new Map<string,Uint8Array>(),times=new Map<string,number>();
  const FS={readdir:(path:string)=>['.','..',...new Set([...files.keys()].filter(p=>p.startsWith(path+'/')).map(p=>p.slice(path.length+1).split('/')[0]))],isDir:(mode:number)=>mode===1,stat:(p:string)=>({mode:files.has(p)?0:1,mtime:new Date(times.get(p)??0),size:files.get(p)?.length??0}),mkdirTree:()=>{},writeFile:(p:string,b:Uint8Array)=>{files.set(p,b);times.set(p,Date.now());},readFile:(p:string)=>files.get(p)!,unlink:(p:string)=>files.delete(p),utime:(p:string,_a:number,m:number)=>times.set(p,m)};
  const w=new s.WorkingFiles({FS});await w.prepare({path:'/cases/251/signals'}, {cases:[]});const selected=[...files.keys()];
  await w.prepare({path:`/analyses/${run}/export`},{cases:[]});const exportFiles=[...files.keys()];
  await s.clearCaseDownloads(251);const afterClear=await s.fileKeys();
  // An aborted transaction must leave the existing annotation intact; keep unsaved bytes in memory.
  const db=await s.openDatabase(),native=db.transaction.bind(db);db.transaction=((...args:any[])=>{const tx=native(...args);if(args[1]==='readwrite')queueMicrotask(()=>tx.abort());return tx;}) as any;
  const warnings:string[]=[];w.onWarning=(v:string)=>warnings.push(v);
  const path=`${root}/cases/251/annotations.json`;FS.writeFile(path,s.encodeJSON({version:4,items:[]}));await w.commit();const duringFailure=await s.readJSON(path);const retained=w.overlay.has(path);
  db.transaction=native;await w.commit();const recovered=await s.readJSON(path);
  return {selected,exportFiles,afterClear,duringFailure,retained,recovered,warnings};
 });
 expect(result.selected.some((p:string)=>p.includes('a'.repeat(40)))).toBe(true);expect(result.selected.some((p:string)=>p.includes('c'.repeat(40))||p.includes('/runs/'))).toBe(false);
 expect(result.exportFiles.some((p:string)=>p.includes('/tracks/'))).toBe(false);
 expect(result.afterClear).toContain('/car-data/cases/251/annotations.json');expect(result.afterClear).toContain(`/car-data/runs/${'b'.repeat(64)}/result.json`);expect(result.afterClear).toContain(`/car-data/tracks/${'c'.repeat(40)}/raw.csv`);expect(result.afterClear).not.toContain('/car-data/cases/251/manifest.json');
 expect(result.duringFailure.version).toBe(3);expect(result.retained).toBe(true);expect(result.warnings.length).toBeGreaterThan(0);expect(result.recovered.version).toBe(4);
});
