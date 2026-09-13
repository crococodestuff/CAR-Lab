import {test,expect} from '@playwright/test';

test('原始数据概况三通道统计、位置与缩放独立',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByRole('button',{name:'合成信号实验室'}).click();
 const response=page.waitForResponse(r=>/\/api\/analyses\/[a-f0-9]{64}$/.test(r.url())&&r.ok());
 await page.getByRole('button',{name:'运行实验',exact:true}).click();
 const run=await(await response).json();await expect(page.locator('.busy')).toHaveCount(0);
 const source=await(await page.request.get(`/api/analyses/${run.run_id}/signals?full=true`)).json();
 await page.getByRole('button',{name:/02 检查质量/}).click();
 const overview=page.getByTestId('raw-quality-overview');
 await expect(overview.locator('article')).toHaveCount(3);
 await expect(overview).toContainText('质控前');await expect(overview).toContainText('图表缩放不改变统计');
 for(const channel of ['map','left','right']){
  const card=page.getByTestId(`raw-summary-${channel}`);
  const rows=source.signals[channel].filter((p:any)=>p.flags!=='record_gap');
  const values=rows.filter((p:any)=>p.value!==null).map((p:any)=>p.value);
  const mean=values.reduce((s:number,v:number)=>s+v,0)/values.length;
  const sd=Math.sqrt(values.reduce((s:number,v:number)=>s+(v-mean)**2,0)/(values.length-1));
  await expect(card.getByTestId('raw-summary-range')).toHaveText(`${Math.min(...values).toFixed(2)}–${Math.max(...values).toFixed(2)}`);
  await expect(card.getByTestId('raw-summary-mean')).toHaveText(mean.toFixed(2));
  await expect(card.getByTestId('raw-summary-sd')).toHaveText(sd.toFixed(2));
  await expect(card.getByTestId('raw-summary-count')).toContainText(`原始观测 ${rows.length.toLocaleString()} 条`);
 }
 expect(await overview.evaluate(el=>Boolean(el.compareDocumentPosition(document.querySelector('[data-testid="map-quality-learning"]')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBeTruthy();
 for(const width of [1440,1280]){
  await page.setViewportSize({width,height:1100});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  const cards=await overview.locator('article').all();
  const bounds=await Promise.all(cards.map(c=>c.boundingBox()));
  expect(Math.max(...bounds.map(b=>b!.y))-Math.min(...bounds.map(b=>b!.y))).toBeLessThan(2);
  await overview.screenshot({path:`../artifacts/31-raw-summary-${width}.png`});
 }
 const before=await overview.innerText();
 const chart=page.locator('.signal-card [role="img"]');await chart.scrollIntoViewIfNeeded();
 const box=(await chart.boundingBox())!;
 const range=page.locator('.signal-card .chart-visible-range'),initial=await range.innerText();
 await page.mouse.move(box.x+box.width*.5,box.y+100);await page.mouse.wheel(0,-180);
 await expect(range).not.toHaveText(initial);await expect.poll(()=>overview.innerText()).toBe(before);
 await page.getByLabel('横轴时间显示').selectOption('elapsed');
 await expect(overview).toContainText('00:00:00–00:30:00');
 await page.reload();await expect(page.getByTestId('raw-summary-map').getByTestId('raw-summary-sd')).toHaveText(source.raw_summary.map.sample_sd.toFixed(2));
 expect(errors).toEqual([]);
});
