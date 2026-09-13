import {names,fmt,type Channel} from './types';
export interface SignalSampling {raw_points:number;display_points:number;nominal_interval:number;interval_seconds?:{median:number;p95:number;max:number}|null;}
export function SamplingInfo({sampling,full,busy,onToggle}:{sampling:Partial<Record<Channel,SignalSampling>>;full:boolean;busy:boolean;onToggle:()=>void}){
 return <div className="sampling-info">
  <div className="sampling-actions"><span>{full?'完整原始点：保留每个记录时间戳，未插值':'全程概览：显示点可能抽稀，放大不会自动补回原始点'}</span><button className="outline" disabled={busy} onClick={onToggle}>{full?'切回抽稀概览':'查看完整原始点'}</button></div>
  <details><summary>实际记录频率与显示点数（不是 10 秒平均）</summary><p>本工具使用设备输出的数值轨道。名义间隔是设备记录说明，实际间隔可能不均匀；10 秒是后续分析块长，不是原始采样周期。完整原始点模式也不会把信号重采样成 1 Hz。</p>
   <div className="table-scroll"><table><thead><tr><th>通道</th><th>名义记录间隔 / 频率</th><th>实际间隔中位数</th><th>95%间隔不超过</th><th>最长间隔</th><th>显示 / 范围内原始点</th></tr></thead><tbody>{(['map','left','right'] as const).map(k=>{const s=sampling[k];return s&&<tr key={k}><td>{names[k]}</td><td>{fmt(s.nominal_interval,1)} s / {fmt(1/s.nominal_interval,2)} Hz</td><td>{fmt(s.interval_seconds?.median,2)} s</td><td>{fmt(s.interval_seconds?.p95,2)} s</td><td>{fmt(s.interval_seconds?.max,2)} s</td><td>{s.display_points} / {s.raw_points}</td></tr>;})}</tbody></table></div><p className="caption">间隔统计来自整条原始轨道；点数对应本次分析范围。合成轨道没有设备实测间隔统计时显示“—”。切换显示不改变计算、质量标记或导出。</p>
  </details>
 </div>;
}
