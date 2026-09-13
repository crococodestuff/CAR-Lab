from io import BytesIO
import json
import zipfile
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app,signal_payload
from backend.app.services import runs,store,vitaldb
from backend.app.services.export import export_zip
from backend.car_core.analysis import explain_window
from backend.car_core.config import AnalysisConfig

client=TestClient(app)

def test_validation_origin_and_health():
    assert client.get('/api/health').json()['status']=='ok'
    assert client.post('/api/analyses',json={'synthetic':{'scenario':'constant'},'config':{'window_seconds':301}}).status_code==422
    assert client.post('/api/analyses',json={'caseid':None}).status_code==422
    assert client.post('/api/catalog/refresh',headers={'Origin':'https://untrusted.example'}).status_code==403
    assert client.get('/api/analyses/not-a-run').status_code==422

def test_offline_identical_and_export_consistent(tmp_path,monkeypatch):
    monkeypatch.setattr(runs,'DATA',tmp_path)
    def no_network(*a,**kw): raise AssertionError('network forbidden')
    monkeypatch.setattr(vitaldb,'fetch',no_network)
    a=runs.run_analysis(None,AnalysisConfig(),{'scenario':'coupled'})
    b=runs.run_analysis(None,AnalysisConfig(),{'scenario':'coupled'})
    assert a['run_id']==b['run_id'] and a['windows']==b['windows']
    # HTML escaping applies to metadata.
    a['manifest']['case']['opname']='<script>alert(1)</script>'
    z=zipfile.ZipFile(BytesIO(export_zip(a)))
    assert set(z.namelist())=={'report.html','manifest.json','annotations.json','config.json','blocks.csv','cox_windows.csv','map_bins.csv','map_quality.csv'}
    quality=pd.read_csv(BytesIO(z.read('map_quality.csv')))
    assert set(quality.columns)=={'time','MAP_raw','MAP_clean','quality_flag','valid'}
    assert quality.MAP_clean.equals(quality.MAP_raw)
    html=z.read('report.html').decode()
    assert '<script>' not in html and '&lt;script&gt;' in html and '<svg' in html
    csv=pd.read_csv(BytesIO(z.read('cox_windows.csv')))
    w=next(w for w in a['windows'] if w['cox'] is not None)
    assert csv.loc[csv.window_id==w['window_id'],'cox'].item()==pytest.approx(w['cox'],abs=1e-12)
    assert csv.loc[csv.end<300,'cox'].isna().all()
    assert len(explain_window(a,w['window_id'])['pairs'])==30


def test_cached_run_skips_core_and_changed_config_recomputes(tmp_path,monkeypatch):
    monkeypatch.setattr(runs,'DATA',tmp_path)
    config=AnalysisConfig()
    a=runs.run_analysis(None,config,{'scenario':'coupled'})
    def unexpected(*args,**kwargs): raise AssertionError('core called')
    monkeypatch.setattr(runs,'analyze',unexpected)
    assert runs.run_analysis(None,config,{'scenario':'coupled'})==json.loads(json.dumps(a))
    with pytest.raises(AssertionError,match='core called'):
        runs.run_analysis(None,AnalysisConfig(window_seconds=600),{'scenario':'coupled'})


def test_full_signal_payload_keeps_actual_timestamps():
    times=np.arange(0.,12000.,2.)
    frame=pd.DataFrame({'time':times,'value':70+np.sin(times),'valid':True,'conflict':False})
    small=signal_payload({'map':frame},0,12000,4000)
    full=signal_payload({'map':frame},0,12000,None)
    assert len(small['map'])<len(full['map'])==6000
    assert [p['time'] for p in full['map']]==times.tolist()
    assert [p['value'] for p in full['map']]==frame.value.tolist()

def test_downsampling_does_not_make_false_gaps_or_change_core():
    from backend.car_core.synthetic import generate
    tracks=generate()
    small=signal_payload(tracks,0,1800,100)
    large=signal_payload(tracks,0,1800,10000)
    assert len(small['map'])<len(large['map'])
    assert not any(p['flags']=='record_gap' for p in small['map'])
    assert max(p['value'] for p in small['map'] if p['value'] is not None)==max(tracks['map'].value)

def test_annotations_optimistic_lock_and_history(tmp_path,monkeypatch):
    import backend.app.main as main
    monkeypatch.setattr(main,'DATA',tmp_path); monkeypatch.setattr(runs,'DATA',tmp_path)
    monkeypatch.setattr(vitaldb,'get_case',lambda cid:{'caseid':cid})
    body={'version':0,'items':[{'channel':'left','start':100,'end':200,'reason':'test'}]}
    r=client.post('/api/cases/1/annotations',json=body)
    assert r.status_code==200 and r.json()['version']==1
    assert client.post('/api/cases/1/annotations',json=body).status_code==409
    assert (tmp_path/'cases/1/annotation_history/1.json').exists()
    body['version']=1; body['items'][0]['end']=99
    assert client.post('/api/cases/1/annotations',json=body).status_code==422

def test_real_offline_if_available(monkeypatch,tmp_path):
    try: tracks,manifest=vitaldb.load_tracks(251)
    except FileNotFoundError: pytest.skip('optional real cache')
    monkeypatch.setattr(vitaldb,'fetch',lambda *a,**kw:(_ for _ in ()).throw(AssertionError('offline')))
    monkeypatch.setattr(runs,'DATA',tmp_path)
    a=runs.run_analysis(251,AnalysisConfig(sensitivity=True))
    b=runs.run_analysis(251,AnalysisConfig(sensitivity=True))
    assert a['run_id']==b['run_id'] and a['summary']['left']['valid_outputs']>0
    monkeypatch.setattr(runs,'annotations_for',lambda cid:{'version':1,'items':[{'channel':'left','start':0,'end':10000,'reason':'test'}]})
    c=runs.run_analysis(251,AnalysisConfig(sensitivity=True))
    assert c['run_id']!=a['run_id'] and c['annotation_hash']!=a['annotation_hash']
    monkeypatch.setattr(vitaldb,'load_tracks',lambda cid:(_ for _ in ()).throw(AssertionError('must use frozen manifest')))
    # Old-run explanations must not read a newly selected case cache version.
    assert client.get(f'/api/analyses/{a["run_id"]}/blocks/200').status_code==200
    assert client.get(f'/api/analyses/{a["run_id"]}/signals').status_code==200
    full=client.get(f'/api/analyses/{a["run_id"]}/signals?full=true').json()
    assert full['full_resolution']
    for channel,stats in full['sampling'].items():
        assert stats['display_points']==stats['raw_points']==len(tracks[channel])

def test_interrupted_track_cache_is_rebuilt(tmp_path,monkeypatch):
    monkeypatch.setattr(vitaldb,'DATA',tmp_path)
    tid='a'*40
    meta={'tid':tid,'tname':'Solar8000/ART_MBP','unit':'mmHg','nominal_interval':2}
    monkeypatch.setattr(vitaldb,'get_case',lambda cid:{'caseid':cid,'tracks':{'map':meta}})
    raw=b'Time,Value\n0,70\n2,71\n4,72\n'
    partial=tmp_path/'tracks'/tid/'raw.csv';partial.parent.mkdir(parents=True);partial.write_bytes(b'partial')
    monkeypatch.setattr(vitaldb,'fetch',lambda *a,**kw:raw)
    manifest=vitaldb.download_case(1)
    assert manifest['tracks']['map']['sha256']==store.digest(raw)
    assert vitaldb.load_tracks(1)[0]['map'].value.tolist()==[70,71,72]
