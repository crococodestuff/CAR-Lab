import {useContext,useEffect,useState,type ReactNode} from 'react';
import {TimeContext,timeAxisName,timeInput,parseTimeInput} from './TimeDisplay';
import {type Annotation,type Channel} from './types';

export function ArtifactExclusion({mark,onChange,onSave,open,onOpen,range,busy,real,children}:{
 mark:Annotation;onChange:(mark:Annotation)=>void;onSave:(mark:Annotation)=>void;open:boolean;onOpen:(open:boolean)=>void;
 range:[number,number]|null;busy:boolean;real:boolean;children:ReactNode;
}){
 const time=useContext(TimeContext);
 const [start,setStart]=useState(''),[end,setEnd]=useState('');
 useEffect(()=>{setStart(timeInput(mark.start,time));setEnd(timeInput(mark.end,time));},[mark,time.mode,time.operationStart]);
 // Unedited values use the original precision even after a time-format switch.
 const a=start===timeInput(mark.start,time)?mark.start:parseTimeInput(start,time);
 const b=end===timeInput(mark.end,time)?mark.end:parseTimeInput(end,time);
 const valid=a!==null&&b!==null&&a>=0&&b>a&&b<=172800&&!!mark.reason.trim();
 function commitDraft(){if(a!==null&&b!==null)onChange({...mark,start:a,end:b});}
 return <section className="card artifact-exclusion" data-testid="artifact-exclusion">
  <h2>人工排除伪差</h2>
  {real?<details className="quality-manual" open={open} onToggle={e=>onOpen(e.currentTarget.open)}>
   <summary>可选：我已确认伪差，添加人工排除或查看已有标记</summary>
   <p>起止时间与下方横轴一致：<strong>{timeAxisName(time)}</strong>。只排除已确认的伪差，原始记录始终保留。保存后点击“重新计算”，下方处理后图才会更新。</p>
   <button className="outline" disabled={!range||busy} onClick={()=>range&&onChange({...mark,start:Math.max(0,range[0]*60),end:range[1]*60})}>使用原始图当前视图</button>
   <div className="mark-form">
    <label>起点 · {timeAxisName(time)}<input aria-label="标记起点" value={start} onChange={e=>setStart(e.target.value)} onBlur={commitDraft}/></label>
    <label>终点 · {timeAxisName(time)}<input aria-label="标记终点" value={end} onChange={e=>setEnd(e.target.value)} onBlur={commitDraft}/></label>
    <label>作用通道<select aria-label="标记通道" value={mark.channel} onChange={e=>onChange({...mark,channel:e.target.value as Channel|'all'})}><option value="all">全部通道</option><option value="map">有创 MAP</option><option value="left">左侧脑氧</option><option value="right">右侧脑氧</option></select></label>
    <label className="grow">原因<input aria-label="标记原因" value={mark.reason} onChange={e=>onChange({...mark,reason:e.target.value})}/></label>
    <button className="primary" disabled={busy||!valid} onClick={()=>valid&&onSave({...mark,start:a!,end:b!})}>添加排除</button>
   </div>
   {!valid&&<p role="status">请输入有效时间：{time.mode==='minutes'?'分钟数，例如 13.83':'时:分:秒，例如 00:13:30；术前可用负号'}。终点须晚于起点，换算后的记录时间须在 0–48 小时内，并填写原因。</p>}
   {children}
  </details>:<p className="caption">合成实验通过场景生成缺失与尖峰；人工排除用于真实病例。</p>}
 </section>;
}
