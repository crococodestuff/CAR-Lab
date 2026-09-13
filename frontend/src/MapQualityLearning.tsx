import {downloadApi} from './api';
import {useState} from 'react';
import {type Config,type Run,defaults} from './types';

export function MapQualityLearning({config,run,dirty,busy,onChange,onApply}:{config:Config;run:Run|null;dirty:boolean;busy:boolean;onChange:(patch:Partial<Config>)=>void;onApply:()=>void}){
 const [code,setCode]=useState(''),[expanded,setExpanded]=useState(false);
 const valid=Number.isFinite(config.map_review_low)&&Number.isFinite(config.map_review_high)&&config.map_review_low>0&&config.map_review_high>config.map_review_low;
 const codeValid=code.trim()!==''&&Number.isFinite(Number(code));
 const [downloadError,setDownloadError]=useState('');
 return <section className="card map-quality-learning" data-testid="map-quality-learning">
  <div className="section-title"><div><h2>学习 MAP 数值质控</h2><p>{expanded?'先区分无效记录和需要复核的真实极端值，再检查覆盖、跳变与波形质量。':`复核界限 ${config.map_review_low}–${config.map_review_high} mmHg · 展开可调整参数与查看规则`}{dirty?' · 有待重算修改':''}</p></div><button className="outline" aria-expanded={expanded} aria-controls="map-quality-content" onClick={()=>setExpanded(v=>!v)}>{expanded?'收起 MAP 质控学习':'展开 MAP 质控学习'}</button></div>
  {downloadError&&<p role="alert">{downloadError}</p>}<div id="map-quality-content" hidden={!expanded}>
  <div className="map-quality-controls">
   <label>极端低值复核界限<input aria-label="MAP低值复核界限" type="number" min="0.01" step="1" value={config.map_review_low} onChange={e=>onChange({map_review_low:Number(e.target.value)})}/></label>
   <label>极端高值复核界限<input aria-label="MAP高值复核界限" type="number" min="0.01" step="1" value={config.map_review_high} onChange={e=>onChange({map_review_high:Number(e.target.value)})}/></label>
   <button className="outline" onClick={()=>{setCode('');onChange({map_quality_enabled:true,map_review_low:defaults.map_review_low,map_review_high:defaults.map_review_high,map_error_codes:[]});}}>恢复 MAP 默认规则</button>
  </div>
  {!valid&&<p role="alert">复核界限需满足：0 &lt; 下限 &lt; 上限。</p>}
  <div className="table-scroll"><table><thead><tr><th>数值或情况</th><th>处理与解释</th></tr></thead><tbody>
   <tr><td>缺失、非数值、明确错误码或来源无效标志</td><td>无效，MAP_clean = NaN；来源没有提供的设备标志不作推测。</td></tr>
   <tr><td>MAP &lt; 0</td><td>无效，MAP_clean = NaN；检查单位、零点或导出错误。</td></tr>
   <tr><td>MAP = 0</td><td>重点复核并保留数值；可能是断线或调零，涉及心搏骤停时不能仅凭数值判断。</td></tr>
   <tr><td>0 &lt; MAP &lt; {config.map_review_low}</td><td>极端低值提示，保留数值；结合波形和事件记录复核。</td></tr>
   <tr><td>{config.map_review_low} ≤ MAP ≤ {config.map_review_high}</td><td>通过数值范围检查；不代表信号质量已合格，继续检查覆盖等条件。</td></tr>
   <tr><td>MAP &gt; {config.map_review_high}</td><td>极端高值提示，保留数值；检查冲管、单位和字段错误。</td></tr>
  </tbody></table></div>
  <details><summary>配置已核实的设备数值错误码（默认无）</summary>
   <p>仅按当前来源的设备或导出说明填写。命中这些值会直接排除；不能把正常范围边界当作错误码。</p>
   <div className="map-error-controls"><label>新增错误码<input aria-label="MAP设备错误码" type="number" value={code} onChange={e=>setCode(e.target.value)}/></label><button disabled={!codeValid} onClick={()=>{onChange({map_error_codes:[...new Set([...config.map_error_codes,Number(code)])]});setCode('');}}>添加错误码</button></div>
   <div className="map-error-codes">{config.map_error_codes.length?config.map_error_codes.map(v=><button key={v} aria-label={`移除MAP错误码 ${v}`} onClick={()=>onChange({map_error_codes:config.map_error_codes.filter(c=>c!==v)})}>{v} ×</button>):<span>未配置错误码</span>}</div>
  </details>
  <p>保留 MAP_raw、MAP_clean 和 quality_flag。确认伪差后，在下方人工排除区选择 MAP 并标记时间段；应用后清洗值为 NaN。零值、极端高低值提示本身不会删除记录，也不会将数值截成界限值。其他排除规则仍按当前配置执行。</p>
  <p>COx 使用清洗值生成的合格块；MAPopt 使用这些 COx 与同窗合格 MAP 均值。保留真实缺口，不插值；配对或变异不足时仍无结果。</p>
  {!config.map_quality_enabled&&<p className="note">当前是历史数值规则。<button onClick={()=>onChange({map_quality_enabled:true})}>启用上述 MAP 规则</button></p>}
  <button className="primary" disabled={busy||!valid||!config.map_quality_enabled} onClick={onApply}>应用 MAP 质控并重算</button>
  {dirty&&<p className="note">上述参数尚未应用；图表、统计和下载仍对应上一次运行。重算后更新。</p>}
  {run?.map_quality?<p className="caption" data-testid="map-quality-summary">已保存运行：{run.map_quality.rows} 个 MAP 观测，排除 {run.map_quality.invalid_points} 个，保留但需数值复核 {run.map_quality.review_points} 个。<a href={`/api/analyses/${run.run_id}/map-quality`} onClick={e=>{e.preventDefault();void downloadApi(`/analyses/${run.run_id}/map-quality`).catch(error=>setDownloadError(error.message));}} download>下载 MAP 原始值、清洗值与质量标记（CSV）</a>；完整报告 ZIP 也包含该表。</p>:run&&<p className="caption">历史运行没有 MAP 质控快照。重算会生成新运行，原记录与历史结果继续保留。</p>}
  </div>
 </section>;
}
