import {test,expect} from '@playwright/test';

test('时间平均SVG缩放、半开块悬停联动及质量图同屏',async({page})=>{
 await page.setViewportSize({width:1440,height:1600});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByRole('button',{name:'合成信号实验室'}).click();
 await page.getByRole('button',{name:'运行实验',exact:true}).click();
 await expect(page.locator('.busy')).toHaveCount(0);
 await page.getByRole('button',{name:/03 做时间平均/}).click();
 await page.getByLabel('横轴时间显示').selectOption('elapsed');
 const chart=page.getByRole('img',{name:'时间平均图：悬停预览原始时间块，点击查看观测',exact:true});
 const panel=page.getByTestId('raw-data-panel'),highlight=page.getByTestId('raw-window-highlight');
 await expect(chart.locator('svg')).toHaveCount(1);await expect(chart.locator('canvas')).toHaveCount(0);
 await expect(panel.locator('tbody tr').first()).toBeVisible();
 const range=page.locator('.average-card .chart-visible-range'),rawRange=page.locator('.signal-card .chart-visible-range');
 const before=await range.innerText(),rawBefore=await rawRange.innerText(),pinned=await highlight.innerText();
 const paths=()=>chart.locator('svg path').evaluateAll(elements=>elements.filter(e=>e.getAttribute('fill')==='none'&&Number(e.getAttribute('stroke-width'))>=1.5&&(e.getAttribute('d')?.length??0)>100).map(e=>e.getAttribute('d')));
 expect(await paths()).toHaveLength(3);
 let detailRequests=0;page.on('request',r=>{if(/\/(signals|blocks|windows)(\/|\?|$)/.test(r.url()))detailRequests++;});
 await chart.scrollIntoViewIfNeeded();const box=(await chart.boundingBox())!;
 await page.mouse.move(box.x+58+(600/1800)*(box.width-86),box.y+100);
 await expect(highlight).toHaveAttribute('data-start','600');await expect(highlight).toHaveAttribute('data-end','610');
 await expect(highlight).toContainText('悬停平均块');await expect(highlight).toContainText('00:10:00–00:10:10');
 await expect(panel.locator('.raw-table-note')).toContainText('平均时间块');
 const rows=panel.locator('tr.raw-row-window');
 await expect(rows.first().locator('button')).toHaveAttribute('title','原始时间：600 秒');
 const times=await rows.locator('button').evaluateAll(buttons=>buttons.map(b=>Number(b.getAttribute('title')!.match(/原始时间：(.*) 秒/)![1])));
 expect(times.length).toBeGreaterThan(1);expect(times.every(t=>t>=600&&t<610)).toBeTruthy();
 const endRow=panel.locator('tbody tr').filter({has:page.locator('button[title="原始时间：610 秒"]')});
 expect(await endRow.count()).toBeGreaterThan(0);
 for(const row of await endRow.all())await expect(row).not.toHaveClass(/raw-row-window/);
 await expect(range).toHaveText(before);await expect(rawRange).toHaveText(rawBefore);
 expect(detailRequests).toBe(0);expect(await paths()).toHaveLength(3);
 await page.locator('.signal-card').screenshot({path:'../artifacts/28-average-hover-table.png'});
 await page.mouse.move(0,0);await expect(rows).toHaveCount(0);await expect(highlight).toHaveText(pinned);
 await page.mouse.move(box.x+box.width*.5,box.y+100);
 for(let i=0;i<10;i++){await page.mouse.wheel(0,-25);await page.waitForTimeout(35);}
 await expect(range).not.toHaveText(before);expect(await paths()).toHaveLength(3);
 const zoomed=await range.innerText();
 await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+100,{steps:10});await page.mouse.up();
 await expect(range).not.toHaveText(zoomed);expect(await paths()).toHaveLength(3);
 await page.mouse.move(0,0);await expect(rows).toHaveCount(0);
 await chart.screenshot({path:'../artifacts/29-average-svg-zoom-pan.png'});
 await page.getByRole('button',{name:/02 检查质量/}).click();
 const learning=page.getByTestId('map-quality-learning');
 await expect(learning.getByRole('button',{name:'展开 MAP 质控学习'})).toHaveAttribute('aria-expanded','false');
 for(const size of [{width:1440,height:1000},{width:1920,height:1080}]){
  await page.setViewportSize(size);
  await page.getByRole('button',{name:'同屏对照原始图',exact:true}).click();
  await page.waitForTimeout(650);
  const raw=await page.locator('.signal-card [role="img"]').boundingBox();
  const quality=await page.getByTestId('quality-review').getByRole('img',{name:'质量时间带：点击一个色块查看该通道在这段时间的质量原因',exact:true}).boundingBox();
  expect(raw!.y).toBeGreaterThanOrEqual(0);expect(quality!.y+quality!.height).toBeLessThanOrEqual(size.height);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.screenshot({path:`../artifacts/30-quality-same-screen-${size.width}.png`});
 }
 expect(errors).toEqual([]);
});
