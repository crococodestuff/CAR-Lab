import {useContext,useEffect,useRef,useState} from 'react';
import * as echarts from 'echarts';
import {TimeContext,timeLabel,timeAxisName} from './TimeDisplay';
const zoomGroups=new Map<string,Set<echarts.ECharts>>();
const viewReaders=new WeakMap<echarts.ECharts,()=>void>();
interface HoverPoint {seriesName:string;value:number[];data?:any;}
export function Chart({option,height=280,renderer='canvas',onClick,onBrush,group,focusRange,showRange=false,onRangeChange,onHover}:{option:any;height?:number;renderer?:'canvas'|'svg';onClick?:(p:any)=>void;onBrush?:(range:number[])=>void;group?:string;focusRange?:[number,number];showRange?:boolean;onRangeChange?:(range:[number,number])=>void;onHover?:(point:HoverPoint|null)=>void}){
 const time=useContext(TimeContext);const domain=useRef('');const [view,setView]=useState<[number,number]|null>(null);
 const el=useRef<HTMLDivElement>(null);const chart=useRef<echarts.ECharts|null>(null);const click=useRef(onClick);const brush=useRef(onBrush);click.current=onClick;brush.current=onBrush;
 const rangeCallback=useRef(onRangeChange);rangeCallback.current=onRangeChange;
 const hoverCallback=useRef(onHover),latestOption=useRef(option);hoverCallback.current=onHover;latestOption.current=option;
 function readView(c:echarts.ECharts){const z=(c.getOption().dataZoom as any[])?.[0];if(z&&Number.isFinite(z.startValue)&&Number.isFinite(z.endValue)){const range:[number,number]=[z.startValue,z.endValue];setView(range);rangeCallback.current?.(range);}}
 useEffect(()=>{
  if(!el.current)return;const c=echarts.init(el.current,undefined,{renderer});chart.current=c;
  viewReaders.set(c,()=>readView(c));c.on('datazoom',()=>readView(c));
  if(group){
   if(!zoomGroups.has(group))zoomGroups.set(group,new Set());zoomGroups.get(group)!.add(c);
   // Link zoom only. echarts.connect also forwards tooltips by pixel/series index,
   // which produces unrelated or duplicate popups across these different charts.
   c.on('datazoom',(event:any)=>{
    const range=event.batch?.[0]??event;
    const current=(c.getOption().dataZoom as any[])?.[0];
    const action=current&&Number.isFinite(current.startValue)&&Number.isFinite(current.endValue)?{startValue:current.startValue,endValue:current.endValue}:{start:range.start,end:range.end,startValue:range.startValue,endValue:range.endValue};
    for(const other of zoomGroups.get(group)??[]){
     if(other!==c&&!other.isDisposed()){other.dispatchAction({type:'dataZoom',...action},{silent:true});viewReaders.get(other)?.();}
    }
   });
  }
  c.on('click',p=>click.current?.(p));c.on('brushEnd',(p:any)=>{const range=p.areas?.[0]?.coordRange;if(range)brush.current?.(range);});
  let hoverFrame=0,lastHover='';const hidden=new Set<string>();
  const leave=()=>{cancelAnimationFrame(hoverFrame);lastHover='';hoverCallback.current?.(null);};
  c.on('datazoom',leave);
  c.on('legendselectchanged',(event:any)=>{hidden.clear();for(const [name,visible] of Object.entries(event.selected??{}))if(!visible)hidden.add(name);leave();});
  const hover=(event:any)=>{
   if(!hoverCallback.current)return;
   cancelAnimationFrame(hoverFrame);
   hoverFrame=requestAnimationFrame(()=>{
    const pixel=[event.offsetX,event.offsetY];let nearest:HoverPoint|null=null,distance=Infinity;
    const valueOf=(row:any):number[]|undefined=>Array.isArray(row)?row:row?.value;
    // Compare actual rendered samples within the hovered pane; never interpolate a table value.
    for(const series of latestOption.current.series??[]){
     if(!['line','scatter'].includes(series.type)||hidden.has(series.name))continue;const axis=series.xAxisIndex??0;
     if(!c.containPixel({gridIndex:axis},pixel))continue;
     const x=Number(c.convertFromPixel({xAxisIndex:axis},pixel[0]));const rows=series.data??[];
     let lo=0,hi=rows.length;while(lo<hi){const mid=(lo+hi)>>>1;if(valueOf(rows[mid])![0]<x)lo=mid+1;else hi=mid;}
     // Match the axis tooltip's nearest timestamp before comparing different curves.
     // A closer y value must not replace it with an adjacent observation.
     const index=lo===0?0:lo===rows.length?lo-1:x-valueOf(rows[lo-1])![0]<=valueOf(rows[lo])![0]-x?lo-1:lo;
     const value=valueOf(rows[index]);if(!value||!Number.isFinite(value[1]))continue;
     const p=c.convertToPixel({xAxisIndex:axis,yAxisIndex:series.yAxisIndex??0},value as number[]);
     const d=Math.hypot(p[0]-pixel[0],p[1]-pixel[1]);if(d<distance){distance=d;nearest={seriesName:series.name,value,data:rows[index]};}
    }
    const key=nearest?nearest.seriesName+':'+nearest.value[0]:'';
    if(key!==lastHover){lastHover=key;hoverCallback.current?.(nearest);}
   });
  };
  c.getZr().on('mousemove',hover);c.getZr().on('globalout',leave);
  const ro=new ResizeObserver(()=>c.resize());ro.observe(el.current);
  return()=>{cancelAnimationFrame(hoverFrame);ro.disconnect();if(group){zoomGroups.get(group)?.delete(c);if(!zoomGroups.get(group)?.size)zoomGroups.delete(group);}c.dispose();chart.current=null;};
 },[group,renderer]);
 useEffect(()=>{
  const c=chart.current;if(!c)return;
  const previous=domain.current===time.domainKey?(c.getOption().dataZoom as any[])?.[0]:null;
  domain.current=time.domainKey;
  const zoom=(Array.isArray(option.dataZoom)?option.dataZoom:[]).map((z:any)=>({...z,
   ...(group==='car-time'?{filterMode:'none'}:{}),
   ...(previous?{startValue:previous.startValue,endValue:previous.endValue,rangeMode:['value','value']}:{start:0,end:100,startValue:null,endValue:null,rangeMode:['percent','percent']})}));
  const axes=group==='car-time'?(Array.isArray(option.xAxis)?option.xAxis:[option.xAxis]).map((axis:any)=>({...axis,
   name:timeAxisName(time),nameTextStyle:{...axis.nameTextStyle,padding:[30,0,0,-110]},
   axisLabel:{...axis.axisLabel,formatter:(v:number)=>timeLabel(v,time),hideOverlap:true},
   axisPointer:{...axis.axisPointer,label:{formatter:(p:any)=>timeLabel(p.value,time)}}})):option.xAxis;
  // Keep the user's viewport and tooltip component across selection/state updates.
  c.dispatchAction({type:'hideTip'});
  c.setOption({...option,xAxis:axes,dataZoom:zoom},{notMerge:false,replaceMerge:['series','xAxis','yAxis','grid','dataZoom','visualMap']});
  readView(c);
 },[option,time.mode,time.operationStart,time.domainKey,renderer]);
 const focusStart=focusRange?.[0],focusEnd=focusRange?.[1];
 useEffect(()=>{const c=chart.current;if(c&&focusStart!==undefined&&focusEnd!==undefined){c.dispatchAction({type:'dataZoom',startValue:focusStart,endValue:focusEnd},{silent:true});readView(c);}},[focusStart,focusEnd]);
 return <><div ref={el} style={{height,width:'100%'}} role="img" aria-label={option.aria?.label?.description||'可交互分析图表'}/>{showRange&&view&&<small className="chart-visible-range">当前视图：{timeLabel(view[0],time)} – {timeLabel(view[1],time)} · {timeAxisName(time)}</small>}</>;
}
export const base={animation:false,textStyle:{fontFamily:'Inter, Segoe UI, Microsoft YaHei, sans-serif',fontSize:11,color:'#68808a'},grid:{left:58,right:28,top:34,bottom:48},tooltip:{trigger:'axis'},xAxis:{type:'value',name:'时间 / min',nameLocation:'end',nameTextStyle:{padding:[30,0,0,-40]},axisLine:{lineStyle:{color:'#d5e0e4'}},splitLine:{show:false}},yAxis:{type:'value',scale:true,splitLine:{lineStyle:{color:'#edf1f3'}}},dataZoom:[{type:'inside'},{type:'slider',height:16,bottom:6,borderColor:'transparent',fillerColor:'#dbe9eb',handleStyle:{color:'#438d91'}}]};
