import {test} from '@playwright/test';
import {checkLearningSource} from '../e2e-support/learning-source';
test('浏览器版统一窗口与源码学习',async({page})=>checkLearningSource(page,true));
