// Display choices mirror WINDOW_SECONDS in the formal MAPopt core.
export const coxWindowSeconds=[180,300,600,1200,1800,3600,5400,7200] as const;
export const coxWindowLabel=(seconds:number)=>seconds%60===0?`${seconds/60} 分钟`:`${seconds} 秒`;
