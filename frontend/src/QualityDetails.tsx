import {type BlockValue,type Run,names,reasonNames,fmt} from './types';

export function nominalInterval(run:Run,channel:'map'|'left'|'right'){
 const n=Number(run.manifest.case?.tracks?.[channel]?.nominal_interval);
 return Number.isFinite(n)&&n>0?n:channel==='map'?2:5;
}
export function QualityNumbers({value:q,run,channel}:{value:BlockValue;run:Run;channel:'map'|'left'|'right'}){
 const B=run.config.block_seconds,N=nominalInterval(run,channel),required=B*run.config.min_block_coverage;
 const notes:Record<string,string>={
  nirs_below_range:`NIRS低于本次允许下限 ${run.config.nirs_range_low}%；${run.config.nirs_range_action==='exclude'?'按范围规则设为NaN':'仅作复核提示，不因范围本身排除'}。`,
  nirs_above_range:`NIRS高于本次允许上限 ${run.config.nirs_range_high}%；${run.config.nirs_range_action==='exclude'?'按范围规则设为NaN':'仅作复核提示，不因范围本身排除'}。`,
  map_negative:'MAP小于0，清洗值设为NaN；核查单位、零点或导出错误。',
  map_zero_review:'MAP等于0，仅重点复核，不凭数值自动排除；结合断线、调零或心搏骤停等事件记录判断。',
  map_low_review:`MAP大于0且低于${run.config.map_review_low} mmHg；保留原值，结合波形与事件复核。`,
  map_high_review:`MAP高于${run.config.map_review_high} mmHg；保留原值，检查冲管、单位或字段错误。`,
  device_error_code:'原值命中本次运行明确配置的设备错误码，清洗值设为NaN。',
  source_invalid:'来源将该记录标为无效，清洗值设为NaN；本工具不推测缺失的设备标志。',
  coverage_insufficient:`有效记录仅支持 ${fmt(q.coverage*B,2)} 秒，少于要求的 ${fmt(required,2)} 秒。测量时间集中或记录间断都可能造成不足。`,
  no_observations:'这个块内没有合格测量值（可能没有记录，或记录已被排除），无法计算块均值。即使前一块的记录支持延伸到这里，也不能替代块内测量值。',
  long_gap:`最长连续未覆盖 ${fmt(q.max_uncovered_seconds,2)} 秒，超过该通道允许的一个名义间隔 ${N} 秒。`,
  range_boundary:'这个块没有完整落在所选分析范围内；首尾残块不能当作完整时间块。',
  nonfinite:'块内存在空值、NaN 或无穷值；这些点不进入均值与覆盖计算，剩余点仍按块规则判断。',
  timestamp_conflict:'同一时间戳出现不同数值；冲突点不能确定哪一个可信，已从计算中排除。',
  manual_exclusion:'人工标记与本块相交；启用标记时，相应点和支持时长已扣除，剩余部分仍按块规则判断。',
  jump_suspect:`相邻记录变化超过 ${channel==='map'?run.config.jump_map:run.config.jump_rso2} ${channel==='map'?'mmHg':'百分点'}。只是可疑提示，需结合原始信号确认。`,
  ceiling_candidate:`脑氧达到候选上限 ${run.config.ceiling_value}%；不能仅凭此断言设备截断。`,
  flat_suspect:'块内至少两个合格值近乎相同。平坦是提示，不等于已确认伪差；若整个相关窗口零方差，COx 才无法定义。',
  extreme_suspect:'出现百分数范围之外的数值；需核对设备与记录含义。',
 };
 return <div className="quality-number-card">
  <strong>{names[channel]} · {q.valid?'合格':'不合格'}</strong>
  <span>有效观测：{q.count} 个 · 块内至少需要 1 个</span>
  <span>时间覆盖：{fmt(q.coverage*100,1)}%（{fmt(q.coverage*B,2)} / {B} 秒）</span>
  <div className="coverage-meter" aria-hidden="true"><i style={{width:`${q.coverage*100}%`}}/><b style={{left:`${run.config.min_block_coverage*100}%`}}/></div>
  <small>覆盖要求 ≥{fmt(run.config.min_block_coverage*100,0)}%（{fmt(required,2)} 秒）；竖线为要求</small>
  <span>最长未覆盖：{fmt(q.max_uncovered_seconds,2)} 秒 · 允许 ≤{N} 秒</span>
  <ul>{q.flags.length?q.flags.map(f=><li key={f}><b>{reasonNames[f]||f}：</b>{notes[f]||'请对照原始记录核查。'}</li>):<li>上述条件均通过，无额外质量提示。</li>}</ul>
 </div>;
}

export function QualityPolicy({run,dirty,busy,processed,onProcess,onCompare}:{run:Run;dirty:boolean;busy:boolean;processed:boolean;onProcess:()=>void;onCompare:()=>void}){
 const N=run.config.window_seconds/run.config.block_seconds;
 const required=run.config.sensitivity?Math.max(2,Math.ceil(N*run.config.min_pair_ratio)):N;
 return <section className="quality-policy" data-testid="quality-policy">
  <h3>一键处理：按规则跳过不合格块，保留时间缺口</h3>
  <p>每次分析已自动执行这项处理。此按钮会按当前参数与“应用人工排除”开关重新计算，并显示处理结果；不会删除原始记录、填补缺失或自动降低要求。可疑跳变等是否排除，仍遵循参数中的探索开关。</p>
  <button className="primary" disabled={busy} onClick={onProcess}>{busy?'正在处理…':'一键按当前规则处理并重算'}</button>
  {dirty&&<p className="note">参数或标记有未计算的修改。下列统计属于上一次运行，点击处理后更新。</p>}
  {processed&&!dirty&&<p className="quality-processed" role="status">处理完成：原始数据保留，已按当前规则重算。相同数据与规则会复用同一可追溯运行。</p>}
  <details open={processed&&!dirty}><summary>当前运行的处理结果与可计算时长</summary>
   <div className="quality-channel-cards">{(['map','left','right'] as const).map(k=><div key={k}><strong>{names[k]}</strong><span>不合格 {run.blocks.filter(b=>!b[k].valid).length} / {run.blocks.length} 块</span><small>该通道的不合格块不参加 COx 配对</small></div>)}</div>
   <div className="table-scroll"><table><thead><tr><th>COx 侧别</th><th>有效输出</th><th>可计算时长</th><th>无结果时长</th></tr></thead><tbody>{(['left','right'] as const).map(k=>run.summary[k]&&<tr key={k}><td>{names[k]}</td><td>{run.summary[k].valid_outputs}</td><td>{fmt(run.summary[k].computable_seconds/60,2)} min</td><td>{fmt(run.summary[k].no_result_seconds/60,2)} min</td></tr>)}</tbody></table></div>
   <p>当前为{run.config.sensitivity?'探索性放宽':'严格'}模式：每 {run.config.window_seconds} 秒窗口至少需要 {required}/{N} 个同一时段的 MAP–脑氧合格配对，且两条序列均有非零变异。不满足则保留 null。删除坏块不会凭空增加配对，也不能把缺口两侧拼成连续窗口。</p>
  </details>
  <details className="quality-methods"><summary>处理后还能计算 CAR 吗？真实世界数据通常怎么处理？</summary>
   <p>这里计算的是辅助研究脑血流自动调节（CAR）的 COx。通过质量与数学条件表示“可以按本方法计算”，不等于临床有效性已经验证。</p>
   <ol><li>先核对时间同步、采样间隔、传感器脱落、冲管或采血等记录；自动规则筛查后人工复核伪差。低血压或低脑氧本身不是伪差。</li><li>按预先设定的方法排除不可信点或受影响窗口，保留原始数据、原因和缺失时段。不同研究对缺失和伪差的规则并不完全相同。</li><li>在足够长的有效片段计算，报告每侧排除比例、有效时长及不可计算窗口。数据不足时保留无结果，不能为了得到数值反复调整门槛。</li><li>插值需要特定方法依据、缺口长度限制和验证，可能改变相关性；本工具不插值。若比较放宽配对，应作为显式敏感性分析，并与严格结果对照。</li></ol>
   <p>本工具的 {fmt(run.config.min_block_coverage*100,0)}% 块覆盖、最长缺口及 {required}/{N} 配对要求是当前工程规则，并非适用于所有研究的统一临床标准。</p>
   <p className="caption">方法参考：<a href="https://www.nature.com/articles/s41597-022-01411-5" target="_blank" rel="noreferrer">VitalDB 原始数据与噪声说明</a>；<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC10453436/" target="_blank" rel="noreferrer">COx 研究中的缺失与伪差处理（早产儿研究，规则不直接套用成人）</a>；<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC9448724/" target="_blank" rel="noreferrer">伪差对相关指标的影响（PRx 研究，非 COx 验证）</a>。</p>
   <button className="outline" onClick={onCompare}>到第 6 步比较严格与探索规则</button>
  </details>
 </section>;
}
