import {test,expect} from '@playwright/test';

test('旧分析响应不覆盖已修改参数和新运行',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'合成信号实验室'}).click();
 let release:()=>void=()=>{};
 let seen:()=>void=()=>{};
 const intercepted=new Promise<void>(r=>{seen=r;});
 const gate=new Promise<void>(r=>{release=r;});
 let hold=true;
 await page.route(/\/api\/analyses\/[a-f0-9]{64}$/,async route=>{
   if(hold){hold=false;const response=await route.fetch();seen();await gate;await route.fulfill({response});}
   else await route.continue();
 });
 await page.getByRole('button',{name:'运行实验',exact:true}).click();await intercepted;
 await page.getByRole('button',{name:'参数',exact:true}).click();
 await page.getByLabel('窗口秒数').selectOption('600');release();
 await page.waitForTimeout(250);
 await expect(page.getByLabel('窗口秒数')).toHaveValue('600');
 await expect(page.getByRole('button',{name:'导出学习报告'})).toBeDisabled();
 await page.getByRole('button',{name:'运行实验',exact:true}).click();
 await expect(page.getByRole('button',{name:'导出学习报告'})).toBeEnabled({timeout:60000});
 await expect(page.locator('.busy')).toHaveCount(0,{timeout:60000});
 await expect(page.getByLabel('窗口秒数')).toHaveValue('600');
});
