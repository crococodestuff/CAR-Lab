import copy
import json
import numpy as np
import pytest
from fastapi.testclient import TestClient
from backend.car_core.mapopt import quadratic_fit, analyze_mapopt, formula_example, summarize
from backend.car_core.analysis import analyze
from backend.car_core.config import AnalysisConfig
from backend.car_core.cox import rolling_cox
from backend.car_core.synthetic import generate
from backend.app.main import app
from backend.app.services import mapopt as service


def test_exact_user_formula_and_translation_stability():
    x=np.linspace(40,60,41)
    fit=quadratic_fit(x,.004*(x-50)**2+.10)
    assert fit['mapopt']==pytest.approx(50,abs=1e-10)
    assert fit['minimum_cox']==pytest.approx(.10)
    assert fit['coefficients']==pytest.approx({'a':.004,'b':-.4,'c':10.1})
    assert fit['r_squared']==pytest.approx(1)
    assert fit['curve'][0][0]==40 and fit['curve'][-1][0]==60
    shifted=quadratic_fit(x+1e5,.004*(x-50)**2+.10)
    assert shifted['mapopt']==pytest.approx(100050)
    assert formula_example()['results'][0]['fit']['mapopt']==pytest.approx(50)


def test_nonpositive_map_cannot_become_an_accepted_optimum():
    x=np.linspace(-10,100,111)
    fit=quadratic_fit(x,.0001*(x-50)**2)
    assert fit['vertex']==pytest.approx(50)
    assert fit['mapopt'] is None and 'nonpositive_map' in fit['reasons']
    windows=[{'side':'left','window_id':str(i),'start':i*10,'end':i*10+300,
              'support_start':i*10+290,'support_end':i*10+300,'mean_map':i,
              'cox':.0001*(i-50)**2} for i in range(101)]
    binned=summarize(windows,'left',300,{'start':0,'end':2000},'bins',5)
    assert binned['bins'][0]['mean_map']>0
    assert binned['fit']['mapopt'] is None and 'nonpositive_map' in binned['fit']['reasons']


@pytest.mark.parametrize('x,y,reason',[
    ([40,45,50,55],[.4,.2,.1,.2],'insufficient_fit_points'),
    ([50]*10,list(range(10)),'insufficient_fit_points'),
    (list(range(10)),[.5]*10,'not_upward'),
    (list(range(10)),[-.001*(x-5)**2 for x in range(10)],'not_upward'),
    (list(range(10)),[.001*(x-20)**2 for x in range(10)],'vertex_outside_range'),
    (list(range(10)),[.001*(x-5)**2-2 for x in range(10)],'minimum_outside_cox'),
    (list(range(10)),[1,-1]*5,'weak_fit'),
    (list(range(10)),[0,1,2,3,4,5,6,7,8,float('nan')],'nonfinite_fit_input'),
])
def test_rejected_fits_do_not_report_mapopt(x,y,reason):
    fit=quadratic_fit(x,y)
    assert fit['mapopt'] is None and reason in fit['reasons']


def test_frozen_blocks_multiwindow_side_pairs_and_support():
    result=analyze(generate(),AnalysisConfig())
    result.update(run_id='a'*64,mode='synthetic')
    before=copy.deepcopy(result)
    report=analyze_mapopt(result)
    assert result==before
    assert {(r['window_seconds'],r['side']) for r in report['results']}=={(w,s) for w in (180,300,600,1200,1800,3600,5400,7200) for s in ('left','right')}
    for r in report['results']:
        reference=rolling_cox(result['blocks'],AnalysisConfig(window_seconds=r['window_seconds']))
        reference=[w for w in reference if w['side']==r['side'] and w['start']>=0 and w['cox'] is not None]
        assert [(p['map'],p['cox']) for p in r['points']]==[(w['mean_map'],w['cox']) for w in reference]
        assert r['support_seconds']==len(reference)*10
        assert sum(b['outputs'] for b in r['bins'])==r['valid_outputs']
    binned=analyze_mapopt(result,method='bins')
    for r in binned['results']: assert r['fit_points']==len(r['bins'])
    json.dumps(report,allow_nan=False)


def test_day_boundaries_and_nonfinite_null_points():
    windows=[{'side':'left','window_id':str(i),'start':start,'end':end,'support_start':end-10,'support_end':end,
              'mean_map':50+i,'cox':value} for i,(start,end,value) in enumerate([
              (86000,86300,.2),(86300,86600,.3),(86400,86700,.4),(86500,86800,None),(86600,86900,float('nan'))])]
    r=summarize(windows,'left',300,{'start':86400,'end':90000},'windows',5)
    assert [p['start'] for p in r['points']]==[86400]
    assert r['cross_boundary_outputs']==1 and r['excluded_outputs']==2
    assert r['support_seconds']==10 and r['fit']['mapopt'] is None


def test_cached_report_and_api_validation(tmp_path,monkeypatch):
    result=analyze(generate(scenario='constant'),AnalysisConfig())
    result.update(run_id='a'*64,mode='synthetic')
    monkeypatch.setattr(service,'DATA',tmp_path)
    monkeypatch.setattr(service,'get_run',lambda _:result)
    monkeypatch.setattr(service,'code_version',lambda:'test-code')
    client=TestClient(app)
    url='/api/analyses/'+'a'*64+'/mapopt'
    response=client.get(url)
    assert response.status_code==200
    report=response.json()
    assert all(r['fit']['mapopt'] is None for r in report['results'])
    monkeypatch.setattr(service,'analyze_mapopt',lambda *a,**k:(_ for _ in ()).throw(AssertionError('must use cache')))
    assert client.get(url+'?method=windows&width=5&day=0').json()==report
    assert 'attachment' in client.get(url+'?download=true').headers['content-disposition']
    assert client.get(url+'?method=invalid').status_code==422
    assert client.get(url+'?width=3').status_code==422
    assert client.get(url+'?day=-1').status_code==422
    example=client.get('/api/mapopt/example').json()
    assert example['mode']=='formula_demo' and example['source_run_id'] is None


def test_two_hour_window_uses_all_720_blocks_and_keeps_sides_independent():
    config=AnalysisConfig()
    x=65+12*np.sin(np.arange(900)/71)
    y=70+5*np.sin(np.arange(900)/89)+.1*x
    blocks=[{'start':i*10,'end':(i+1)*10,
             'map':{'valid':True,'mean':float(x[i])},
             'left':{'valid':True,'mean':float(y[i])},
             'right':{'valid':i!=10,'mean':float(y[i])}} for i in range(900)]
    result={'config':config.to_dict(),'range':{'start':0,'end':9000},'blocks':blocks,
            'windows':rolling_cox(blocks,config),'mode':'synthetic','run_id':'b'*64}
    before=copy.deepcopy(result)
    report=analyze_mapopt(result)
    assert report['skipped_window_seconds']==[] and len(report['results'])==16
    left=next(r for r in report['results'] if r['window_seconds']==7200 and r['side']=='left')
    right=next(r for r in report['results'] if r['window_seconds']==7200 and r['side']=='right')
    assert left['points'][0]['start']==0 and left['points'][0]['end']==7200
    assert left['points'][0]['cox']==pytest.approx(np.corrcoef(x[:720],y[:720])[0,1],abs=1e-12)
    assert left['points'][0]['map']==pytest.approx(np.mean(x[:720]))
    assert right['points'][0]['start']==110 and right['points'][0]['end']==7310
    assert all(p['end']-p['start']==7200 for p in left['points']+right['points'])
    assert left['support_seconds']==len(left['points'])*10
    assert result==before


def test_long_window_limits_and_short_record_are_explicit():
    for seconds in (3600,5400,7200):
        assert AnalysisConfig(window_seconds=seconds).required_pairs==seconds//10
    assert AnalysisConfig(block_seconds=5,window_seconds=7200).required_pairs==1440
    with pytest.raises(ValueError): AnalysisConfig(window_seconds=7210)
    result=analyze(generate(),AnalysisConfig())
    result.update(run_id='c'*64,mode='synthetic')
    report=analyze_mapopt(result)
    for r in report['results']:
        if r['window_seconds']>1800:
            assert r['valid_outputs']==0 and r['points']==[]
            assert r['fit']['mapopt'] is None
