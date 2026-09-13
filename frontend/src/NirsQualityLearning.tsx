import {useState} from 'react';
import {type Config} from './types';

export function NirsQualityLearning({config,dirty,busy,onChange,onApply}:{config:Config;dirty:boolean;busy:boolean;onChange:(patch:Partial<Config>)=>void;onApply:()=>void}){
 const [expanded,setExpanded]=useState(false);
 const valid=Number.isFinite(config.nirs_range_low)&&Number.isFinite(config.nirs_range_high)&&0<=config.nirs_range_low&&config.nirs_range_low<config.nirs_range_high&&config.nirs_range_high<=100;
 return <section className="card nirs-quality-learning" data-testid="nirs-quality-learning">
  <div className="section-title"><div><h2>学习 NIRS 数值质控</h2><p>左右脑氧分别检查 · 允许范围 {config.nirs_range_low}–{config.nirs_range_high}%（含边界） · {config.nirs_quality_enabled?(config.nirs_range_action==='exclude'?'超界排除':'超界仅复核'):'范围规则未启用'}{dirty?' · 有待重算修改':''}</p></div><button className="outline" aria-expanded={expanded} aria-controls="nirs-quality-content" onClick={()=>setExpanded(v=>!v)}>{expanded?'收起 NIRS 质控学习':'展开 NIRS 质控学习'}</button></div>
  <div id="nirs-quality-content" hidden={!expanded}>
   <p>15–95% 是本学习工具的可调数值范围预设，不是生理正常范围或安全阈值。应按设备、传感器和导出说明设置，不能用“正常范围”筛掉真实低脑氧时段。</p>
   <div className="map-quality-controls">
    <label><span>启用范围规则</span><input aria-label="启用NIRS范围质控" type="checkbox" checked={config.nirs_quality_enabled} onChange={e=>onChange({nirs_quality_enabled:e.target.checked})}/></label>
    <label>下限 / %<input aria-label="NIRS范围下限" type="number" min="0" max="100" value={config.nirs_range_low} onChange={e=>onChange({nirs_range_low:Number(e.target.value)})}/></label>
    <label>上限 / %<input aria-label="NIRS范围上限" type="number" min="0" max="100" value={config.nirs_range_high} onChange={e=>onChange({nirs_range_high:Number(e.target.value)})}/></label>
    <label>超出范围时<select aria-label="NIRS超界处理" value={config.nirs_range_action} onChange={e=>onChange({nirs_range_action:e.target.value as Config['nirs_range_action']})}><option value="exclude">标为无效，清洗值设 NaN</option><option value="review">仅提示复核，保留数值</option></select></label>
    <button className="outline" onClick={()=>onChange({nirs_quality_enabled:true,nirs_range_low:15,nirs_range_high:95,nirs_range_action:'exclude'})}>恢复 NIRS 默认规则</button>
   </div>
   {!valid&&<p role="alert">NIRS范围需满足：0 ≤ 下限 &lt; 上限 ≤ 100%。</p>}
   <div className="table-scroll"><table><thead><tr><th>数值或情况</th><th>处理方式</th></tr></thead><tbody>
    <tr><td>缺失、非数值、来源无效、时间冲突、已应用人工排除</td><td>无效，NIRS_clean = NaN；保留原记录及原因。</td></tr>
    <tr><td>低于 {config.nirs_range_low}% 或高于 {config.nirs_range_high}%</td><td>{!config.nirs_quality_enabled?'当前关闭范围规则；其他质控仍执行。':config.nirs_range_action==='exclude'?'按范围规则排除，NIRS_clean = NaN。':'只增加超界提示，范围规则本身不排除。'}</td></tr>
    <tr><td>{config.nirs_range_low} ≤ NIRS ≤ {config.nirs_range_high}</td><td>通过范围检查；仍需检查来源质量、覆盖、跳变等。</td></tr>
    <tr><td>达到候选上限或出现平台</td><td>原有候选上限提示独立运行，边界值不因本范围规则被排除；若启用“自动排除可疑点”，仍按该探索规则执行。</td></tr>
   </tbody></table></div>
   <p>左右通道独立处理；保留 NIRS_raw、NIRS_clean 和 quality_flag。不截成 15 或 95，不插值，不将左右坏点合并排除。COx 和 MAPopt 随合格时间块更新；点质量合格不保证所在时间块覆盖足够。</p>
   <button className="primary" disabled={busy||!valid} onClick={onApply}>应用 NIRS 质控并重算</button>
   {dirty&&<p className="note">参数尚未应用；下方统计仍对应上次运行，重算后更新。此按钮会同时应用当前待计算的其他参数与标记。</p>}
  </div>
 </section>;
}
