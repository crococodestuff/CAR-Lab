import {createContext} from 'react';

export type TimeMode='minutes'|'elapsed'|'surgery';
export interface TimeDisplay {mode:TimeMode;operationStart:number|null;domainKey:string;}
export const TimeContext=createContext<TimeDisplay>({mode:'minutes',operationStart:null,domainKey:''});
export function clockDuration(seconds:number){
 const n=Math.round(Math.abs(seconds));
 return `${seconds<0?'-':''}${String(Math.floor(n/3600)).padStart(2,'0')}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
}
export function timeLabel(minutes:number,time:TimeDisplay){
 if(time.mode==='minutes')return `${Number(minutes.toFixed(2))}`;
 return clockDuration(minutes*60-(time.mode==='surgery'?(time.operationStart??0):0));
}
export function timeAxisName(time:TimeDisplay){
 return time.mode==='minutes'?'记录时间 / min':time.mode==='elapsed'?'记录经过 / 时:分:秒':'手术相对 / 时:分:秒';
}
