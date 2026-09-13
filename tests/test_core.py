import gzip
import math
from dataclasses import replace
from io import BytesIO
import json
import zipfile
import numpy as np
import pandas as pd
import pytest
from scipy.stats import pearsonr
from backend.car_core.config import AnalysisConfig
from backend.car_core.ingest import normalize_track
from backend.car_core.aggregate import aggregate_track
from backend.car_core.analysis import analyze,explain_window,compare_runs,fingerprint
from backend.car_core.synthetic import generate
from backend.app.services.export import export_zip


def frame(t,v):
    return pd.DataFrame({'time':t,'value':v,'valid':np.isfinite(v),'conflict':False})

def linear(a=2,end=900):
    ts=np.arange(end+1,dtype=float)
    vals=50+np.floor(ts/10)%37
    return {k:frame(ts[::n], (vals if k=='map' else 60+a*(vals-68)/3)[::n]) for k,n in [('map',2),('left',5),('right',5)]}

@pytest.mark.parametrize('slope',[2,-3])
def test_linear_and_independent_pearson(slope):
    r=analyze(linear(slope),AnalysisConfig())
    w=next(w for w in r['windows'] if w['end']==300 and w['side']=='left')
    assert w['cox']==pytest.approx(math.copysign(1,slope),abs=1e-10)
    rows=explain_window(r,w['window_id'])['pairs']
    expected=pearsonr([p['map'] for p in rows],[p['rso2'] for p in rows]).statistic
    assert w['cox']==pytest.approx(expected,abs=1e-10)

def test_constant_null_and_synthetic_reproducibility():
    t=generate('constant'); r=analyze(t,AnalysisConfig())
    assert all(w['cox'] is None for w in r['windows'])
    assert 'zero_variance' in r['windows'][-1]['reasons']
    assert generate('coupled')['left'].equals(generate('coupled')['left'])
    values=[w['cox'] for w in analyze(generate('independent'),AnalysisConfig())['windows'] if w['cox'] is not None]
    assert len(values)>100 and abs(np.mean(values))<.5

def test_grid_boundary_and_warmup():
    r=analyze(linear(),AnalysisConfig())
    assert all(w['cox'] is None for w in r['windows'] if w['end']<300)
    assert all(w['cox'] is not None for w in r['windows'] if w['end']==300)
    assert r['blocks'][1]['map']['mean']==51
    rr=analyze(linear(),AnalysisConfig(start=3,end=607))
    assert rr['blocks'][0]['start']==0 and not rr['blocks'][0]['map']['valid']
    assert rr['blocks'][-1]['end']==610 and not rr['blocks'][-1]['map']['valid']
    assert max(w['end'] for w in rr['windows'])==600
    assert next(w['end'] for w in rr['windows'] if w['cox'] is not None)==310
    assert rr['blocks'][20]['map']['mean']==r['blocks'][20]['map']['mean']

def test_irregular_support_matches_manual_union_and_no_row_alignment():
    f=frame([0.,4.,9.,10.,14.,20.],[30.,40.,50.,60.,70.,80.])
    rows=aggregate_track(f,'left',5,AnalysisConfig(),[],20)
    assert rows[0]['mean']==40
    assert rows[0]['coverage']==1
    assert rows[1]['mean']==65
    assert rows[1]['coverage']==.9
    # Last point cannot create support beyond the record end.
    rows=aggregate_track(frame([0.],[10.]),'left',5,AnalysisConfig(),[],10)
    assert rows[0]['coverage']==0

def test_missing_keeps_absolute_grid_and_sides_independent():
    t=linear(); t['left'].loc[(t['left'].time>=400)&(t['left'].time<460),'valid']=False
    r=analyze(t,AnalysisConfig())
    at=lambda side,end:next(w for w in r['windows'] if w['side']==side and w['end']==end)
    assert at('left',600)['cox'] is None
    assert at('right',600)['cox'] is not None
    assert at('left',600)['valid_pairs']==24
    relaxed=analyze(t,AnalysisConfig(sensitivity=True))
    w=next(w for w in relaxed['windows'] if w['side']=='left' and w['end']==600)
    assert w['valid_pairs']==24 and w['cox']==pytest.approx(1)
    assert 'window_has_gaps' in w['hints']

def test_annotation_subtracts_support_even_without_observation_inside():
    f=frame([0.,5.,10.],[60.,60.,60.])
    a=[{'channel':'left','start':2,'end':4,'reason':'test'}]
    r=aggregate_track(f,'left',5,AnalysisConfig(),a,10)[0]
    assert r['count']==2 and r['coverage']==pytest.approx(.8)
    # An excluded long interval cannot be bridged by preceding values.
    b=aggregate_track(f,'left',5,AnalysisConfig(),[{'channel':'left','start':1,'end':9}],10)[0]
    assert not b['valid'] and b['max_uncovered_seconds']>=8

def test_count_cannot_mask_long_gap():
    f=frame([0.,.01,.02,.03,9.,10.],[1,2,3,4,5,6])
    b=aggregate_track(f,'map',2,AnalysisConfig(min_block_coverage=.1),[],10)[0]
    assert b['count']==5 and not b['valid'] and 'long_gap' in b['flags']

def test_including_and_excluding_annotations_changes_only_selected_side():
    data=linear(); c=AnalysisConfig()
    ann=[{'channel':'left','start':300,'end':700,'reason':'test'}]
    a=analyze(data,c,ann); b=analyze(data,replace(c,use_annotations=False),ann)
    assert a['summary']['left']['computable_seconds']<b['summary']['left']['computable_seconds']
    assert a['summary']['right']==b['summary']['right']

def test_duplicate_conflicts_nonfinite_and_compression():
    raw=b'Time,test\n10,5\n0,1\n0,1\n5,2\n5,3\n7,nan\ninf,3\n'
    f,s=normalize_track(raw)
    assert s['duplicate_rows']==2 and s['conflict_timestamps']==1 and s['invalid_time']==1
    assert list(f.time)==[0,5,7,10]
    assert f.loc[f.time==5,'valid'].item()==False
    assert normalize_track(gzip.compress(raw))[0].equals(f)
    for bad in [b'<html>Error</html>',b'Time,Value\n',b'row,a,b\n1,2,3',b'foo,bar\n1,2']:
        with pytest.raises(ValueError): normalize_track(bad)

def test_window_size_pair_ceiling_and_bad_configs():
    assert AnalysisConfig(window_seconds=600).required_pairs==60
    assert AnalysisConfig(window_seconds=180,sensitivity=True,min_pair_ratio=.81).required_pairs==15
    for kwargs in [{'window_seconds':301},{'step_seconds':15},{'min_block_coverage':0},{'start':-1},{'end':float('nan')},{'window_seconds':10}]:
        with pytest.raises(ValueError): AnalysisConfig(**kwargs)

def test_duration_reference_and_common_denominator():
    a=analyze(linear(),AnalysisConfig(reference=.3)); b=analyze(linear(),AnalysisConfig(window_seconds=600))
    assert a['summary']['left']['computable_seconds']==610
    assert a['summary']['left']['above_reference_fraction']==1
    assert a['summary']['left']['no_result_seconds']==290
    comp=compare_runs(a,b)['left']
    assert comp['common_seconds']==310 and comp['a_seconds']==610
    assert abs(comp['mean_difference_common'])<1e-12

def test_hand_small_sample_exact_formula():
    t=linear(end=40)
    for key,vals in [('map',[2,7,1,9]),('left',[35,33,34,38])]:
        f=t[key]; f['value']=[vals[min(int(tt//10),3)] for tt in f.time]
    r=analyze(t,AnalysisConfig(window_seconds=40))
    w=next(w for w in r['windows'] if w['end']==40 and w['side']=='left')
    assert w['cox']==pytest.approx(pearsonr([2,7,1,9],[5,3,4,8]).statistic,abs=1e-10)

def test_coverage_independent_reference_real_if_cached():
    from backend.app.services.vitaldb import load_tracks
    try: t,_=load_tracks(251)
    except FileNotFoundError: pytest.skip('optional local real cache')
    r=aggregate_track(t['left'],'left',5,AnalysisConfig(),[],float(t['left'].time.max()))
    f=t['left']; times=f.time.to_numpy(); valid=f.valid.to_numpy()
    # Independent interval intersection summation on selected complete blocks.
    for k in [200,201,202,500,1000]:
        a,b=k*10,(k+1)*10; total=0
        for i in range(len(times)-1):
            if valid[i]: total+=max(0,min(b,times[i+1],times[i]+5)-max(a,times[i]))
        assert r[k]['coverage']==pytest.approx(total/10,abs=1e-10)
