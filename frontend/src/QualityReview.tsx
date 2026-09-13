import {useContext,useEffect,useState,type ReactNode} from 'react';
import {ArrowRight,Search} from 'lucide-react';
import {Chart,base} from './Chart';
import {type Channel,type Run,names,reasonNames,fmt} from './types';
import {QualityNumbers,QualityPolicy} from './QualityDetails';
import {TimeContext,timeLabel,timeAxisName} from './TimeDisplay';

const channels=['map','left','right'] as const;
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const reasons=(flags:string[])=>flags.map(f=>reasonNames[f]||f).join('、')||'无额外质量提示';

export function QualityReview({run,real,onInspect,onUseRange,onContinue,children,dirty,busy,processed,onProcess,onCompare,onBlockDetails}:{
 run:Run|null;real:boolean;onInspect:(start:number,end:number)=>void;
 onUseRange:(start:number,end:number,channel:Channel)=>void;onContinue:()=>void;children:ReactNode;
 dirty:boolean;busy:boolean;processed:boolean;onProcess:()=>void;onCompare:()=>void;onBlockDetails:(index:number)=>void;
}){
 const time=useContext(TimeContext);
 const [selection,setSelection]=useState<{index:number;channel:typeof channels[number]}|null>(null);
 const [manualOpen,setManualOpen]=useState(false);
 useEffect(()=>{setSelection(null);setManualOpen(false);},[run?.run_id]);
 const selected=selection&&run?.blocks[selection.index];
 function inspect(index:number,channel:typeof channels[number]){
  const block=run?.blocks[index];if(!block)return;
  setSelection({index,channel});onInspect(block.start,block.end);
 }
 function nextInvalid(){
  if(!run)return;
  const after=selection?.index??-1;
  const index=run.blocks.findIndex((b,i)=>i>after&&channels.some(k=>!b[k].valid));
  const found=index<0?run.blocks.findIndex(b=>channels.some(k=>!b[k].valid)):index;
  if(found>=0)inspect(found,channels.find(k=>!run.blocks[found][k].valid)!);
 }
 const option={...base,
  aria:{enabled:true,label:{description:'质量时间带：点击一个色块查看该通道在这段时间的质量原因'}},
  grid:{left:75,right:28,top:20,bottom:45},
  // Item triggering prevents a categorical Y row from expanding thousands of time blocks.
  tooltip:{trigger:'item',confine:true,axisPointer:{type:'none'},className:'quality-tooltip',
   extraCssText:'max-width:300px;white-space:normal;line-height:1.7;',
   formatter:(p:any)=>{
    if(!p?.data)return '';
    const b=run?.blocks[p.data.blockIndex];const ch=p.data.channel as typeof channels[number];
    if(!b||!channels.includes(ch))return '';
    const q=b[ch];return `<strong>${names[ch]} · ${q.valid?'合格':'不合格'}</strong><br/>${timeLabel(b.start/60,time)}–${timeLabel(b.end/60,time)}（${timeAxisName(time)}）<br/>有效观测覆盖 ${fmt(q.coverage*100,1)}%：支持 ${fmt(q.coverage*run!.config.block_seconds,2)} / ${run!.config.block_seconds} 秒<br/>${q.count} 个合格观测 · 覆盖要求 ≥${fmt(run!.config.min_block_coverage*100,0)}%<br/>${escape(reasons(q.flags))}<br/><span style="color:#81949e">点击查看具体原因并定位原始图</span>`;
   }},
  xAxis:{...base.xAxis},
  yAxis:{type:'category',data:['MAP','左侧脑氧','右侧脑氧'],axisPointer:{show:false}},
  series:channels.map((channel,i)=>({name:names[channel],type:'scatter',symbol:'rect',symbolSize:[4,15],
   data:run?.blocks.map((b,blockIndex)=>({value:[(b.start+b.end)/120,i],blockIndex,channel,
    itemStyle:{color:b[channel].valid?'#7eb0aa':'#d7c0aa'}}))}))};
 return <section className="card quality-review" data-testid="quality-review">
  <div className="section-title"><div><h2>先查看质量，人工排除是可选操作</h2><p>系统已按当前规则判断每个时间块。你要做的是理解原因，并对照原始信号检查。</p></div></div>

  <div className="quality-tools"><button className="outline" onClick={()=>document.querySelector('.signal-card')?.scrollIntoView({behavior:'smooth',block:'start'})}>同屏对照原始图</button><span><i className="quality-key valid"/>青色：合格 <i className="quality-key invalid"/>浅棕：不合格</span>
   <button className="outline" disabled={!run||!run.blocks.some(b=>channels.some(k=>!b[k].valid))} onClick={nextInvalid}><Search size={15}/>{selection?'查看下一段不合格数据':'查看不合格片段'}</button></div>
  {run?<Chart option={option} height={190} group="car-time" showRange onClick={p=>{if(p.data?.blockIndex!==undefined)inspect(p.data.blockIndex,p.data.channel);}}/>:<p>先运行一次分析，系统就会生成质量时间带。</p>}
  {selected&&selection?<div className="quality-selection" data-testid="quality-selection">
   <div className="section-title"><h3>正在查看 {selected.start}–{selected.end} 秒 · {names[selection.channel]}</h3><span>上方原始图已定位到附近</span></div>
   <p>{timeAxisName(time)}：{timeLabel(selected.start/60,time)} – {timeLabel(selected.end/60,time)}</p>
   <div className="quality-channel-cards">{channels.map(k=><QualityNumbers key={k} channel={k} value={selected[k]} run={run!}/>)}</div>
   <p>浅棕色不代表你必须删除这段。系统已在计算中按规则处理不合格块；低血压或低脑氧数值本身也不是人工排除的理由。</p>
   <button className="outline" onClick={()=>document.querySelector('.signal-card')?.scrollIntoView({behavior:'smooth',block:'start'})}>查看原始图中的这段时间</button>{' '}
   <button className="outline" onClick={()=>onBlockDetails(selection.index)}>查看这个块的原始观测表</button>{' '}
   {real&&<button className="outline" onClick={()=>{onUseRange(selected.start,selected.end,selection.channel);setManualOpen(true);}}>用这段时间填写排除表（尚未保存）</button>}
  </div>:<p className="quality-hint">先点一个色块查看原因；仅悬停会显示这一块的简短信息，不会修改数据。</p>}
  <ol className="quality-steps">
   <li><strong>选一段时间</strong><span>点击下方色块，或用“查看不合格片段”。每个色块对应一个时间块。</span></li>
   <li><strong>看原因、对照原始图</strong><span>原始图会定位到附近，下方缩放保持。覆盖看有效时长，观测看测量次数，两者都需检查。</span></li>
   <li><strong>决定是否需要排除</strong><span>只有确认是伪差才添加排除。不确定时先保留，也可以不作标记直接继续。</span></li>
  </ol>
  <details className="quality-definitions"><summary>覆盖不足与观测不足有什么区别？</summary><p>“观测”是设备实际记录的一次测量。计数只统计本块内合格的原始点，至少需要 1 个；没有固定要求每块一定有 2 个或 5 个。</p><p>“覆盖”是这些有效记录按采样间隔能支持的时间，占整块时长的比例。每个点最多支持到下一条记录或一个名义间隔，以更早者为准；还会扣除排除段，并在记录末尾停止，不把长间断当作一直有数据。</p><p>例如：10 秒块里有 2 次脑氧测量，但它们的时间支持合计仅 6.2 秒，则覆盖为 62%；在 80% 要求下，需要至少 8 秒，因此仍不合格。测量次数足够不代表时间分布足够。前一块的支持可以延伸进本块，但前一块的值不算本块均值样本。</p></details>
  {run&&<QualityPolicy run={run} dirty={dirty} busy={busy} processed={processed} onProcess={onProcess} onCompare={onCompare}/>}
  {real?<details className="quality-manual" open={manualOpen} onToggle={e=>setManualOpen(e.currentTarget.open)}>
   <summary>可选：我已确认伪差，添加人工排除或查看已有标记</summary>
   <p>填写起止秒数、选择实际受影响的通道并说明原因，然后点击“添加排除”。也可以在上方原始图右上角选择横向框选工具，拖出时间段后填写。保存标记后，需点击“重新计算”才会影响结果；可撤销。</p>
   {children}
  </details>:<p className="caption">合成实验用场景生成缺失与尖峰；人工标记用于真实病例。</p>}
  <div className="quality-continue"><span>没有确认需要排除的片段？保留数据即可。</span><button className="primary" onClick={onContinue}>继续到第 3 步：做时间平均 <ArrowRight size={15}/></button></div>
 </section>;
}
