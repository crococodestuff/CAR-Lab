import {useEffect,useState} from 'react';

type SourceName='ingest'|'quality'|'aggregate'|'cox'|'config'|'mapopt'|'analysis'|'stratify'|'raw_summary';
const descriptions:Record<SourceName,[string,string]>={
 ingest:['原始数据规范化','清理非有限时间、排序、去重与时间戳冲突处理。'],
 quality:['MAP / NIRS 逐点质控','mark_quality：MAP 数值、左右 NIRS 范围、可疑点和人工排除；保留 raw，生成 clean 与标志。'],
 aggregate:['时间平均与覆盖检查','aggregate_track：按真实时间分块，计算有效支持、最长缺口及合格观测算术平均。'],
 cox:['滑动窗口 COx','rolling_cox：固定向后窗口、左右独立配对、Pearson 相关与 null 原因。'],
 config:['参数约束与配对门槛','AnalysisConfig：默认参数、时间整倍数约束；required_pairs 定义严格/放宽门槛。'],
 mapopt:['MAPopt 二次拟合','analyze_mapopt 重算各窗口；summarize 汇总 COx 与同窗 MAP；quadratic_fit 拟合并核查顶点。'],
 analysis:['计算流程与 A/B 比较','analyze 串联质控、平均和 COx；compare_runs 按共同有效支持时长比较。'],
 stratify:['MAP 分箱','stratify：按同窗平均 MAP 分组并汇总 COx 和支持时长。'],
 raw_summary:['原始概况与质控前后统计','原始和清洗后点数、范围、均值、样本标准差；与时间覆盖分开统计。'],
};
const stageSources:SourceName[][]=[['ingest','raw_summary'],['quality','aggregate','raw_summary'],['aggregate','quality'],['cox','config'],['cox','config'],['analysis','stratify','cox'],['mapopt','cox','config']];
export function CalculationSource({step}:{step:number}){
 const available=stageSources[step];
 const [open,setOpen]=useState(false),[selected,setSelected]=useState<SourceName>(available[0]);
 const [sources,setSources]=useState<Partial<Record<SourceName,string>>>({}),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 useEffect(()=>{if(!open)return;let active=true;import('./coreSources').then(module=>{if(active)setSources(module.sources);}).catch(()=>{if(active)setError('源码暂未载入，请刷新页面后重试。');});return()=>{active=false;};},[open]);
 const code=sources[selected];
 return <details className="card calculation-source" data-testid="calculation-source" open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary>本步计算源码 · Python（展开查看）</summary>
  {open&&<>
   <p>下方直接展示随本页面构建的正式内核源码，供阅读，不会执行或修改数据。本地服务与浏览器计算共用该内核；历史运行可能来自旧版代码，复现时需核对导出清单中的源码指纹。</p>
   <div className="source-controls"><label>计算环节<select aria-label="计算源码文件" value={selected} onChange={e=>{setSelected(e.target.value as SourceName);setCopied(false);}}>{available.map(name=><option key={name} value={name}>{descriptions[name][0]}</option>)}</select></label><code data-testid="source-filename">backend/car_core/{selected}.py</code><button className="outline" disabled={code===undefined} onClick={()=>{navigator.clipboard.writeText(code!).then(()=>setCopied(true)).catch(()=>setError('复制未成功，可直接选择代码文本复制。'));}}>{copied?'已复制':'复制源码'}</button></div>
   <p className="source-entry">{descriptions[selected][1]}</p>
   {error&&<p role="status">{error}</p>}
   {code===undefined?<p role="status">正在载入源码…</p>:<pre tabIndex={0} aria-label={`${selected}.py 源码`}><code>{code}</code></pre>}
  </>}
 </details>;
}
