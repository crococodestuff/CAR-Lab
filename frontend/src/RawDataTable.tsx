import {useContext,useEffect,useMemo,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {type Channel,type Signals,names,reasonNames} from './types';
import {TimeContext,timeLabel,timeAxisName} from './TimeDisplay';

export interface RawSelection {channel:Channel;time:number;value:number|null;}
const pageSize=50;
const shortNames:Record<Channel,string>={map:'MAP',left:'左脑氧',right:'右脑氧',etco2:'EtCO₂',spo2:'SpO₂',hr:'心率'};
const units:Record<Channel,string>={map:'mmHg',left:'%',right:'%',etco2:'mmHg',spo2:'%',hr:'bpm'};
const same=(a:RawSelection,b:RawSelection)=>a.channel===b.channel&&Math.abs(a.time-b.time)<1e-6;

export function RawDataTable({runId,range,selection,hover,windowHover,onSelect,load}:{runId:string|null;range:[number,number]|null;selection:RawSelection|null;hover:RawSelection|null;windowHover?:{start:number;end:number;kind?:'block'}|null;onSelect:(row:RawSelection)=>void;load:(id:string,full:boolean)=>Promise<{signals:Signals}>}){
 const time=useContext(TimeContext);
 const [data,setData]=useState<{id:string;signals:Signals}|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [channel,setChannel]=useState<Channel|'all'>('all'),[page,setPage]=useState(0);
 const scroller=useRef<HTMLDivElement>(null);
 useEffect(()=>{let active=true;setError('');setData(null);setPage(0);
  if(runId)load(runId,true).then(result=>{if(active)setData({id:runId,signals:result.signals});}).catch(e=>{if(active)setError(e.message);});
  return()=>{active=false;};
 },[runId,load,retry]);
 const start=range?.[0]??-Infinity,end=range?.[1]??Infinity;
 const rows=useMemo(()=>{
  if(!data||data.id!==runId)return [];
  return (Object.entries(data.signals) as [Channel,NonNullable<Signals[Channel]>][]).flatMap(([key,points])=>channel!=='all'&&channel!==key?[]:points.filter(p=>p.flags!=='record_gap'&&p.time>=start*60-1e-6&&p.time<=end*60+1e-6).map(p=>({...p,channel:key}))).sort((a,b)=>a.time-b.time||a.channel.localeCompare(b.channel));
 },[data,runId,channel,start,end]);
 useEffect(()=>{setPage(0);if(scroller.current)scroller.current.scrollTop=0;},[runId,channel,start,end]);
 useEffect(()=>{if(selection)setChannel(current=>current==='all'||current===selection.channel?current:selection.channel);},[selection]);
 useEffect(()=>{if(hover)setChannel(current=>current==='all'||current===hover.channel?current:hover.channel);},[hover]);
 useEffect(()=>{
  if(!selection)return;
  const index=rows.findIndex(row=>same(row,selection));if(index>=0)setPage(Math.floor(index/pageSize));
 },[selection,rows]);
 useEffect(()=>{if(hover){const index=rows.findIndex(row=>same(row,hover));if(index>=0)setPage(Math.floor(index/pageSize));}},[hover,rows]);
 const windowStart=windowHover?.start,windowEnd=windowHover?.end;
 // Window blocks include their start and exclude their end; highlight original rows, not interpolated pairs.
 const windowFirst=useMemo(()=>windowStart===undefined||windowEnd===undefined?-1:rows.findIndex(row=>row.time>=windowStart&&row.time<windowEnd),[rows,windowStart,windowEnd]);
 useEffect(()=>{if(windowFirst>=0)setPage(Math.floor(windowFirst/pageSize));},[windowFirst,windowStart,windowEnd]);
 const pages=Math.max(1,Math.ceil(rows.length/pageSize)),currentPage=Math.min(page,pages-1);
 const visible=rows.slice(currentPage*pageSize,(currentPage+1)*pageSize);
 useEffect(()=>{
  const box=scroller.current,row=box?.querySelector(windowHover?'tr.raw-row-window':hover?'tr.raw-row-hovered':'tr.raw-row-selected');
  if(box&&row){const rect=row.getBoundingClientRect(),bounds=box.getBoundingClientRect();if(rect.top<bounds.top+27||rect.bottom>bounds.bottom)box.scrollTop+=rect.top-bounds.top-80;}
 },[selection,hover,currentPage,windowStart,windowEnd,windowFirst]);
 function changePage(next:number){setPage(next);if(scroller.current)scroller.current.scrollTop=0;}
 return <aside className="raw-data-panel" data-testid="raw-data-panel" aria-label="原始观测数据表">
  <div className="raw-table-heading"><h3>原始观测表</h3><select aria-label="原始表通道" value={channel} onChange={e=>setChannel(e.target.value as Channel|'all')}><option value="all">全部通道</option>{(Object.keys(data?.signals??{map:[],left:[],right:[]}) as Channel[]).map(k=><option key={k} value={k}>{names[k]}</option>)}</select></div>
  <p className="raw-table-range">{range?`跟随图中范围：${timeLabel(start,time)} – ${timeLabel(end,time)}（${timeAxisName(time)}）`:'等待图表时间范围'}</p>
  <p className="raw-table-note">{windowHover?`${windowHover.kind==='block'?'平均时间块':'COx 窗口'}：${timeLabel(windowHover.start/60,time)}–${timeLabel(windowHover.end/60,time)} · ${windowFirst>=0?'浅色行为窗内观测':'当前范围与筛选下无窗内观测'}`:'未抽稀 · 随图上鼠标定位 · 点击时间固定位置'}</p>
  {!runId?<p>完成一次分析后，可对照本地完整原始观测。</p>:error?<p role="alert">{error} <button onClick={()=>setRetry(v=>v+1)}>重试读取原始表</button></p>:data?.id!==runId?<p role="status">正在读取本地完整观测…</p>:<>
   <div className="raw-table-scroll" ref={scroller}>
    <table><thead><tr><th scope="col" role="columnheader">{timeAxisName(time)}</th><th scope="col" role="columnheader">通道</th><th scope="col" role="columnheader">{channel==='map'?'MAP_raw':'数值 / 单位'}</th>{channel==='map'&&<th scope="col" role="columnheader">MAP_clean</th>}<th scope="col" role="columnheader">{channel==='map'?'quality_flag':'点质量'}</th></tr></thead><tbody>{visible.map(row=>{
     const flags=row.flags.split('|').filter(Boolean).map(f=>reasonNames[f]||f).join('、');
     const inWindow=windowStart!==undefined&&windowEnd!==undefined&&row.time>=windowStart&&row.time<windowEnd;
     return <tr key={`${row.channel}:${row.time}`} className={[hover&&same(row,hover)?'raw-row-hovered':selection&&same(row,selection)?'raw-row-selected':!row.valid?'raw-row-invalid':'',inWindow?'raw-row-window':''].filter(Boolean).join(' ')}>
      <td><button className="raw-time-button" title={`原始时间：${row.time} 秒`} aria-label={`定位 ${shortNames[row.channel]} ${timeLabel(row.time/60,time)}（${timeAxisName(time)}），原始时间 ${row.time} 秒`} aria-pressed={!!selection&&same(row,selection)} onClick={()=>onSelect(row)}>{timeLabel(row.time/60,time)}</button></td>
      <td>{shortNames[row.channel]}</td><td title={row.value===null?'缺失':String(row.value)}>{row.value===null?'缺失':String(row.value)} <span className="raw-cell-unit">{units[row.channel]}</span></td>
      {channel==='map'&&<td title={`MAP_clean: ${row.MAP_clean===null?'NaN':row.MAP_clean??'历史未提供'}；NaN不参与计算`}>{row.MAP_clean===undefined?'—':row.MAP_clean===null?'NaN':String(row.MAP_clean)}</td>}
      <td title={(row.quality_flag?`quality_flag: ${row.quality_flag} · `:'')+flags||'无额外点质量提示'}><span className={row.valid?'raw-point-valid':'raw-point-invalid'}>{row.valid?(row.flags.includes('_review')?'需复核':'可用'):'排除'}</span>{flags&&<span className="raw-cell-flag"> · 提示</span>}</td>
     </tr>;
    })}{!rows.length&&<tr><td colSpan={channel==='map'?5:4}>当前范围内该通道没有原始观测。</td></tr>}</tbody></table>
   </div>
   <div className="raw-table-pages"><span>共 {rows.length.toLocaleString()} 条 · {currentPage+1}/{pages} 页</span><button aria-label="原始表上一页" disabled={!currentPage} onClick={()=>changePage(currentPage-1)}><ChevronLeft size={15}/></button><button aria-label="原始表下一页" disabled={currentPage>=pages-1} onClick={()=>changePage(currentPage+1)}><ChevronRight size={15}/></button></div>
  </>}
  <details className="raw-table-footnote"><summary>时间与点质量说明</summary><p>时间列跟随横轴所选格式，手术相对时间的负数表示术前；悬停时间可核对完整原始秒数，悬停质量可看具体原因。显示取舍不改变原始时间戳或图表定位。选择 MAP 通道可并列查看 MAP_raw 和 MAP_clean（均为 mmHg）；悬停数值可核对完整精度。NaN 表示排除，悬停质量可核对 quality_flag。点质量对应当前运行；可用点所在的时间块仍可能覆盖不足。各通道按各自时间戳列出，不按行号拼接，也不把图形缺口占位算作观测。</p></details>
 </aside>;
}
