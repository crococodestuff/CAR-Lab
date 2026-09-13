import {test,expect} from '@playwright/test';
import {parseTimeInput,timeInput,type TimeDisplay} from '../src/TimeDisplay';
import {cleanSeries} from '../src/CleanSignalChart';
import {type Run} from '../src/types';

test('排除时间换算与清洗曲线保留缺口',()=>{
 const minutes:TimeDisplay={mode:'minutes',operationStart:900,domainKey:''};
 expect(parseTimeInput('13.83',minutes)).toBeCloseTo(829.8,9);
 const surgery={...minutes,mode:'surgery' as const};
 expect(parseTimeInput('-00:01:10.2',surgery)).toBeCloseTo(829.8,9);
 expect(timeInput(829.8,surgery)).toBe('-00:01:10.2');
 expect(parseTimeInput('00:00:05.25',{...minutes,mode:'elapsed'})).toBe(5.25);
 expect(timeInput(5.25,{...minutes,mode:'elapsed'})).toBe('00:00:05.25');
 for(const invalid of ['', '13:83', '00:61:00', 'Infinity'])expect(parseTimeInput(invalid,surgery)).toBeNull();
 const run={config:{use_annotations:true},annotations:[{channel:'left',start:3,end:4}]} as Run;
 const rows=[{time:0,value:70,NIRS_clean:70,valid:true,flags:''},{time:5,value:100,NIRS_clean:null,valid:false,flags:'nirs_above_range'},{time:10,value:90,NIRS_clean:90,valid:true,flags:'review'}];
 expect(cleanSeries(rows,'left',run)).toEqual([[0,70],[2.5/60,null],[5/60,null],[10/60,90]]);
 expect(cleanSeries(rows,'right',run)).toEqual([[0,70],[5/60,null],[10/60,90]]);
 expect(rows[1].value).toBe(100);
});

test('排除表位于原始图之前，分钟与手术时间准确保存',async({page})=>{
 let annotations={version:0,items:[] as any[]};
 await page.route('**/api/cases/251/annotations',async route=>{
  if(route.request().method()==='POST'){const body=route.request().postDataJSON();annotations={version:annotations.version+1,items:body.items};}
  await route.fulfill({json:annotations});
 });
 await page.goto('/');await page.getByRole('button',{name:'选择病例',exact:true}).click();
 await page.getByRole('button',{name:'选择病例 251',exact:true}).click();
 await page.getByRole('button',{name:/^(下载并分析|分析本地数据)$/}).click();
 await expect(page.getByRole('button',{name:'重新计算',exact:true})).toBeEnabled({timeout:60000});
 await page.getByRole('button',{name:/02 检查质量/}).click();
 await expect(page.getByTestId('clean-signal-card')).toBeVisible();
 expect(await page.evaluate(()=>!!(document.querySelector('.artifact-exclusion')!.compareDocumentPosition(document.querySelector('.signal-card')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBeTruthy();
 expect(await page.evaluate(()=>!!(document.querySelector('.signal-card')!.compareDocumentPosition(document.querySelector('.clean-signal-card')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBeTruthy();
 await page.locator('.quality-manual summary').click();
 await page.getByLabel('标记起点').fill('13.83');await page.getByLabel('标记终点').fill('166.44');
 await page.getByRole('button',{name:'添加排除',exact:true}).click();
 await expect(page.locator('.annotation-row')).toHaveCount(1);
 expect(annotations.items[0].start).toBeCloseTo(829.8,9);expect(annotations.items[0].end).toBeCloseTo(9986.4,9);
 await expect(page.getByTestId('clean-signal-stale')).toBeVisible();
 await page.getByLabel('横轴时间显示').selectOption('elapsed');
 await expect(page.getByLabel('标记起点')).toHaveValue('00:13:49.8');
 await page.getByLabel('横轴时间显示').selectOption('surgery');
 const displayed=await page.getByLabel('标记起点').inputValue();
 expect(displayed).toMatch(/^-?\d+:\d{2}:\d{2}/);
 await page.getByRole('button',{name:'添加排除',exact:true}).click();
 await expect(page.locator('.annotation-row')).toHaveCount(2);
 expect(annotations.items[1].start).toBe(annotations.items[0].start);
 await page.getByLabel('横轴时间显示').selectOption('minutes');
 await page.getByLabel('标记起点').fill('200');await page.getByLabel('标记终点').fill('100');
 await expect(page.getByRole('button',{name:'添加排除',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'使用原始图当前视图'}).click();
 await expect(page.getByRole('button',{name:'添加排除',exact:true})).toBeEnabled();
 await page.getByTestId('artifact-exclusion').screenshot({path:'../artifacts/artifact-time-input.png'});
 await page.getByTestId('clean-signal-card').screenshot({path:'../artifacts/clean-records-chart.png'});
 await expect(page.getByRole('alert')).toHaveCount(0);
});
