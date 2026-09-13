import {test,expect,type Locator} from '@playwright/test';

const rawSeconds=async(button:Locator)=>Number((await button.getAttribute('title'))!.match(/^原始时间：(.*) 秒$/)![1]);
const clock=(seconds:number)=>(seconds<0?'-':'')+new Date(Math.round(Math.abs(seconds))*1000).toISOString().slice(11,19);

test('右侧完整原始表、通道分页和图表范围联动',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const requests:string[]=[];page.on('request',r=>{if(r.url().includes('/signals?full=true'))requests.push(r.url());});
 await page.goto('/');await page.getByRole('button',{name:'选择病例',exact:true}).click();
 await page.getByRole('button',{name:'选择病例 251',exact:true}).click();
 const response=page.waitForResponse(r=>r.url().endsWith('/signals?full=true')&&r.ok());
 const runResponse=page.waitForResponse(r=>/\/api\/analyses\/[a-f0-9]{64}$/.test(r.url())&&r.ok());
 await page.getByRole('button',{name:'分析本地数据',exact:true}).click();
 const payload=await(await response).json(),run=await(await runResponse).json();
 const panel=page.getByTestId('raw-data-panel');
 await expect(panel.getByRole('button',{name:'原始表下一页',exact:true})).toBeEnabled();
 const left=payload.signals.left.filter((p:any)=>p.flags!=='record_gap');
 await page.getByLabel('原始表通道').selectOption('left');
 await expect(panel).toContainText(`共 ${left.length.toLocaleString()} 条`);
 const first=panel.locator('tbody tr').first();
 await expect(first.locator('button')).toHaveText(String(Number((left[0].time/60).toFixed(2))));
 await expect(panel.locator('th').first()).toHaveText('记录时间 / min');
 await page.getByLabel('横轴时间显示').selectOption('surgery');
 await expect(first.locator('button')).toHaveText(clock(left[0].time-run.manifest.case.opstart));
 await expect(first.locator('button')).toHaveText(/^-/);
 await expect(panel.locator('th').first()).toHaveText('手术相对 / 时:分:秒');
 expect(await rawSeconds(first.locator('button'))).toBe(left[0].time);
 await page.getByLabel('横轴时间显示').selectOption('minutes');
 expect(parseFloat(await first.locator('td').nth(2).innerText())).toBe(left[0].value);
 await panel.getByRole('button',{name:'原始表下一页',exact:true}).click();
 expect(await rawSeconds(first.locator('button'))).toBe(left[50].time);
 await first.locator('button').click();
 await expect(page.locator('.raw-point-caption')).toContainText(`${left[50].time} 秒`);
 await expect(first).toHaveClass('raw-row-selected');
 await page.getByLabel('原始表通道').selectOption('right');
 await expect(page.getByLabel('原始表通道')).toHaveValue('right');
 await expect(first.locator('td').nth(1)).toHaveText('右脑氧');
 await page.getByRole('button',{name:/02 检查质量/}).click();
 const quality=page.getByTestId('quality-review').getByRole('img',{name:'质量时间带：点击一个色块查看该通道在这段时间的质量原因',exact:true});
 await quality.scrollIntoViewIfNeeded();const size=(await quality.boundingBox())!;
 await quality.click({position:{x:75+.4*(size.width-103),y:20+125/6}});
 const selection=page.getByTestId('quality-selection');await expect(selection).toBeVisible();
 const [start,end]=(await selection.locator('h3').innerText()).match(/(\d+)–(\d+) 秒/)!.slice(1).map(Number);
 await page.getByLabel('原始表通道').selectOption('all');
 const expected=Object.entries(payload.signals).flatMap(([channel,points]:[string,any])=>points.filter((p:any)=>p.flags!=='record_gap'&&p.time>=Math.max(0,start-60)&&p.time<=end+60).map((p:any)=>({...p,channel}))).sort((a,b)=>a.time-b.time||a.channel.localeCompare(b.channel));
 await expect(panel).toContainText(`共 ${expected.length.toLocaleString()} 条`);
 const times=await panel.locator('tbody .raw-time-button').allTextContents();
 expect(times).toEqual(expected.slice(0,50).map(p=>String(Number((p.time/60).toFixed(2)))));
 const viewBefore=await page.locator('.signal-card .chart-visible-range').innerText();
 await first.locator('button').click();
 await expect(page.locator('.signal-card .chart-visible-range')).toHaveText(viewBefore);
 await page.getByLabel('横轴时间显示').selectOption('elapsed');
 await expect(first.locator('.raw-time-button')).toHaveText(clock(expected[0].time));
 await expect(panel.locator('th').first()).toHaveText('记录经过 / 时:分:秒');
 await page.getByLabel('横轴时间显示').selectOption('surgery');
 await expect(first.locator('.raw-time-button')).toHaveText(clock(expected[0].time-run.manifest.case.opstart));
 await first.locator('button').click();
 await expect(page.locator('.raw-point-caption')).toContainText(`${expected[0].time} 秒`);
 expect(await rawSeconds(first.locator('button'))).toBe(expected[0].time);
 expect(requests).toHaveLength(1); // Zoom, paging and selection reuse the complete local view.
 await page.mouse.move(0,0);
 for(const width of [1440,1280]){
  await page.setViewportSize({width,height:1100});await page.waitForTimeout(200);
  const box=(await panel.boundingBox())!,plot=(await page.locator('.raw-plot-pane').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(plot.x+plot.width);
  expect((await first.boundingBox())!.height).toBeLessThanOrEqual(28);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.locator('.signal-card').screenshot({path:`../artifacts/17-raw-table-surgery-${width}.png`});
 }
 expect(errors).toEqual([]);
});

test('图上悬停自动翻页并显示原始观测，保持缩放和点击定位',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 let fullRequests=0;page.on('request',r=>{if(r.url().endsWith('/signals?full=true'))fullRequests++;});
 await page.goto('/');await page.getByRole('button',{name:'选择病例',exact:true}).click();
 await page.getByRole('button',{name:'选择病例 251',exact:true}).click();
 const fullResponse=page.waitForResponse(r=>r.url().endsWith('/signals?full=true')&&r.ok());
 const runResponse=page.waitForResponse(r=>/\/api\/analyses\/[a-f0-9]{64}$/.test(r.url())&&r.ok());
 await page.getByRole('button',{name:'分析本地数据',exact:true}).click();
 const full=await(await fullResponse).json(),run=await(await runResponse).json();
 const panel=page.getByTestId('raw-data-panel'),chart=page.locator('.raw-plot-pane [role="img"]');
 await expect(panel.getByRole('button',{name:'原始表下一页',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'查看完整原始点',exact:true}).click();
 await expect(page.getByRole('button',{name:'切回抽稀概览',exact:true})).toBeEnabled();
 await page.getByLabel('原始表通道').selectOption('left');
 await panel.locator('.raw-time-button').first().click();
 const pinned=await page.locator('.raw-point-caption').innerText();
 await chart.scrollIntoViewIfNeeded();
 const before=await page.locator('.signal-card .chart-visible-range').innerText();
 const map=full.signals.map.filter((p:any)=>p.flags!=='record_gap');
 const hovered=panel.locator('tr.raw-row-hovered');
 for(const [width,index] of [[1440,6000],[1280,8500]]){
  await page.setViewportSize({width,height:1100});await page.waitForTimeout(200);
  const box=(await chart.boundingBox())!,target=map[index].time;
  await page.mouse.move(box.x+58+(target-run.range.start)/(run.range.end-run.range.start)*(box.width-98),box.y+88);
  await expect(hovered).toHaveCount(1);
  await expect(page.getByLabel('原始表通道')).toHaveValue('map');
  // At the full-record scale one integer mouse pixel spans many original samples.
  const pixelSeconds=(run.range.end-run.range.start)/(box.width-98);
  await expect.poll(async()=>Math.abs((await rawSeconds(hovered.locator('button')))-target)).toBeLessThanOrEqual(pixelSeconds+2.1);
  const time=(await rawSeconds(hovered.locator('button')));
  expect(parseFloat(await hovered.locator('td').nth(2).innerText())).toBe(map.find((p:any)=>Math.abs(p.time-time)<1e-6).value);
  const row=(await hovered.boundingBox())!,scroll=(await panel.locator('.raw-table-scroll').boundingBox())!;
  expect(row.height).toBeLessThanOrEqual(28);expect(row.y).toBeGreaterThan(scroll.y+20);expect(row.y+row.height).toBeLessThanOrEqual(scroll.y+scroll.height);
  await expect(page.locator('.signal-card .chart-visible-range')).toHaveText(before);
  await expect(page.locator('.raw-point-caption')).toHaveText(pinned);
  await page.locator('.signal-card').screenshot({path:`../artifacts/16-raw-table-hover-${width}.png`});
 }
 // Moving into the brain-oxygen pane selects a real NIRS sample, not a MAP row.
 const box=(await chart.boundingBox())!;
 await page.mouse.move(box.x+58+.5*(box.width-98),box.y+220);
 await expect(hovered).toHaveCount(1);
 await expect(hovered.locator('td').nth(1)).toHaveText(/左脑氧|右脑氧/);
 const channel=await page.getByLabel('原始表通道').inputValue(),time=(await rawSeconds(hovered.locator('button')));
 expect(full.signals[channel].some((p:any)=>p.flags!=='record_gap'&&Math.abs(p.time-time)<1e-6)).toBeTruthy();
 await page.mouse.wheel(0,-550);
 await expect(page.locator('.signal-card .chart-visible-range')).not.toHaveText(before);
 const zoomed=await page.locator('.signal-card .chart-visible-range').innerText();
 await page.mouse.move(box.x+58+.6*(box.width-98),box.y+88);
 await expect(hovered.locator('td').nth(1)).toHaveText('MAP');
 await expect(page.locator('.signal-card .chart-visible-range')).toHaveText(zoomed);
 await expect(page.locator('.raw-point-caption')).toHaveText(pinned);
 await page.mouse.move(0,0);await expect(hovered).toHaveCount(0);
 await expect(page.locator('.raw-point-caption')).toHaveText(pinned);
 expect(fullRequests).toBe(1);expect(errors).toEqual([]);
});
