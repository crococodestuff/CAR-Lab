from dataclasses import replace
import json
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
import backend.app.main as main
from backend.car_core.config import AnalysisConfig
from backend.car_core.quality import mark_quality
from backend.car_core.raw_summary import summarize_quality
from backend.car_core.signals import signal_payload
from backend.car_core.analysis import analyze
from backend.car_core.mapopt import analyze_mapopt


def frame(values, interval=5):
    return pd.DataFrame({'time':np.arange(len(values))*interval,'value':values,'valid':True,'conflict':False})


def test_nirs_range_inclusive_raw_immutable_and_review_mode():
    source=frame([None,'bad',14.9,15,70,95,95.1,100])
    old=source.copy(deep=True)
    config=AnalysisConfig()
    cleaned,_=mark_quality(source,'left',config,[])
    assert cleaned.valid.tolist()==[False,False,False,True,True,True,False,False]
    assert cleaned.loc[~cleaned.valid,'NIRS_clean'].isna().all()
    assert cleaned.loc[cleaned.valid,'NIRS_clean'].equals(cleaned.loc[cleaned.valid,'NIRS_raw'])
    assert 'nirs_below_range' in cleaned.loc[2,'flags']
    assert 'nirs_above_range' in cleaned.loc[6,'flags']
    assert 'ceiling_candidate' in cleaned.loc[5,'flags'] and cleaned.loc[5,'valid']
    pd.testing.assert_frame_equal(source,old)
    review,_=mark_quality(source,'right',replace(config,nirs_range_action='review'),[])
    assert review.valid.tolist()==[False,False,True,True,True,True,True,True]
    payload=signal_payload({'left':source},0,40,None,config)['left']
    assert payload[2]['NIRS_raw']==14.9 and payload[2]['NIRS_clean'] is None
    assert payload[5]['NIRS_clean']==95
    legacy=AnalysisConfig.from_saved({})
    assert not legacy.nirs_quality_enabled
    assert mark_quality(frame([10,99]),'left',legacy,[])[0].valid.all()


@pytest.mark.parametrize('patch',[{'nirs_range_low':-1},{'nirs_range_high':101},{'nirs_range_low':95},
                                 {'nirs_range_low':float('nan')},{'nirs_range_high':True},
                                 {'nirs_quality_enabled':1},{'nirs_range_action':'clip'}])
def test_nirs_validation(patch):
    with pytest.raises(ValueError): AnalysisConfig(**patch)


def test_quality_counts_deduplicate_and_use_full_fixed_range():
    tracks={'left':frame([999,10,15,80,95,96,None]),'map':frame([0,70,80,210,90,95,100])}
    config=AnalysisConfig(jump_map=1000,jump_rso2=1000)
    marks=[{'channel':'left','start':20,'end':25}]
    stats=summarize_quality(tracks,5,30,config,marks)
    q=stats['left']
    assert q['before']['observations']==6 and q['before']['finite_observations']==5
    assert q['flagged_points']==4 and q['excluded_points']==4 and q['review_only_points']==0
    assert q['after']['observations']==2 and q['after']['mean']==47.5
    assert q['after']['sample_sd']==pytest.approx(np.std([15,80],ddof=1))
    assert q['excluded_fraction']==4/6
    assert stats['map']['flagged_points']==1 and stats['map']['excluded_points']==0
    assert stats['right']['before']['observations']==0 and stats['right']['excluded_fraction'] is None
    single=summarize_quality({'left':frame([10,70,96])},0,10,config)['left']
    assert single['after']['sample_sd'] is None and single['after']['mean']==70
    none=summarize_quality({'left':frame([10,96])},0,10,config)['left']
    assert none['after']['observations']==0 and none['after']['minimum'] is None
    json.dumps(stats,allow_nan=False)


def test_side_specific_exclusion_propagates_to_cox_and_mapopt():
    time=np.arange(0,902,2.)
    tracks={k:pd.DataFrame({'time':time,'value':60+np.floor(time/10)%30,'valid':True,'conflict':False}) for k in ('map','left','right')}
    tracks['left'].loc[tracks['left'].time.between(400,408),'value']=100
    config=AnalysisConfig()
    before=analyze(tracks,replace(config,nirs_quality_enabled=False))
    after=analyze(tracks,config)
    assert after['blocks'][40]['left']['mean'] is None
    assert after['blocks'][40]['right']['valid']
    assert before['summary']['right']==after['summary']['right']
    assert before['summary']['left']['computable_seconds']>after['summary']['left']['computable_seconds']
    report=analyze_mapopt({**after,'run_id':'test','mode':'synthetic'})
    assert all(not(p['start']<410 and p['end']>400) for r in report['results'] if r['side']=='left' for p in r['points'])


def test_preview_uses_requested_policy_but_does_not_mutate_saved_run(monkeypatch):
    tracks={'map':frame([70,75,80]),'left':frame([10,70,96])}
    r={'range':{'start':0,'end':10},'mode':'synthetic','config':AnalysisConfig.from_saved({}).to_dict(),
       'annotations':[],'manifest':{'generator':{},'tracks':{k:{} for k in tracks}}}
    original=json.dumps(r,sort_keys=True)
    monkeypatch.setattr(main.runs,'get_run',lambda _:r)
    monkeypatch.setattr(main,'generate',lambda **kwargs:tracks)
    client=TestClient(main.app)
    url='/api/analyses/'+'a'*64+'/quality-preview'
    q=client.post(url,json={'config':AnalysisConfig().to_dict(),'items':[]}).json()['left']
    assert q['excluded_points']==2 and q['flagged_points']==3
    q=client.post(url,json={'config':AnalysisConfig(nirs_range_action='review').to_dict(),'items':[]}).json()['left']
    assert q['excluded_points']==0 and q['flagged_points']==3
    assert json.dumps(r,sort_keys=True)==original
    saved=client.get('/api/analyses/'+'a'*64+'/signals?full=true').json()
    assert saved['quality_comparison']['left']['excluded_points']==0
    assert client.post(url,json={'config':{'nirs_range_low':99},'items':[]}).status_code==422
