import {useEffect,useMemo,useState} from 'react';
import {Chart} from './Chart';
import {type Run,type Signals,names} from './types';

export function cleanSeries(rows:NonNullable<Signals['map']>,channel:'map'|'left'|'right',run:Run){
 const annotations=run.config.use_annotations?run.annotations.filter(a=>a.channel==='all'||a.channel===channel):[];
 const points:[number,number|null][]=[];
 for(let i=0;i<rows.length;i++){
  const p=rows[i],previous=rows[i-1];
  // A marked interval between observations still breaks the display line.
  if(previous&&annotations.some(a=>a.start<p.time&&a.end>previous.time))points.push([(previous.time+p.time)/120,null]);
  const value=channel==='map'?p.MAP_clean:p.NIRS_clean;
  points.push([p.time/60,p.valid?(value===undefined?p.value:value):null]);
 }
 return points;
}
export function CleanSignalChart({run,rawOption,range,load,dirty}:{run:Run;rawOption:any;range:[number,number]|null;load:(id:string,full:boolean)=>Promise<{signals:Signals}>;dirty:boolean}){
 const [data,setData]=useState<{id:string;signals:Signals}|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;setError('');load(run.run_id,true).then(s=>{if(active)setData({id:run.run_id,signals:s.signals});}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[run.run_id,load]);
 const option=useMemo(()=>({...rawOption,
  aria:{enabled:true,label:{description:'质控处理后的 MAP 与左右脑氧，与原始记录使用相同时间轴和纵轴范围'}},
  brush:undefined,toolbox:{show:false},
  series:rawOption.series.map((s:any)=>{const channel=(['map','left','right'] as const).find(k=>names[k]===s.name)!;
   return {...s,data:data?.id===run.run_id?cleanSeries(data.signals[channel]??[],channel,run):[],markPoint:{data:[]},markLine:{data:[]},markArea:{data:[]}};})
 }),[rawOption,data,run]);
 return <section className="card clean-signal-card" data-testid="clean-signal-card">
  <div className="section-title"><h2>同一时间轴上的质控处理后记录</h2><span>已完成计算 · 完整清洗点</span></div>
  {dirty&&<p className="note" data-testid="clean-signal-stale">规则或排除标记已修改，当前仍显示上次计算结果。请重新计算后对照。</p>}
  {error?<p role="alert">无法读取清洗记录：{error}</p>:<div className="raw-records-layout"><div className="raw-plot-pane">
   <Chart option={option} renderer="svg" height={335} group="car-time" showRange focusRange={range??undefined}/>
  </div><aside className="raw-data-panel"><h3>怎样对照</h3><p>上下两图的横轴、纵轴范围相同；缩放任一图可同步查看。</p><p>这里绘制 MAP_clean / NIRS_clean。已判无效或已应用人工排除的点留为空缺；仅提示复核的点仍保留。</p><p>本图是逐点清洗后的记录。时间块覆盖不足等后续判定，请继续看质量时间带和时间平均结果。</p>{data?.id!==run.run_id&&<p role="status">正在读取完整清洗记录…</p>}</aside></div>}
 </section>;
}
