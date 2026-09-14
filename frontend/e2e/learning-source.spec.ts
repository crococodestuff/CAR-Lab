import {test} from '@playwright/test';
import {checkLearningSource} from '../e2e-support/learning-source';
test('统一长窗口、参数图解与正式源码逐步展示',async({page})=>checkLearningSource(page,false));
