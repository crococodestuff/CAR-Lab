import {test,expect,type Page} from '@playwright/test';
async function step(page:Page,name:RegExp){await page.getByRole('button',{name:'打开学习导航'}).click();await page.getByRole('button',{name}).click();}
async function fits(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
test('目录刷新无需 Python 或完整官方索引，存储不可用仍可浏览',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{get(){throw new Error('storage unavailable');}});});
 const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
 await page.route('**/pyodide/**',route=>route.abort());
 await page.goto('./');await page.getByRole('button',{name:'选择病例',exact:true}).click();await page.getByRole('button',{name:'更新病例目录'}).click();
 await expect(page.getByRole('button',{name:'选择病例 251',exact:true})).toBeVisible();
 expect(requests.some(url=>/python-worker|pyodide|api.vitaldb.net\/(cases|trks)/.test(url))).toBe(false);
 await fits(page);await page.getByRole('button',{name:'选择病例 251',exact:true}).click();await fits(page);
});
test('公开病例分析、触屏缩放与质控、恢复已保存运行',async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('./');await page.getByRole('button',{name:'选择病例',exact:true}).click();await page.getByRole('button',{name:'更新病例目录'}).click();await page.getByRole('button',{name:'选择病例 251',exact:true}).click();
 await page.getByRole('button',{name:'下载并分析',exact:true}).click();
 await expect(page.getByRole('button',{name:'重新计算',exact:true})).toBeEnabled({timeout:180000});await expect(page.getByTestId('raw-data-panel')).toBeVisible();await fits(page);
 await step(page,/03 做时间平均/);const card=page.locator('.average-card');await card.getByRole('button',{name:'放大',exact:true}).click();
 const before=await card.locator('.chart-visible-range').textContent();const surface=card.locator('.chart-surface');await surface.scrollIntoViewIfNeeded();const box=(await surface.boundingBox())!;await page.touchscreen.tap(box.x+box.width*.5,box.y+100);
 await expect(page.getByTestId('raw-window-highlight')).toContainText('平均块');await expect(page.locator('.raw-row-window').first()).toBeVisible();
 await expect(card.locator('.chart-visible-range')).toHaveText(before!);await card.getByRole('button',{name:'清除时间预览'}).click();await expect(page.getByTestId('raw-window-highlight')).toBeEmpty();await fits(page);
 await step(page,/02 检查质量/);await expect(page.getByTestId('quality-comparison')).toBeVisible();await expect(page.getByTestId('clean-signal-card')).toBeVisible();await fits(page);
 await page.locator('.quality-manual summary').click();await page.getByLabel('标记起点').fill('13.83');await page.getByLabel('标记终点').fill('16.44');await page.getByLabel('标记原因').fill('触屏回归标记');await page.getByRole('button',{name:'添加排除',exact:true}).click();await expect(page.locator('.annotation-row')).toContainText('触屏回归标记');
 await page.screenshot({path:`../artifacts/mobile-${testInfo.project.name}.png`,fullPage:true});
 await page.reload();await expect(page.locator('.browser-runtime')).toContainText('轻量浏览就绪');await page.getByRole('button',{name:'恢复上次分析'}).click();await expect(page.getByTestId('quality-comparison')).toBeVisible({timeout:180000});await page.locator('.quality-manual summary').click();await expect(page.locator('.annotation-row')).toContainText('触屏回归标记');
 await step(page,/07 寻找 MAPopt/);await expect(page.getByLabel('MAPopt COx窗口')).toBeVisible({timeout:60000});await expect(page.getByLabel('MAPopt COx窗口').locator('option')).toHaveCount(8);await fits(page);
 expect(errors).toEqual([]);await expect(page.getByRole('alert')).toHaveCount(0);
});

test('运行库加载失败后重试，临时模式不写入结果',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='phone','Shared runtime behavior, checked once');
 let fail=true;await page.route('**/pyodide/pyodide.mjs',route=>fail?route.abort():route.continue());
 await page.goto('./');await page.locator('.browser-runtime summary').click();await page.getByRole('checkbox',{name:/临时模式/}).check();
 await step(page,/合成信号实验室/);await page.getByRole('button',{name:'运行实验',exact:true}).click();await expect(page.getByRole('alert')).toContainText('失败',{timeout:30000});
 fail=false;await page.getByRole('button',{name:'重启计算环境'}).click();await page.getByRole('button',{name:'运行实验',exact:true}).click();await expect(page.getByTestId('raw-data-panel')).toBeVisible({timeout:120000});await expect(page.locator('.busy')).toHaveCount(0);
 const keys=await page.evaluate(async()=>{const s=await import(/* @vite-ignore */ new URL('browser-storage.mjs',location.href).href);return s.fileKeys();});expect(keys.some((k:string)=>k.includes('/runs/'))).toBe(false);
 await page.locator('.signal-card').screenshot({path:'../artifacts/mobile-raw-records.png'});await expect(page.getByRole('alert')).toHaveCount(0);
});
