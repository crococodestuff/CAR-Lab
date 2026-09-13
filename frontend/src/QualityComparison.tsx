import {useContext} from 'react';
import {type Run,type QualityComparisonStats,names,reasonNames,fmt} from './types';
import {TimeContext,timeLabel,timeAxisName} from './TimeDisplay';

export function QualityComparison({run,stats,dirty}:{run:Run|null;stats?:QualityComparisonStats;dirty:boolean}){
 const time=useContext(TimeContext);
 return <section className="card quality-comparison" data-testid="quality-comparison">
  <div className="section-title"><div><h2>质量处理前后对照</h2><p>{run?`已保存运行 ${run.run_id.slice(0,8)} · ${timeLabel(run.range.start/60,time)}–${timeLabel(run.range.end/60,time)}（${timeAxisName(time)}） · 同一批完整观测，图表缩放不改变统计`:'完成分析或应用质量规则后，这里会展示处理前后概况。'}</p></div><span className="pill">原始值 → 点质控后</span></div>
  {dirty&&<p className="note" data-testid="quality-comparison-stale">参数或标记有未应用修改。当前对照仍属于上一次运行，请重算后查看新效果。</p>}
  {run&&!stats?<p role="status">正在读取当前运行的质量对照…</p>:stats&&run?<>
   <div className="quality-comparison-grid">{(['map','left','right'] as const).map(channel=>{
    const q=stats[channel],before=q.before,after=q.after;
    const range=(s:typeof before)=>s.minimum==null?'—':`${fmt(s.minimum,2)}–${fmt(s.maximum,2)}`;
    const goodBlocks=run.blocks.filter(b=>b[channel].valid).length;
    return <article key={channel} data-testid={`quality-comparison-${channel}`}><h3>{names[channel]} <small>{channel==='map'?'mmHg':'%'}</small></h3>
     <div className="table-scroll"><table><thead><tr><th>指标</th><th>处理前</th><th>处理后</th></tr></thead><tbody>
      <tr><th>观测点数</th><td data-testid="before-count">{before.observations.toLocaleString()}</td><td data-testid="after-count">{after.observations.toLocaleString()}</td></tr>
      <tr><th>可统计有限值</th><td>{before.finite_observations.toLocaleString()}</td><td>{after.finite_observations.toLocaleString()}</td></tr>
      <tr><th>最小–最大值</th><td data-testid="before-range">{range(before)}</td><td data-testid="after-range">{range(after)}</td></tr>
      <tr><th>均值</th><td>{fmt(before.mean,2)}</td><td data-testid="after-mean">{fmt(after.mean,2)}</td></tr>
      <tr><th>样本标准差</th><td>{fmt(before.sample_sd,2)}</td><td>{fmt(after.sample_sd,2)}</td></tr>
     </tbody></table></div>
     <p data-testid="excluded-count">排除 {q.excluded_points.toLocaleString()} 点（{q.excluded_fraction==null?'—':fmt(q.excluded_fraction*100,1)+'%'}） · 原始记录保留</p>
     <p>合格时间块 {goodBlocks}/{run.blocks.length} · {fmt(goodBlocks*run.config.block_seconds/60,2)} 分钟</p>
     <details><summary>查看被排除点的质量标记</summary>{q.excluded_points?<><ul>{Object.entries(q.excluded_flags).map(([flag,n])=><li key={flag}>{reasonNames[flag]||flag}：{n} 点</li>)}</ul><p>同一点可能带多个标记（包括伴随提示），各项不能相加作为排除总数。</p></>:<p>当前规则没有排除该通道的原始观测。</p>}</details>
    </article>;
   })}</div>
   <div className="quality-comparison-cox">{(['left','right'] as const).map(side=>run.summary[side]&&<p key={side}>{names[side]} COx：{run.summary[side].valid_outputs} 个有效输出 · 可计算 {fmt(run.summary[side].computable_seconds/60,2)} 分钟 · 无结果 {fmt(run.summary[side].no_result_seconds/60,2)} 分钟</p>)}</div>
   <p className="caption">处理前：同一分析范围内规范化原始观测，范围、均值和标准差只跳过非有限值。处理后：点质控保留的原值，不截断、不插值；不足两点时样本标准差为“—”。点数排除比例不是时间缺失比例。保留点所在的块仍可能覆盖不足，因此块质量与 COx 时长另列；统计变化也不等于信号质量已获验证。</p>
  </>:null}
 </section>;
}
