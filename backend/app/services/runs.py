import json
import uuid
from backend.car_core.analysis import analyze,fingerprint
from backend.car_core.config import AnalysisConfig
from backend.car_core.quality import mark_quality
from backend.car_core.synthetic import generate
from .store import DATA,save_json,read_json,now,code_version,digest,atomic_bytes
from .vitaldb import load_tracks

def annotations_for(caseid):
    p=DATA/'cases'/str(caseid)/'annotations.json'
    return read_json(p) if p.exists() else {'version':0,'items':[]}

def run_analysis(caseid,config,synthetic=None,cancel=None):
    if synthetic is not None:
        tracks=generate(**synthetic); manifest={'case':{'caseid':None,'age':None,'opname':'合成信号实验','population':'合成演示 · 不是真实病例','source':'synthetic'},'generator':synthetic,'tracks':{k:{'sha256':digest(f.to_csv(index=False).encode()),'unit':'mmHg' if k=='map' else '%','nominal_interval':2 if k=='map' else 5} for k,f in tracks.items()}}
        annotations=[]
    else:
        tracks,manifest=load_tracks(caseid); annotations=annotations_for(caseid)['items']
    if cancel and cancel.is_set(): raise InterruptedError('任务已取消')
    hashes={'input_hash':fingerprint({k:v['sha256'] for k,v in manifest['tracks'].items()}),'annotation_hash':fingerprint(annotations),'config_hash':fingerprint(config.to_dict()),'code_version':code_version(),'metadata_hash':fingerprint(manifest['case'])}
    run_id=fingerprint(hashes)
    folder=DATA/'runs'/run_id
    if (folder/'result.json').exists(): return read_json(folder/'result.json')
    result=analyze(tracks,config,annotations)
    if cancel and cancel.is_set(): raise InterruptedError('任务已取消')
    result.update(hashes); result.update({'run_id':run_id,'created_at':now(),'status':'complete','error':None,'manifest':manifest,'annotations':annotations,'mode':'synthetic' if synthetic is not None else 'real'})
    folder.mkdir(parents=True,exist_ok=True)
    quality,_=mark_quality(tracks['map'],'map',config,annotations)
    quality=quality.loc[(quality.time>=result['range']['start']) & (quality.time<=result['range']['end']), ['time','MAP_raw','MAP_clean','quality_flag','valid']]
    payload=quality.to_csv(index=False,na_rep='NaN').encode('utf-8-sig')
    atomic_bytes(folder/'map_quality.csv',payload)
    result['map_quality']={'version':1,'rows':len(quality),'sha256':digest(payload),'invalid_points':int((~quality.valid).sum()),'review_points':int((quality.valid & quality.quality_flag.str.contains('map_(?:zero|low|high)_review')).sum())}
    save_json(folder/'result.json',result)
    if synthetic is None and config==AnalysisConfig() and not annotations:
        save_json(DATA/'cases'/str(caseid)/'quality.json',{'run_id':run_id,'summary':result['summary'],'accepted':any(v['valid_outputs'] for v in result['summary'].values()),'mode':'strict_default'})
    return result

def get_run(run_id):
    import re
    if not re.fullmatch('[a-f0-9]{64}',run_id): raise ValueError('运行 ID 无效')
    return read_json(DATA/'runs'/run_id/'result.json')


def map_quality_csv(result):
    if 'map_quality' not in result:
        return None
    get_run(result['run_id'])
    payload=(DATA/'runs'/result['run_id']/'map_quality.csv').read_bytes()
    if digest(payload) != result['map_quality']['sha256']:
        raise ValueError('MAP质控快照校验失败')
    return payload
