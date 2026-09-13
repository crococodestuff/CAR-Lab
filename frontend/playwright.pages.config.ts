import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e-pages',timeout:240000,workers:1,use:{baseURL:process.env.CAR_PAGES_URL||'http://127.0.0.1:4173/CAR-Lab/',channel:'chrome',headless:true,viewport:{width:1440,height:1100},trace:'retain-on-failure'},reporter:[['list']]});
