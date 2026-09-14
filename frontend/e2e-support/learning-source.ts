import {expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';

export async function checkLearningSource(page:Page,browserMode:boolean){
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('./');
 if(browserMode)await expect(page.locator('.browser-runtime')).toContainText('轻量浏览就绪',{timeout:180000});
 await page.getByRole('button',{name:'合成信号实验室',exact:true}).click();
 await page.getByRole('button',{name:'参数',exact:true}).click();
 const picker=page.getByLabel('窗口秒数');
 const expected=[180,300,600,1200,1800,3600,5400,7200];
 const python=await readFile(new URL('../../backend/car_core/mapopt.py',import.meta.url),'utf8');
 expect(python.match(/WINDOW_SECONDS = \(([^)]+)\)/)![1].split(',').map(Number)).toEqual(expected);
 expect(await picker.locator('option').evaluateAll(options=>options.map(o=>+(o as HTMLOptionElement).value))).toEqual(expected);
 expect(await picker.locator('option').allTextContents()).toEqual(expected.map(v=>`${v/60} 分钟`));
 await picker.selectOption('7200');
 const guide=page.getByTestId('parameter-guide');await guide.locator('summary').click();
 await expect(guide).toContainText('每窗 720 块');
 await expect(guide.getByRole('img')).toBeVisible();
 for(const text of ['平均块 / s','步长 / s','块最低覆盖率','配对模式与放宽配对比例','分析起点 / 终点','MAP 分箱 / mmHg','探索参考值','应用人工排除','提示 INVOS 候选上限','自动排除可疑点（探索规则）'])await expect(guide.getByRole('heading',{name:text,exact:true})).toBeVisible();
 await guide.screenshot({path:'../artifacts/parameter-guide.png'});
 await page.getByRole('button',{name:'应用参数并计算',exact:true}).click();
 await expect(page.locator('.busy')).toHaveCount(0,{timeout:60000});
 await expect(picker).toHaveValue('7200');
 await page.getByRole('button',{name:'参数',exact:true}).click();
 for(const [step,first] of [['01','ingest'],['02','quality'],['03','aggregate'],['04','cox'],['05','cox'],['06','analysis'],['07','mapopt']]){
  await page.getByRole('button',{name:new RegExp(`^${step} `)}).click();
  const panel=page.getByTestId('calculation-source');
  await expect(panel).not.toHaveAttribute('open','');
  await panel.locator('summary').click();
  const select=panel.getByLabel('计算源码文件');await expect(select).toHaveValue(first);
  const files=await select.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value));
  for(const file of files){
   await select.selectOption(file);
   const expectedSource=await readFile(new URL(`../../backend/car_core/${file}.py`,import.meta.url),'utf8');
   await expect(panel.locator('pre code')).toHaveText(expectedSource);
   // Compare exact text as well: the viewer must expose the actual source, not a paraphrase.
   expect((await panel.locator('pre code').textContent())!.replace(/\r\n/g,'\n')).toBe(expectedSource.replace(/\r\n/g,'\n'));
   await expect(panel.getByTestId('source-filename')).toHaveText(`backend/car_core/${file}.py`);
  }
  if(step==='02')await panel.screenshot({path:'../artifacts/calculation-source.png'});
 }
 const mapPicker=page.getByLabel('MAPopt COx窗口');
 await expect(mapPicker).toHaveValue('7200',{timeout:60000});
 expect(await mapPicker.locator('option').evaluateAll(options=>options.map(o=>+(o as HTMLOptionElement).value))).toEqual(expected);
 await expect(page.getByTestId('mapopt-short-record')).toContainText('不足 120 分钟');
 await mapPicker.selectOption('300');
 await expect(page.locator('.mapopt-window-controls')).toContainText('主分析窗口：120 分钟；本图窗口：5 分钟');
 await page.getByRole('button',{name:/^06 /}).click();await expect(picker).toHaveValue('7200');
 for(const width of [1280,900]){await page.setViewportSize({width,height:1100});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();}
 await expect(page.getByRole('alert')).toHaveCount(0);expect(errors).toEqual([]);
}
