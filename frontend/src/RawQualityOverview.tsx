import {post} from './api';
import {useContext,useEffect,useState} from 'react';
import {type Run,type RawSummary,type Config,type Annotation,type QualityComparisonStats,colors,fmt} from './types';
import {TimeContext,timeLabel,timeAxisName} from './TimeDisplay';

export function RawQualityOverview({run,stats,config,annotations,dirty}:{run:Run|null;stats?:RawSummary;config:Config;annotations:Annotation[];dirty:boolean}){
 const time=useContext(TimeContext);
 const [preview,setPreview]=useState<{key:string;data?:QualityComparisonStats;error?:string}|null>(null);
 const [retry,setRetry]=useState(0);
 const key=JSON.stringify({run:run?.run_id,config,annotations});
 useEffect(()=>{let active=true;if(!run)return;const timer=setTimeout(()=>{void post<QualityComparisonStats>(`/analyses/${run.run_id}/quality-preview`,{config,items:annotations}).then(data=>{if(active)setPreview({key,data});}).catch(error=>{if(active)setPreview({key,error:error.message});});},350);return()=>{active=false;clearTimeout(timer);};},[key,retry]);
 const current=preview?.key===key?preview:null;

 return <section className="raw-quality-overview" data-testid="raw-quality-overview">
  <div className="section-title"><div><h2>先看原始数据概况</h2><p>{run?`统计范围：${timeLabel(run.range.start/60,time)}–${timeLabel(run.range.end/60,time)}（${timeAxisName(time)}） · 当前已保存分析范围，图表缩放不改变统计`:'完成一次分析后，查看三个通道的完整原始观测统计。'}</p></div><span className="pill">质控前</span></div>
  {run&&!stats?<p role="status">正在读取完整原始观测统计…</p>:<div className="raw-summary-grid">{(['map','left','right'] as const).map(k=>{
   const s=stats?.[k],q=current?.data?.[k],unit=k==='map'?'mmHg':'%',name=k==='map'?'有创 MAP':k==='left'?'左侧脑氧 rSO₂':'右侧脑氧 rSO₂';
   return <article className="card raw-summary-card" key={k} data-testid={`raw-summary-${k}`} style={{borderTopColor:colors[k]}} aria-label={`${name} 原始数据概况`}>
    <h3>{name}<span>{unit}</span></h3>
    <small>取值范围（最小值–最大值）</small>
    <strong className="raw-summary-range" data-testid="raw-summary-range" title={s?.minimum!=null?`${s.minimum}–${s.maximum} ${unit}`:undefined}>{s?.minimum!=null?`${fmt(s.minimum,2)}–${fmt(s.maximum,2)}`:'—'}</strong>
    <div className="raw-summary-metrics"><div><small>均值</small><b data-testid="raw-summary-mean" title={s?.mean!=null?String(s.mean):undefined}>{fmt(s?.mean,2)}</b></div><div><small>标准差（样本 SD）</small><b data-testid="raw-summary-sd" title={s?.sample_sd!=null?String(s.sample_sd):undefined}>{fmt(s?.sample_sd,2)}</b></div></div>
    <p data-testid="raw-summary-count">原始观测 {s?s.observations.toLocaleString():'—'} 条 · 可统计数值 {s?s.finite_observations.toLocaleString():'—'} 条</p>
    <p data-testid="raw-summary-missing">缺失 / 非有限 {s?s.nonfinite_observations.toLocaleString():'—'} 条{s?.nonfinite_fraction!=null?`（${fmt(s.nonfinite_fraction*100,1)}%）`:''}</p>
    {run&&<div className="raw-summary-anomalies" data-testid={`raw-anomalies-${k}`}><small>当前规则：异常 / 需复核点数 ÷ 原始总点数</small><strong>{q?`${q.flagged_points.toLocaleString()} / ${q.before.observations.toLocaleString()}`:current?.error?'暂不可统计':'统计中…'}</strong>{q&&<p>其中排除 {q.excluded_points.toLocaleString()} 点 · 仅提示 {q.review_only_points.toLocaleString()} 点{dirty?' · 待重算预览':' · 当前已应用规则'}</p>}</div>}
    {s&&s.finite_observations<2&&<p className="raw-summary-empty">{s.observations===0?'当前范围没有该通道观测。':s.finite_observations===0?'没有有限数值，无法计算范围、均值和标准差。':'仅有一个有限数值，样本标准差无法定义。'}</p>}
   </article>;
  })}</div>}
  {current?.error&&<p role="alert">当前规则预览失败：{current.error} <button onClick={()=>setRetry(v=>v+1)}>重试规则预览</button></p>}
  {run&&<p className="caption">异常计数按当前表单规则与标记预览，包含无效及需复核的原始观测，每点只计一次；仅提示不等于确认伪差。分母为已保存分析范围内实际记录条数，不补齐没有记录的时间。范围、均值、标准差仍是质控前数据；COx 和下方处理后对照需重算才更新。</p>}
  <details className="raw-summary-method"><summary>这些统计如何计算？</summary><p>使用与原始观测表一致的完整记录，未抽稀、未做时间平均；重复时间戳已按导入规则处理。仅从范围、均值和标准差中跳过缺失、非数值、NaN及无穷值；仍包含有限的负值、极端值、冲突记录及后来被人工排除的值，因此“可统计”不等于质控合格。</p><p>每次观测等权，均值不按时间加权；样本标准差分母为 n−1，至少需要两个有限数值。缺失比例以实际记录条数为分母，未记录的时间缺口没有补行，不能把这个比例当作时间覆盖率。这里只描述原始分布，不参与 COx/MAPopt 计算。</p></details>
 </section>;
}
