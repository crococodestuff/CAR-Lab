from dataclasses import replace
from io import BytesIO
import numpy as np
import pandas as pd
import pytest
from backend.car_core.config import AnalysisConfig
from backend.car_core.quality import mark_quality
from backend.car_core.analysis import analyze
from backend.car_core.mapopt import analyze_mapopt
from backend.app.main import signal_payload
from backend.app.services import runs


def frame(values):
    return pd.DataFrame({'time':np.arange(len(values))*2.,'value':values,'valid':True,'conflict':False})


def test_numeric_boundaries_device_codes_manual_and_immutable_raw():
    source=frame([None,'error',-1,0,19.9,20,200,200.1,999,80,85,90])
    source.loc[9,'valid']=False
    original=source.copy(deep=True)
    config=AnalysisConfig(map_error_codes=(999,))
    f,_=mark_quality(source,'map',config,[{'channel':'map','start':20,'end':22}])
    pd.testing.assert_frame_equal(source,original)
    assert f.valid.tolist()==[False,False,False,True,True,True,True,True,False,False,False,True]
    assert f.loc[~f.valid,'MAP_clean'].isna().all()
    assert f.loc[f.valid,'MAP_clean'].equals(f.loc[f.valid,'MAP_raw'])
    for i,flag in [(2,'map_negative'),(3,'map_zero_review'),(4,'map_low_review'),(7,'map_high_review'),(8,'device_error_code'),(9,'source_invalid'),(10,'manual_exclusion')]:
        assert flag in f.loc[i,'quality_flag']
    assert 'map_low_review' not in f.loc[5,'quality_flag']
    assert 'map_high_review' not in f.loc[6,'quality_flag']
    payload=signal_payload({'map':source},0,24,None,config)['map']
    assert payload[2]['MAP_raw']==-1 and payload[2]['MAP_clean'] is None
    assert payload[7]['MAP_clean']==200.1


def test_review_parameters_do_not_clip_or_exclude_extremes():
    source=frame([0,10,20,21,200,201,220])
    config=AnalysisConfig(map_review_low=21,map_review_high=201,exclude_suspect=True,jump_map=1000)
    f,_=mark_quality(source,'map',config,[])
    assert f.valid.all() and f.MAP_raw.equals(f.MAP_clean)
    assert 'map_low_review' in f.loc[2,'flags']
    assert 'map_high_review' not in f.loc[5,'flags']
    assert 'map_high_review' in f.loc[6,'flags']
    assert 'map_low_review' not in mark_quality(source,'left',config,[])[0]['flags'].to_list()


@pytest.mark.parametrize('kwargs',[{'map_review_low':0},{'map_review_low':200},{'map_review_high':float('inf')},{'map_error_codes':[float('nan')]},{'map_error_codes':['bad']}])
def test_parameter_validation(kwargs):
    with pytest.raises(ValueError): AnalysisConfig(**kwargs)


def test_negative_cleaning_preserves_gaps_and_changes_cox_and_mapopt_inputs():
    time=np.arange(0,902,2.)
    values=60+np.floor(time/10)%30
    tracks={k:pd.DataFrame({'time':time,'value':values.copy(),'valid':True,'conflict':False}) for k in ('map','left','right')}
    tracks['map'].loc[tracks['map'].time.between(400,408),'value']=-5
    config=AnalysisConfig()
    cleaned=analyze(tracks,config)
    legacy=analyze(tracks,replace(config,map_quality_enabled=False))
    assert cleaned['blocks'][40]['map']['mean'] is None
    assert cleaned['blocks'][40]['map']['count']==0
    assert legacy['blocks'][40]['map']['mean']==-5
    assert any(w['cox'] is not None for w in legacy['windows'] if w['end']==410)
    assert all(w['cox'] is None for w in cleaned['windows'] if 410<=w['end']<=700)
    report=analyze_mapopt({**cleaned,'mode':'synthetic','run_id':'test'})
    for r in report['results']:
        assert all(not (p['start']<410 and p['end']>400) for p in r['points'])


def test_snapshot_fingerprint_and_legacy_policy(tmp_path,monkeypatch):
    monkeypatch.setattr(runs,'DATA',tmp_path)
    a=runs.run_analysis(None,AnalysisConfig(),{'scenario':'coupled'})
    frozen=runs.map_quality_csv(a)
    b=runs.run_analysis(None,AnalysisConfig(map_review_low=80),{'scenario':'coupled'})
    assert a['run_id']!=b['run_id'] and a['windows']==b['windows']
    assert a['map_quality']['review_points']<b['map_quality']['review_points']
    assert runs.map_quality_csv(a)==frozen
    df=pd.read_csv(BytesIO(frozen))
    assert df.MAP_raw.equals(df.MAP_clean)
    old=AnalysisConfig.from_saved({})
    assert not old.map_quality_enabled
    assert mark_quality(frame([-1]),'map',old,[])[0].MAP_clean.iloc[0]==-1
    assert runs.map_quality_csv({'config':{}}) is None
