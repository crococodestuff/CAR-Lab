import {useEffect,useMemo,useRef,useState} from 'react';
import {api,downloadApi} from './api';
import {Chart,base} from './Chart';
import {type Run,type Side,fmt} from './types';

type Method='windows'|'bins';
interface Point {map:number;cox:number;start:number;end:number;window_id:string;support_seconds:number;}
interface Bin {map_low:number;map_high:number;mean_map:number;mean_cox:number;sd_cox:number|null;outputs:number;support_seconds:number;low_support:boolean;}
interface Fit {coefficients:{a:number;b:number;c:number}|null;r_squared:number|null;rmse:number|null;vertex:number|null;minimum_cox:number|null;mapopt:number|null;curve:number[][];reasons:string[];}
interface Result {side:Side;window_seconds:number;points:Point[];bins:Bin[];valid_outputs:number;excluded_outputs:number;cross_boundary_outputs:number;support_seconds:number;map_range:[number,number]|null;fit_points:number;fit:Fit;}
interface Report {version:string;mode:string;source_run_id:string|null;report_id?:string;period:{day:number;start:number;end:number};method:Method;bin_width:number;results:Result[];skipped_window_seconds:number[];}
const reasons:Record<string,string>={nonpositive_map:'拟合输入包含非正MAP，请回到质量页核查。保留异常点展示，但不据此给出有效估计。',insufficient_fit_points:'拟合至少需要5个点，且有5个不同的MAP坐标。',nonfinite_fit_input:'拟合输入包含非有限数值。',insufficient_map_variation:'观测MAP几乎不变，无法定位最低点。',singular_fit:'MAP分布使二次拟合退化。',not_upward:'曲线未开口向上，或弯曲程度接近数值零。',vertex_outside_range:'最低点不在拟合所覆盖的MAP范围内部，不能外推MAPopt。',minimum_outside_cox:'拟合最低COx超出−1至1，模型不适合给出估计。',weak_fit:'拟合解释度不足（R²低于0.20或无法定义）。'};
const windowLabel=(seconds:number)=>seconds%60===0?`${seconds/60} 分钟`:`${seconds} 秒`;
const label=(r:Result)=>`${windowLabel(r.window_seconds)} · ${r.side==='left'?'左侧':'右侧'}`;

export function MapOpt({run,dirty}:{run:Run;dirty:boolean}){
 const [method,setMethod]=useState<Method>('windows'),[width,setWidth]=useState(run.config.map_bin_width);
 const [day,setDay]=useState(Math.floor(run.range.start/86400)),[demo,setDemo]=useState(false);
 const [response,setResponse]=useState<{url:string;report:Report}|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [key,setKey]=useState(`${run.config.window_seconds}-${run.config.sides[0]}`),[showPoints,setShowPoints]=useState(true),[reference,setReference]=useState(true),[referenceValues,setReferenceValues]=useState(['0.3','-0.3']);
 const cache=useRef(new Map<string,Promise<Report>>());
 const url=demo?'/mapopt/example':`/analyses/${run.run_id}/mapopt?method=${method}&width=${width}&day=${day}`;
 const report=response?.url===url?response.report:null;
 useEffect(()=>{let active=true;setError('');let pending=cache.current.get(url);
  if(!pending){pending=api<Report>(url).catch(e=>{cache.current.delete(url);throw e;});cache.current.set(url,pending);}
  pending.then(r=>{if(active){setResponse({url,report:r});setKey(k=>r.results.some(v=>`${v.window_seconds}-${v.side}`===k)?k:r.results[0]?`${r.results[0].window_seconds}-${r.results[0].side}`:'');}}).catch(e=>{if(active)setError(e.message);});
  return()=>{active=false;};
 },[url,retry]);
 const selected=report?.results.find(r=>`${r.window_seconds}-${r.side}`===key);
 const option=useMemo(()=>{
  const result=selected,fit=result?.fit,valid=fit?.mapopt!=null;
  const errorBars=result?.bins.filter(b=>b.sd_cox!==null).map(b=>[b.mean_map,b.mean_cox-b.sd_cox!,b.mean_cox+b.sd_cox!])??[];
  return {...base,dataZoom:[],grid:{left:60,right:40,top:48,bottom:55},aria:{enabled:true,label:{description:'MAP与COx散点、分箱均值及二次拟合；MAPopt仅在拟合规则通过时标出'}},
   legend:{top:0,data:['窗口观测','分箱均值','二次拟合']},
   xAxis:{...base.xAxis,scale:true,name:'MAP / mmHg',nameLocation:'middle',nameGap:30,nameTextStyle:{padding:0}},
   yAxis:{...base.yAxis,name:'COx',min:-1,max:1},
   tooltip:{trigger:'item',confine:true,formatter:(p:any)=>{
    const d=p.data,v=p.value;if(p.seriesName==='窗口观测')return `窗口 ${d.start}–${d.end} 秒<br/>同窗 MAP ${fmt(v[0],2)} mmHg<br/>COx ${fmt(v[1],3)}`;
    if(p.seriesName==='分箱均值')return `MAP ${d.map_low}–${d.map_high} mmHg<br/>箱内平均 MAP ${fmt(d.mean_map,2)}<br/>平均 COx ${fmt(d.mean_cox,3)} · SD ${fmt(d.sd_cox,3)}<br/>${d.outputs} 个重叠输出 · 支持 ${fmt(d.support_seconds/60,1)} 分钟`;
    return `MAP ${fmt(v?.[0],2)} mmHg<br/>拟合 COx ${fmt(v?.[1],3)}`;
   }},series:[
    {name:'窗口观测',type:'scatter',symbolSize:3,itemStyle:{color:'#7799a7',opacity:.18},data:showPoints?result?.points.map(p=>({...p,value:[p.map,p.cox]})):[]},
    {name:'箱内标准差',type:'custom',clip:true,silent:true,tooltip:{show:false},data:errorBars,
     renderItem:(_params:any,api:any)=>{const low=api.coord([api.value(0),api.value(1)]),high=api.coord([api.value(0),api.value(2)]);const style={stroke:'#6a7b81',lineWidth:1};return {type:'group',children:[{type:'line',shape:{x1:low[0],y1:low[1],x2:high[0],y2:high[1]},style},{type:'line',shape:{x1:low[0]-4,y1:low[1],x2:low[0]+4,y2:low[1]},style},{type:'line',shape:{x1:high[0]-4,y1:high[1],x2:high[0]+4,y2:high[1]},style}]};}},
    {name:'分箱均值',type:'scatter',symbolSize:8,itemStyle:{color:'#277d7c'},data:result?.bins.map(b=>({...b,value:[b.mean_map,b.mean_cox],itemStyle:{color:b.low_support?'#b8c8ca':'#277d7c'}}))},
    {name:'二次拟合',type:'line',showSymbol:false,data:fit?.curve??[],itemStyle:{color:valid?'#343f47':'#8c99a0'},lineStyle:{color:valid?'#343f47':'#8c99a0',width:2,type:valid?'solid':'dashed'},
     markPoint:valid?{symbol:'circle',symbolSize:11,itemStyle:{color:'#268671'},label:{formatter:`MAPopt ${fmt(fit!.mapopt,1)}`,position:'bottom',color:'#23785c',fontWeight:'bold'},data:[{coord:[fit!.mapopt,fit!.minimum_cox]}]}:{data:[]},
     markLine:{silent:true,symbol:'none',data:[...(valid?[{xAxis:fit!.mapopt,label:{show:false},lineStyle:{color:'#7cad99',type:'dashed'}}]:[]),...(reference?referenceValues.flatMap((raw,i)=>{const v=Number(raw),color=i===0?'#d33c30':'#7944c3';return raw.trim()&&Number.isFinite(v)&&v>=-1&&v<=1?[{yAxis:v,label:{formatter:`示意参考 ${v.toFixed(2)}`,position:i===0?'insideEndTop':'insideEndBottom',color,fontWeight:'bold'},lineStyle:{color,width:2,type:'dashed'}}]:[];}):[])]}}
   ]};
 },[selected,showPoints,reference,referenceValues]);
 const days=Array.from({length:Math.ceil(run.range.end/86400)-Math.floor(run.range.start/86400)},(_,i)=>Math.floor(run.range.start/86400)+i);
 return <section className="card mapopt-panel" data-testid="mapopt-panel">
  <div className="section-title"><div><h2>按血压寻找 MAPopt</h2><p>估计观测范围内，MAP与脑氧同向相关程度最低的血压。左右侧、不同COx窗口分别拟合。</p></div><span className="pill">探索性估计</span></div>
  <div className="mapopt-controls">
   <label>记录日<select aria-label="MAPopt记录日" value={day} disabled={demo} onChange={e=>setDay(+e.target.value)}>{days.map(d=><option key={d} value={d}>第 {d+1} 记录日 · {d*24}–{(d+1)*24} h</option>)}</select></label>
   <label>拟合方式<select aria-label="MAPopt拟合方式" value={demo?'windows':method} disabled={demo} onChange={e=>setMethod(e.target.value as Method)}><option value="windows">逐窗口 COx 等权拟合</option><option value="bins">MAP分箱均值等权拟合</option></select></label>
   <label>MAP分箱<select aria-label="MAPopt分箱宽度" value={demo?5:width} disabled={demo} onChange={e=>setWidth(+e.target.value)}>{[2,5,10].map(v=><option key={v} value={v}>{v} mmHg</option>)}</select></label>
   <button className="outline" onClick={()=>setDemo(v=>!v)}>{demo?'返回当前记录':'查看虚拟公式示例'}</button>
  </div>
  {demo?<p className="mapopt-demo">虚拟公式示例 · COx = 0.004(MAP − 50)² + 0.10，MAPopt = 50 mmHg。以下点仅用于解释公式，不来自当前病例，也不是从信号计算的COx。</p>:<p className="mapopt-context">{run.mode==='real'?'成人公开记录':'合成信号实验'} · 使用已完成运行 {run.run_id.slice(0,8)} · {run.config.sensitivity?'放宽配对':'严格配对'}。{dirty?'当前表单有未重算修改，此处仍使用已保存的质量与参数。':''}按记录起点每24小时划分，不是自然日期；仅使用该日与分析范围的交集。</p>}
  {error?<p role="alert">{error} <button onClick={()=>setRetry(v=>v+1)}>重试拟合</button></p>:!report?<p role="status">正在从本地质量块汇总不同窗口并拟合…</p>:<>
   {!demo&&<p className="caption">实际范围 {fmt(report.period.start/3600,2)}–{fmt(report.period.end/3600,2)} h，覆盖 {fmt((report.period.end-report.period.start)/3600,2)} h；不足24小时不补齐。跨日或跨分析起点的窗口不纳入当日拟合。</p>}
   {selected&&<div className="mapopt-controls mapopt-window-controls">
    <label>COx 时间窗口<select aria-label="MAPopt COx窗口" value={selected.window_seconds} onChange={e=>{const r=report.results.find(r=>r.window_seconds===Number(e.target.value)&&r.side===selected.side);if(r)setKey(`${r.window_seconds}-${r.side}`);}}>{[...new Set(report.results.map(r=>r.window_seconds))].map(w=><option key={w} value={w}>{windowLabel(w)}</option>)}</select></label>
    <label>脑氧侧别<select aria-label="MAPopt脑氧侧别" value={selected.side} onChange={e=>setKey(`${selected.window_seconds}-${e.target.value}`)}>{report.results.filter(r=>r.window_seconds===selected.window_seconds).map(r=><option key={r.side} value={r.side}>{r.side==='left'?'左侧':'右侧'}</option>)}</select></label>
    <span className="caption">按各自窗口重算 COx 与同窗平均 MAP；也可点击下表对照结果。</span>
   </div>}
   <div className="mapopt-results"><table><thead><tr><th>COx窗口 / 侧别</th><th>有效输出</th><th>支持 / min</th><th>观测 MAP / mmHg</th><th>R²</th><th>MAPopt / mmHg</th></tr></thead><tbody>{report.results.map(r=><tr key={label(r)} className={r===selected?'mapopt-active':''}><td><button onClick={()=>setKey(`${r.window_seconds}-${r.side}`)} aria-label={`查看MAPopt ${label(r)}`}>{label(r)}</button></td><td>{r.valid_outputs}</td><td>{fmt(r.support_seconds/60,1)}</td><td>{r.map_range?`${fmt(r.map_range[0],1)}–${fmt(r.map_range[1],1)}`:'—'}</td><td>{fmt(r.fit.r_squared,3)}</td><td>{r.fit.mapopt===null?'无法估计':fmt(r.fit.mapopt,1)}</td></tr>)}</tbody></table></div>
   {selected&&<>
    <div className="mapopt-chart-heading"><h3>{label(selected)} · COx 对 MAP</h3><label><input type="checkbox" checked={showPoints} onChange={e=>setShowPoints(e.target.checked)}/>窗口散点</label><label><input type="checkbox" checked={reference} onChange={e=>setReference(e.target.checked)}/>显示示意参考线</label>{reference&&referenceValues.map((v,i)=><label key={i} className={`mapopt-reference reference-${i}`}>参考线 {i+1}<input aria-label={`MAPopt参考线${i+1}`} type="number" min="-1" max="1" step="0.05" value={v} onChange={e=>setReferenceValues(values=>values.map((old,j)=>j===i?e.target.value:old))}/></label>)}</div>
    {reference&&referenceValues.some(v=>!v.trim()||!Number.isFinite(Number(v))||Number(v)<-1||Number(v)>1)&&<p role="alert">参考线需为 −1 至 1 的有限数值；无效输入对应的线暂不显示。</p>}
    {report.period.end-report.period.start<selected.window_seconds&&<p className="note" data-testid="mapopt-short-record">所选记录范围不足 {windowLabel(selected.window_seconds)}，无法形成完整 COx 窗口；不缩短窗口或补数据，因此当前窗口无法估计 MAPopt。</p>}
    <Chart option={option} height={365} renderer="svg"/>
    <p className="caption">圆点：MAP箱内均值；误差线：±1箱内标准差，表示离散程度，不是置信区间。浅色箱支持不足5分钟（工程提示）；全部非空箱保留。{report.method==='windows'?'曲线拟合全部有效窗口散点，分箱宽度只影响汇总显示。':'曲线拟合分箱均值，各非空箱等权。'}</p>
    <div className={'mapopt-verdict '+(selected.fit.mapopt===null?'unavailable':'available')} data-testid="mapopt-verdict">
     <strong>{selected.fit.mapopt===null?'当前数据无法给出有效 MAPopt 估计':`MAPopt 估计：${fmt(selected.fit.mapopt,1)} mmHg`}</strong>
     {selected.fit.reasons.length>0&&<ul>{selected.fit.reasons.map(r=><li key={r}>{reasons[r]??r}</li>)}</ul>}
     {selected.fit.mapopt!==null&&<p>拟合最低 COx = {fmt(selected.fit.minimum_cox,3)}；该值只描述这段观测与当前方法，不是已验证的最佳调节状态或治疗目标。</p>}
    </div>
    <details className="mapopt-details"><summary>拟合数字、规则与解释</summary>
     <p>COx = a·MAP² + b·MAP + c；a &gt; 0 时，顶点 MAP = −b/(2a)。</p>
     {selected.fit.coefficients&&<p className="formula">a = {selected.fit.coefficients.a.toPrecision(7)}；b = {selected.fit.coefficients.b.toPrecision(7)}；c = {selected.fit.coefficients.c.toPrecision(7)}<br/>R² = {fmt(selected.fit.r_squared,4)}；RMSE = {fmt(selected.fit.rmse,4)}；数学顶点 = {fmt(selected.fit.vertex,3)} mmHg（不等于已接受估计）</p>}
     <p>{selected.fit_points} 个拟合点；{selected.excluded_outputs} 个无效输出未纳入；{selected.cross_boundary_outputs} 个跨边界窗口未纳入。x使用与COx相同合格配对的窗口平均MAP，不用窗口终点的单次血压。</p>
     <p>本工具的工程检查：MAP必须为正、至少5个拟合点及5个不同MAP坐标、曲线开口向上、R²≥0.20、顶点位于拟合MAP范围内部、最低COx在−1至1。通过这些检查仍不等于临床验证；长缺口、单侧缺失和质量门槛不会为获得曲线而放宽。</p>
     <p>相邻COx窗口高度重叠，点数不是独立样本量。支持时长只累加每次输出的步长支持，不累加整个窗口；不计算独立样本置信区间。整日汇总可能掩盖麻醉、通气或病情变化，MAPopt会随分箱和窗口而变化。</p>
     <p>参考线默认 +0.30、−0.30，可修改或关闭；仅影响图示，不改变拟合，也不据此推导LLA/ULA。方法参考：<a href="https://link.springer.com/article/10.1007/s10877-023-01115-0" target="_blank" rel="noreferrer">2024年择期神经外科研究</a>使用分箱及二次拟合，并有额外质量限制；本工具不是其算法完整复现。</p>
    </details>
    <details className="mapopt-details"><summary>分箱数据与支持时长</summary><div className="table-scroll"><table><thead><tr><th>MAP箱 / mmHg</th><th>平均MAP</th><th>平均COx</th><th>标准差</th><th>输出数</th><th>支持 / min</th></tr></thead><tbody>{selected.bins.map(b=><tr key={b.map_low}><td>{b.map_low}–{b.map_high}</td><td>{fmt(b.mean_map,3)}</td><td>{fmt(b.mean_cox,4)}</td><td>{fmt(b.sd_cox,4)}</td><td>{b.outputs}</td><td>{fmt(b.support_seconds/60,2)}</td></tr>)}</tbody></table></div></details>
   </>}
   {report.skipped_window_seconds.length>0&&<p>以下窗口与当前块宽/步长不兼容：{report.skipped_window_seconds.map(windowLabel).join('、')}。未更改质量参数。</p>}
   {!demo&&<a className="mapopt-download" href={'/api'+url+'&download=true'} onClick={e=>{e.preventDefault();void downloadApi(url+'&download=true').catch(error=>setError(error.message));}} download>下载拟合结果与全部输入点（JSON）</a>}
  </>}
 </section>;
}
