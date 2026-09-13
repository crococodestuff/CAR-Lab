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
// Editable labels retain subsecond precision; canonical annotations remain in seconds.
export function timeInput(seconds:number,time:TimeDisplay){
 if(time.mode==='minutes')return String(Number((seconds/60).toFixed(9)));
 const value=seconds-(time.mode==='surgery'?(time.operationStart??0):0),n=Math.round(Math.abs(value)*1e6)/1e6;
 return `${value<0?'-':''}${String(Math.floor(n/3600)).padStart(2,'0')}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${(n%60<10?'0':'')+Number((n%60).toFixed(6)).toString()}`;
}
export function parseTimeInput(value:string,time:TimeDisplay):number|null{
 const text=value.trim();
 if(time.mode==='minutes')return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)&&Number.isFinite(+text)?+text*60:null;
 const match=/^(-?)(\d+):([0-5]\d):([0-5]\d(?:\.\d+)?)$/.exec(text);
 if(!match)return null;
 const seconds=(+match[2]*3600 + +match[3]*60 + +match[4])*(match[1]?-1:1)+(time.mode==='surgery'?(time.operationStart??0):0);
 return Number.isFinite(seconds)?seconds:null;
}
