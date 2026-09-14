import {test,expect} from '@playwright/test';

test('浏览器数值核验与缓存写入隔离',async({page,context})=>{
 // A JSON document allows testing the worker without starting the application's writer.
 await page.goto('python-build.json');
 const checks=await page.evaluate(async()=>{
  const worker=new Worker(new URL('python-worker.mjs',location.href),{type:'module'});
  const rpc=(path:string,method='GET',body?:unknown)=>new Promise<any>((resolve,reject)=>{
   const id=crypto.randomUUID();worker.onmessage=({data})=>{if(data.id===id)data.error?reject(new Error(data.error)):resolve(data.result);};worker.postMessage({id,request:{path,method,body}});
  });
  try{
   const run=await rpc('/analyses','POST',{synthetic:{scenario:'coupled',seed:42},config:{}});
   const result=await rpc('/analyses/'+run.run_id);
   const window=result.windows.find((w:any)=>w.cox!==null);
   const detail=await rpc(`/analyses/${run.run_id}/windows/${window.window_id}`);
   const pairs=detail.pairs.filter((p:any)=>p.valid),n=pairs.length;
   const mx=pairs.reduce((s:number,p:any)=>s+p.map,0)/n,my=pairs.reduce((s:number,p:any)=>s+p.rso2,0)/n;
   const reference=pairs.reduce((s:number,p:any)=>s+(p.map-mx)*(p.rso2-my),0)/Math.sqrt(pairs.reduce((s:number,p:any)=>s+(p.map-mx)**2,0)*pairs.reduce((s:number,p:any)=>s+(p.rso2-my)**2,0));
   const example=await rpc('/mapopt/example');
   return {difference:Math.abs(reference-detail.cox),example:example.results[0].fit.mapopt};
  }finally{worker.terminate();}
 });
 expect(checks.difference).toBeLessThan(1e-10);expect(checks.example).toBeCloseTo(50,9);
 await page.goto('./');await expect(page.locator('.browser-runtime')).toContainText('轻量浏览就绪',{timeout:180000});
 await page.getByRole('button',{name:'合成信号实验室'}).click();await page.getByRole('button',{name:'运行实验',exact:true}).click();await expect(page.getByRole('button',{name:'运行实验',exact:true})).toBeEnabled({timeout:180000});
 const other=await context.newPage();await other.goto('./');await other.getByRole('button',{name:'合成信号实验室'}).click();await other.getByRole('button',{name:'运行实验',exact:true}).click();
 await expect(other.getByRole('alert')).toContainText('另一个标签页');
 await page.close();await other.reload();
 await expect(other.locator('.browser-runtime')).toContainText('轻量浏览就绪',{timeout:180000});
 await expect(other.getByRole('alert')).toHaveCount(0);
});

test('浏览器内核、完整学习流程、导出与刷新恢复',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
 await page.goto('./');
 await expect(page.locator('.browser-runtime')).toContainText('轻量浏览就绪',{timeout:180000});
 await page.getByRole('button',{name:'合成信号实验室'}).click();
 await page.getByRole('button',{name:'运行实验',exact:true}).click();
 await expect(page.locator('.busy')).toHaveCount(0,{timeout:60000});
 await expect(page.getByRole('button',{name:'运行实验',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:/02 检查质量/}).click();
 await expect(page.getByTestId('raw-quality-overview')).toBeVisible();
 await expect(page.getByTestId('raw-window-highlight')).toBeEmpty();
 await page.getByRole('button',{name:/03 做时间平均/}).click();
 await page.getByRole('button',{name:/展开第/}).click();
 await expect(page.getByRole('heading',{name:/的全部输入观测/})).toBeVisible();
 await page.getByRole('button',{name:/04 看一个窗口/}).click();
 await expect(page.getByTestId('window-inspector')).toBeVisible();
 await expect(page.getByTestId('raw-window-highlight')).toContainText('浅色区域：当前查看的 COx 窗口');
 await page.getByRole('button',{name:/02 检查质量/}).click();
 await expect(page.getByTestId('raw-window-highlight')).toBeEmpty();
 await page.getByRole('button',{name:/07 寻找 MAPopt/}).click();
 await expect(page.getByLabel('MAPopt COx窗口')).toBeVisible({timeout:60000});
 await expect(page.getByLabel('MAPopt COx窗口').locator('option')).toHaveCount(8);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出学习报告'}).click();
 expect((await download).suggestedFilename()).toMatch(/^car-lab-.*\.zip$/);
 await page.reload();
 await page.getByRole('button',{name:'恢复上次分析'}).click();
 await expect(page.locator('.browser-runtime')).toContainText('计算内核就绪',{timeout:180000});
 await expect(page.getByLabel('MAPopt COx窗口')).toBeVisible({timeout:60000});
 await expect(page.getByRole('alert')).toHaveCount(0);
 expect(requests.filter(url=>url.includes('/api/'))).toEqual([]);
 expect(errors).toEqual([]);
 await page.screenshot({path:'../artifacts/pages-learning.png',fullPage:true});
});

test('读取公开 VitalDB 快照、缓存与人工标记',async({page})=>{
 await page.goto('./');
 await expect(page.locator('.browser-runtime')).toContainText('轻量浏览就绪',{timeout:180000});
 await page.getByRole('button',{name:'选择病例',exact:true}).click();
 await page.getByRole('button',{name:'更新病例目录'}).click();
 await expect(page.getByRole('button',{name:'选择病例 251',exact:true})).toBeVisible({timeout:120000});
 await page.getByRole('button',{name:'选择病例 251',exact:true}).click();
 await page.getByRole('button',{name:/^(下载并分析|分析本地数据)$/}).click();
 await expect(page.getByRole('button',{name:'重新计算',exact:true})).toBeEnabled({timeout:120000});
 await page.getByRole('button',{name:/02 检查质量/}).click();
 await page.locator('.quality-manual summary').click();
 await expect(page.getByTestId('clean-signal-card')).toBeVisible();
 await page.getByLabel('标记起点').fill('13.83');await page.getByLabel('标记终点').fill('16.44');
 await page.getByLabel('标记原因').fill('浏览器测试标记');await page.getByRole('button',{name:'添加排除',exact:true}).click();
 await expect(page.locator('.annotation-row').getByText('浏览器测试标记')).toBeVisible();
 await page.getByLabel('横轴时间显示').selectOption('elapsed');
 await expect(page.locator('.annotation-row')).toContainText('00:13:49.8–00:16:26.4');
 await expect(page.getByTestId('clean-signal-stale')).toBeVisible();
 await page.reload();
 await page.getByRole('button',{name:'恢复上次分析'}).click();
 await expect(page.getByRole('button',{name:'重新计算',exact:true})).toBeEnabled({timeout:180000});
 await page.locator('.quality-manual summary').click();
 await expect(page.locator('.annotation-row').getByText('浏览器测试标记')).toBeVisible();
 await expect(page.getByRole('alert')).toHaveCount(0);
});
