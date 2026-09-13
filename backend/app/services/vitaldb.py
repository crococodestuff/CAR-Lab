from concurrent.futures import ThreadPoolExecutor
from threading import BoundedSemaphore
import io
import re
import time
import httpx
import pandas as pd
from backend.car_core.ingest import decode_csv, normalize_track
from .store import DATA,atomic_bytes,save_json,read_json,digest,now

BASE='https://api.vitaldb.net/'
SOURCE='https://vitaldb.net/dataset/?query=overview'
LICENSE='https://physionet.org/content/vitaldb/1.0.0/'
CHANNELS={'map':('Solar8000/ART_MBP','mmHg',2),'left':('Invos/SCO2_L','%',5),'right':('Invos/SCO2_R','%',5),'etco2':('Solar8000/ETCO2','mmHg',2),'spo2':('Solar8000/PLETH_SPO2','%',2),'hr':('Solar8000/HR','bpm',2)}
NETWORK=BoundedSemaphore(2)

def fetch(resource, cancel=None):
    if resource not in ('cases','trks') and not re.fullmatch(r'[a-fA-F0-9]{40,64}',resource): raise ValueError('非法上游资源')
    for attempt in range(3):
        if cancel and cancel.is_set(): raise InterruptedError('任务已取消')
        try:
            with NETWORK, httpx.Client(timeout=httpx.Timeout(45,connect=15),follow_redirects=False) as client:
                with client.stream('GET',BASE+resource) as response:
                    response.raise_for_status(); chunks=[]; size=0
                    for chunk in response.iter_bytes():
                        if cancel and cancel.is_set(): raise InterruptedError('任务已取消')
                        size+=len(chunk)
                        if size>100_000_000: raise ValueError('上游响应超出 100 MB 限制')
                        chunks.append(chunk)
                    return b''.join(chunks)
        except (httpx.HTTPError,OSError):
            if attempt==2: raise
            if cancel: cancel.wait(.5*(attempt+1))
            else: time.sleep(.5*(attempt+1))

def refresh_catalog(cancel=None):
    payloads={name:fetch(name,cancel) for name in ('cases','trks')}
    cases,trks=decode_csv(payloads['cases']),decode_csv(payloads['trks'])
    if not {'caseid','age','opname'}<=set(cases.columns) or not {'caseid','tname','tid'}<=set(trks.columns): raise ValueError('目录格式变化')
    snapshot=digest(payloads['cases']+payloads['trks']); folder=DATA/'catalog'/snapshot
    for name,raw in payloads.items(): atomic_bytes(folder/(name+'.csv'),raw)
    maps=set(trks.loc[trks.tname==CHANNELS['map'][0],'caseid'])
    left=set(trks.loc[trks.tname==CHANNELS['left'][0],'caseid']); right=set(trks.loc[trks.tname==CHANNELS['right'][0],'caseid'])
    ids=sorted(maps & (left|right)); records=[]
    for cid in ids:
        rows=cases.loc[cases.caseid==cid]
        meta=__import__('json').loads(rows.to_json(orient='records'))[0] if len(rows) else {'caseid':int(cid),'age':None,'opname':None}
        tracks={k:{'tid':str(t.iloc[0].tid),'tname':name,'unit':unit,'nominal_interval':interval,'nominal_source':SOURCE} for k,(name,unit,interval) in CHANNELS.items() if len(t:=trks.loc[(trks.caseid==cid)&(trks.tname==name)])}
        records.append({**meta,'caseid':int(cid),'tracks':tracks,'source':'VitalDB','population':'成人公开手术数据','metadata_snapshot_id':snapshot})
    manifest={'snapshot_id':snapshot,'fetched_at':now(),'cases_count':len(cases),'left_count':len(left),'right_count':len(right),'candidate_count':len(ids),'both_sides_with_map':len(maps&left&right),'sources':{name:{'url':BASE+name,'sha256':digest(raw)} for name,raw in payloads.items()},'cases':records}
    save_json(folder/'manifest.json',manifest)
    if cancel and cancel.is_set(): raise InterruptedError('任务已取消')
    save_json(DATA/'catalog'/'current.json',manifest)
    return {k:v for k,v in manifest.items() if k!='cases'}

def list_cases():
    path=DATA/'catalog'/'current.json'
    if not path.exists(): return []
    rows=read_json(path)['cases']
    for row in rows:
        path=DATA/'cases'/str(row['caseid'])/'manifest.json'
        row['cached']=path.exists()
        quality=DATA/'cases'/str(row['caseid'])/'quality.json'
        row['quality']=read_json(quality) if quality.exists() else None
    return rows

def get_case(caseid):
    item=next((r for r in list_cases() if r['caseid']==caseid),None)
    if not item: raise KeyError('病例不在动态候选目录中')
    return item

def download_case(caseid,cancel=None,auxiliary=False):
    case=get_case(caseid); folder=DATA/'cases'/str(caseid); manifest_path=folder/'manifest.json'
    if manifest_path.exists():
        old=read_json(manifest_path)
        needed=set(case['tracks']) if auxiliary else set(case['tracks'])&{'map','left','right'}
        if needed<=set(old['tracks']) and all(old['tracks'][k]['tid']==case['tracks'][k]['tid'] for k in needed):
            load_tracks(caseid)
            return old
    def one(pair):
        key,meta=pair; tid=meta['tid']; path=DATA/'tracks'/tid/'raw.csv'
        if path.exists() and (path.parent/'manifest.json').exists() and (path.parent/'normalized.parquet').exists():
            raw=path.read_bytes(); saved=read_json(path.parent/'manifest.json')
            if digest(raw)!=saved['sha256']: raise ValueError('缓存校验失败，请重新获取该通道')
            return key,saved
        raw=fetch(tid,cancel); frame,stats=normalize_track(raw)
        atomic_bytes(path,raw)
        buf=io.BytesIO(); frame.to_parquet(buf,index=False); atomic_bytes(path.parent/'normalized.parquet',buf.getvalue())
        result={**meta,**stats,'sha256':digest(raw),'parquet_sha256':digest(buf.getvalue()),'url':BASE+tid,'fetched_at':now(),'license_source':LICENSE,'normalization':'same-time conflicts invalid; nonfinite invalid; stable time sort'}
        save_json(path.parent/'manifest.json',result); return key,result
    selected=[(k,v) for k,v in case['tracks'].items() if auxiliary or k in ('map','left','right')]
    with ThreadPoolExecutor(max_workers=2) as pool: tracks=dict(pool.map(one,selected))
    if cancel and cancel.is_set(): raise InterruptedError('任务已取消')
    manifest={'case':case,'tracks':tracks,'downloaded_at':now()}; save_json(manifest_path,manifest)
    return manifest

def load_tracks(caseid):
    manifest=read_json(DATA/'cases'/str(caseid)/'manifest.json')
    return load_manifest_tracks(manifest),manifest

def load_manifest_tracks(manifest):
    """Resolve a run's frozen track IDs, even after its case catalog/cache changes."""
    tracks={}
    for key,meta in manifest['tracks'].items():
        folder=DATA/'tracks'/meta['tid']; raw=(folder/'raw.csv').read_bytes(); pq=(folder/'normalized.parquet').read_bytes()
        if digest(raw)!=meta['sha256'] or digest(pq)!=meta['parquet_sha256']: raise ValueError('缓存校验值不一致')
        tracks[key]=pd.read_parquet(io.BytesIO(pq))
    return tracks
