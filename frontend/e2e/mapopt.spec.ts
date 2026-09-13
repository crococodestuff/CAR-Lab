import {test,expect} from '@playwright/test';

test('第7步多窗口拟合、虚拟50mmHg示例与记录隔离',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByRole('button',{name:'合成信号实验室'}).click();
 await page.getByRole('button',{name:'运行实验',exact:true}).click();
 await expect(page.locator('.busy')).toHaveCount(0);
 await page.getByRole('button',{name:/06 做参数对比/}).click();
 const response=page.waitForResponse(r=>r.url().includes('/mapopt?method=windows')&&r.ok());
 await page.getByRole('button',{name:'下一步：寻找 MAPopt',exact:true}).click();
 const report=await(await response).json(),panel=page.getByTestId('mapopt-panel');
 await expect(page.getByRole('heading',{name:'按血压寻找 MAPopt',exact:true})).toBeVisible();
 await expect(panel.locator('.mapopt-results tbody tr')).toHaveCount(16);
 expect(report.results.map((r:any)=>r.window_seconds)).toEqual([180,180,300,300,600,600,1200,1200,1800,1800,3600,3600,5400,5400,7200,7200]);
 await expect(panel).toContainText('覆盖 0.50 h');
 let requests=0;page.on('request',r=>{if(r.url().includes('/mapopt'))requests++;});
 await panel.getByRole('button',{name:'查看MAPopt 10 分钟 · 右侧',exact:true}).click();
 await expect(panel.locator('.mapopt-chart-heading')).toContainText('10 分钟 · 右侧');expect(requests).toBe(0);
 const picker=panel.getByLabel('MAPopt COx窗口');
 expect(await picker.locator('option').allTextContents()).toEqual(['3 分钟','5 分钟','10 分钟','20 分钟','30 分钟','60 分钟','90 分钟','120 分钟']);
 for(const minutes of [3,5,10,20,30,60,90,120]){
  await picker.selectOption(String(minutes*60));
  await expect(panel.locator('.mapopt-chart-heading')).toContainText(`${minutes} 分钟 · 右侧`);
 }
 await expect(panel.getByTestId('mapopt-short-record')).toContainText('不足 120 分钟');
 await expect(panel.getByTestId('mapopt-verdict')).toContainText('无法给出有效 MAPopt');
 await panel.getByLabel('MAPopt脑氧侧别').selectOption('left');
 await expect(panel.locator('.mapopt-chart-heading')).toContainText('120 分钟 · 左侧');
 expect(requests).toBe(0);
 await panel.screenshot({path:'../artifacts/27-mapopt-window-options.png'});
 const binned=page.waitForResponse(r=>r.url().includes('/mapopt?method=bins')&&r.ok());
 await page.getByLabel('MAPopt拟合方式').selectOption('bins');
 const binsReport=await(await binned).json();expect(binsReport.results.every((r:any)=>r.fit_points===r.bins.length)).toBeTruthy();
 await expect(panel.getByText(/曲线拟合分箱均值，各非空箱等权/)).toBeVisible();
 await page.getByRole('button',{name:'查看虚拟公式示例'}).click();
 await expect(page.getByTestId('mapopt-verdict')).toContainText('MAPopt 估计：50.0 mmHg');
 await expect(panel.locator('.mapopt-demo')).toContainText('不来自当前病例');
 await expect(page.getByLabel('MAPopt拟合方式')).toBeDisabled();
 await expect(panel.locator('.mapopt-results tbody tr')).toHaveCount(1);
 await expect(panel.getByLabel('显示示意参考线')).toBeChecked();
 await expect(panel.locator('svg')).toContainText('示意参考 -0.30');
 await expect(panel.locator('svg')).toContainText('示意参考 0.30');
 const requestsBefore=requests;
 await panel.getByLabel('MAPopt参考线2').fill('-0.4');
 await expect(panel.locator('svg')).toContainText('示意参考 -0.40');
 await expect(page.getByTestId('mapopt-verdict')).toContainText('50.0 mmHg');
 expect(requests).toBe(requestsBefore);
 await panel.getByLabel('MAPopt参考线2').fill('-0.3');
 for(const width of [1440,1280]){
  await page.setViewportSize({width,height:1300});await page.waitForTimeout(200);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await panel.screenshot({path:`../artifacts/23-mapopt-formula-${width}.png`});
 }
 await page.getByRole('button',{name:'返回当前记录'}).click();
 await expect(panel.locator('.mapopt-demo')).toHaveCount(0);
 await expect(panel.locator('.mapopt-results tbody tr')).toHaveCount(16);
 await page.reload();await expect(page.getByTestId('mapopt-panel')).toBeVisible();
 await expect(page.locator('.mapopt-demo')).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('真实严格记录不足时不制造MAPopt，报告可下载',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'选择病例',exact:true}).click();
 await page.getByRole('button',{name:'选择病例 251',exact:true}).click();
 await page.getByRole('button',{name:'分析本地数据',exact:true}).click();await expect(page.locator('.busy')).toHaveCount(0);
 const response=page.waitForResponse(r=>r.url().includes('/mapopt?')&&r.ok());
 await page.getByRole('button',{name:/07 寻找 MAPopt/}).click();
 const report=await(await response).json();
 const current=report.results.find((r:any)=>r.window_seconds===300&&r.side==='left');
 expect(current.valid_outputs).toBe(0);expect(current.fit.mapopt).toBeNull();
 await expect(page.getByTestId('mapopt-verdict')).toContainText('无法给出有效 MAPopt');
 await expect(page.getByTestId('mapopt-panel')).toContainText('成人公开记录');
 const download=page.waitForEvent('download');await page.getByRole('link',{name:'下载拟合结果与全部输入点（JSON）'}).click();
 expect((await download).suggestedFilename()).toMatch(/^mapopt-.*\.json$/);
 await page.getByTestId('mapopt-panel').screenshot({path:'../artifacts/24-mapopt-real-insufficient.png'});
});
