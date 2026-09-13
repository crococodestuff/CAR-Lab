from pathlib import Path
from threading import Lock
from typing import Literal
import uuid
import numpy as np
from fastapi import FastAPI,HTTPException,Query,Request
from fastapi.responses import Response,JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel,ConfigDict,Field,model_validator
from backend.car_core.config import AnalysisConfig
from backend.car_core.analysis import explain_window,compare_runs,fingerprint
from backend.car_core.quality import mark_quality
from backend.car_core.raw_summary import summarize_raw, summarize_quality
from backend.car_core.signals import signal_payload
from backend.car_core.synthetic import generate
from backend.car_core.mapopt import formula_example
from .services.mapopt import get_mapopt
from .services import vitaldb,tasks,runs
from .services.store import DATA,ROOT,read_json,save_json,now
from .services.export import export_zip

app=FastAPI(title='CAR Lab',version='1.0.0')
LOCAL_ORIGINS=['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:8765','http://localhost:8765']
app.add_middleware(CORSMiddleware,allow_origins=LOCAL_ORIGINS,allow_methods=['GET','POST','DELETE'],allow_headers=['Content-Type'])

@app.middleware('http')
async def local_origin(request:Request,call_next):
    origin=request.headers.get('origin')
    if request.method not in ('GET','HEAD','OPTIONS') and origin and origin not in LOCAL_ORIGINS:
        return JSONResponse({'detail':'仅接受本地工作台请求'},status_code=403)
    return await call_next(request)

@app.exception_handler(ValueError)
async def invalid(request,exc): return JSONResponse({'detail':str(exc)},status_code=422)
@app.exception_handler(KeyError)
async def missing(request,exc): return JSONResponse({'detail':str(exc)},status_code=404)
@app.exception_handler(FileNotFoundError)
async def uncached(request,exc): return JSONResponse({'detail':'本地缓存不存在，请先联网下载；也可进入合成实验室'},status_code=404)

class AnalyzeBody(BaseModel):
    model_config=ConfigDict(extra='forbid')
    caseid:int|None=Field(default=None,ge=1,le=100000)
    config:dict=Field(default_factory=dict)
    synthetic:dict|None=None

class AnnotationItem(BaseModel):
    model_config=ConfigDict(extra='forbid',allow_inf_nan=False)
    id:str=Field(default_factory=lambda:uuid.uuid4().hex,max_length=80)
    channel:Literal['all','map','left','right','etco2','spo2','hr']='all'
    start:float=Field(ge=0,le=172800)
    end:float=Field(gt=0,le=172800)
    reason:str=Field(min_length=1,max_length=300)
    operator:Literal['local_user']='local_user'
    created_at:str=Field(default_factory=now,max_length=80)
    @model_validator(mode='after')
    def valid_range(self):
        if self.end<=self.start: raise ValueError('标记结束时间必须晚于起点')
        return self

class AnnotationBody(BaseModel):
    version:int=Field(ge=0)
    items:list[AnnotationItem]=Field(max_length=200)

class QualityPreviewBody(BaseModel):
    model_config=ConfigDict(extra='forbid')
    config:dict=Field(default_factory=dict)
    items:list[AnnotationItem]=Field(default_factory=list,max_length=200)

annotation_lock=Lock()

@app.get('/api/health')
def health(): return {'status':'ok','mode':'local','algorithm_version':'1.0.0'}
@app.post('/api/catalog/refresh')
def catalog(): return tasks.submit('catalog',lambda cancel:vitaldb.refresh_catalog(cancel))
@app.get('/api/catalog')
def catalog_info():
    p=DATA/'catalog'/'current.json'
    return {k:v for k,v in read_json(p).items() if k!='cases'} if p.exists() else None
@app.get('/api/cases')
def cases(): return vitaldb.list_cases()
@app.get('/api/cases/{caseid}')
def case(caseid:int): return vitaldb.get_case(caseid)
@app.post('/api/cases/{caseid}/download')
def download(caseid:int,auxiliary:bool=False):
    vitaldb.get_case(caseid)
    return tasks.submit(f'download:{caseid}:{auxiliary}',lambda cancel:vitaldb.download_case(caseid,cancel,auxiliary))
@app.get('/api/tasks/{task_id}')
def task(task_id:str): return tasks.public(tasks.tasks[task_id])
@app.delete('/api/tasks/{task_id}')
def cancel(task_id:str):
    tasks.tasks[task_id]['cancel'].set(); return tasks.public(tasks.tasks[task_id])

@app.get('/api/cases/{caseid}/signals')
def signals(caseid:int,start:float=Query(0,ge=0),end:float=Query(172800,le=172800),max_points:int=Query(3000,ge=100,le=10000)):
    tracks,manifest=vitaldb.load_tracks(caseid)
    return {'signals':signal_payload(tracks,start,end,max_points,annotations=runs.annotations_for(caseid)['items']),'manifest':manifest,'display_only':True}
@app.get('/api/cases/{caseid}/annotations')
def annotations(caseid:int): return runs.annotations_for(caseid)
@app.post('/api/cases/{caseid}/annotations')
def save_annotations(caseid:int,body:AnnotationBody):
    vitaldb.get_case(caseid)
    with annotation_lock:
        previous=runs.annotations_for(caseid)
        if body.version!=previous['version']: raise HTTPException(409,'标记版本已更新，请重新加载')
        current={'version':previous['version']+1,'caseid':caseid,'updated_at':now(),'items':[a.model_dump() for a in body.items]}
        save_json(DATA/'cases'/str(caseid)/'annotation_history'/f'{current["version"]}.json',current)
        save_json(DATA/'cases'/str(caseid)/'annotations.json',current)
    return current
@app.post('/api/analyses')
def analysis(body:AnalyzeBody):
    try: config=AnalysisConfig(**body.config)
    except TypeError as exc: raise ValueError(str(exc)) from exc
    if body.synthetic is None and body.caseid is None: raise ValueError('需要病例或合成实验参数')
    annotation_version=runs.annotations_for(body.caseid)['version'] if body.caseid else 0
    key=fingerprint({**body.model_dump(),'annotation_version':annotation_version})
    def calculate(cancel):
        result=runs.run_analysis(body.caseid,config,body.synthetic,cancel)
        return {'run_id':result['run_id'],'config_hash':result['config_hash']}
    return tasks.submit(key,calculate)
@app.get('/api/analyses/{run_id}')
def result(run_id:str): return runs.get_run(run_id)

@app.post('/api/analyses/{run_id}/quality-preview')
def quality_preview(run_id:str,body:QualityPreviewBody):
    r=runs.get_run(run_id)
    tracks=generate(**r['manifest']['generator']) if r['mode']=='synthetic' else vitaldb.load_manifest_tracks(r['manifest'])
    try: config=AnalysisConfig(**body.config)
    except TypeError as exc: raise ValueError(str(exc)) from exc
    return summarize_quality(tracks,r['range']['start'],r['range']['end'],config,[a.model_dump() for a in body.items])
@app.get('/api/analyses/{run_id}/windows/{window_id}')
def window(run_id:str,window_id:str): return explain_window(runs.get_run(run_id),window_id)
@app.get('/api/analyses/{run_id}/blocks/{index}')
def block(run_id:str,index:int):
    r=runs.get_run(run_id)
    if not 0<=index<len(r['blocks']): raise KeyError('块不存在')
    b=r['blocks'][index]
    tracks=generate(**r['manifest']['generator']) if r['mode']=='synthetic' else vitaldb.load_manifest_tracks(r['manifest'])
    raw={}
    for key,frame in tracks.items():
        f,_=mark_quality(frame,key,AnalysisConfig.from_saved(r['config']),r['annotations'])
        f=f.loc[(f.time>=b['start'])&(f.time<b['end'])]
        raw[key]=__import__('json').loads(f.to_json(orient='records'))
    return {'block':b,'observations':raw}
@app.get('/api/analyses/{run_id}/signals')
def run_signals(run_id:str,full:bool=False):
    r=runs.get_run(run_id)
    tracks=generate(**r['manifest']['generator']) if r['mode']=='synthetic' else vitaldb.load_manifest_tracks(r['manifest'])
    counts={key:int(((f.time>=r['range']['start'])&(f.time<=r['range']['end'])).sum()) for key,f in tracks.items()}
    if full and sum(counts.values())>500_000: raise ValueError('完整原始点超过50万，请缩短分析范围后查看')
    output=signal_payload(tracks,r['range']['start'],r['range']['end'],None if full else 4000,AnalysisConfig.from_saved(r['config']),r['annotations'])
    return {'signals':output,'quality_comparison':r.get('quality_comparison') or summarize_quality(tracks,r['range']['start'],r['range']['end'],AnalysisConfig.from_saved(r['config']),r['annotations']),'raw_summary':summarize_raw(tracks,r['range']['start'],r['range']['end']),'display_only':True,'full_resolution':full,'sampling':{key:{'raw_points':counts[key],'display_points':sum(p['flags']!='record_gap' for p in rows),'nominal_interval':r['manifest']['tracks'][key].get('nominal_interval'),'interval_seconds':r['manifest']['tracks'][key].get('interval_seconds')} for key,rows in output.items()}}
@app.get('/api/analyses/{run_id}/compare/{other_id}')
def comparison(run_id:str,other_id:str):
    a,b=runs.get_run(run_id),runs.get_run(other_id)
    if a['input_hash']!=b['input_hash']: raise ValueError('仅比较同一份输入数据的运行')
    return compare_runs(a,b)
@app.get('/api/analyses/{run_id}/map-quality')
def map_quality_download(run_id:str):
    payload=runs.map_quality_csv(runs.get_run(run_id))
    if payload is None: raise HTTPException(409,'历史运行没有MAP质控快照，请应用当前规则重新分析')
    return Response(payload,media_type='text/csv',headers={'Content-Disposition':f'attachment; filename="map-quality-{run_id[:12]}.csv"'})

@app.get('/api/analyses/{run_id}/export')
def export(run_id:str):
    return Response(export_zip(runs.get_run(run_id)),media_type='application/zip',headers={'Content-Disposition':f'attachment; filename="car-lab-{run_id[:12]}.zip"'})

@app.get('/api/analyses/{run_id}/mapopt')
def mapopt(run_id:str,method:Literal['windows','bins']='windows',width:int=Query(5,ge=2,le=10),day:int=Query(0,ge=0,le=100000),download:bool=False):
    if width not in (2,5,10): raise ValueError('MAP分箱宽度仅支持2、5、10 mmHg')
    report=get_mapopt(run_id,method,width,day)
    return JSONResponse(report,headers={'Content-Disposition':f'attachment; filename="mapopt-{report["report_id"][:12]}.json"'} if download else None)

@app.get('/api/mapopt/example')
def mapopt_example(): return formula_example()

dist=ROOT/'frontend'/'dist'
if dist.exists(): app.mount('/',StaticFiles(directory=dist,html=True),name='frontend')
