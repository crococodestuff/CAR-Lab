import json
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
import backend.app.main as main
from backend.car_core.raw_summary import summarize_raw
from backend.car_core.config import AnalysisConfig


def test_raw_statistics_count_nonfinite_and_keep_finite_excluded_values():
    frame=pd.DataFrame({'time':[-1,0,1,2,3,4,5,6,7,8],
                        'value':[999,10,20,30,None,'bad',float('inf'),float('-inf'),float('nan'),999],
                        'valid':False,'conflict':True})
    original=frame.copy(deep=True)
    stats=summarize_raw({'map':frame},0,7)['map']
    assert stats=={'observations':8,'finite_observations':3,'nonfinite_observations':5,
                   'nonfinite_fraction':5/8,'minimum':10.,'maximum':30.,'mean':20.,'sample_sd':10.}
    pd.testing.assert_frame_equal(frame,original)
    extreme=pd.DataFrame({'time':[0,1,2],'value':[-10.,0.,250.]})
    stats=summarize_raw({'map':extreme},0,2)['map']
    assert stats['minimum']==-10 and stats['maximum']==250
    assert stats['sample_sd']==pytest.approx(np.std([-10.,0.,250.],ddof=1))


def test_missing_side_single_point_and_empty_range_are_not_zero_sd():
    tracks={'map':pd.DataFrame({'time':[0,1],'value':[float('nan'),float('inf')]}),
            'left':pd.DataFrame({'time':[0],'value':[72.]})}
    stats=summarize_raw(tracks,0,1)
    assert stats['map']['mean'] is None and stats['map']['sample_sd'] is None
    assert stats['map']['nonfinite_fraction']==1
    assert stats['left']['minimum']==stats['left']['maximum']==72
    assert stats['left']['sample_sd'] is None
    assert stats['right']['observations']==0 and stats['right']['nonfinite_fraction'] is None
    assert summarize_raw(tracks,20,30)['left']['minimum'] is None
    constant={'map':pd.DataFrame({'time':[0,1],'value':[72.,72.]})}
    assert summarize_raw(constant,0,1)['map']['sample_sd']==0
    json.dumps(stats,allow_nan=False)


def test_signal_api_summary_uses_full_source_before_quality_and_downsampling(monkeypatch):
    time=np.arange(6000.)*2
    values=70+np.sin(time)
    values[0]=-10
    frame=pd.DataFrame({'time':time,'value':values,'valid':True,'conflict':False})
    result={'range':{'start':0,'end':12000},'mode':'synthetic','config':AnalysisConfig().to_dict(),
            'annotations':[{'channel':'map','start':0,'end':100,'reason':'test'}],
            'manifest':{'generator':{},'tracks':{'map':{'nominal_interval':2}}}}
    monkeypatch.setattr(main.runs,'get_run',lambda _:result)
    monkeypatch.setattr(main,'generate',lambda **kwargs:{'map':frame})
    client=TestClient(main.app)
    small=client.get('/api/analyses/'+'a'*64+'/signals').json()
    full=client.get('/api/analyses/'+'a'*64+'/signals?full=true').json()
    assert len(small['signals']['map'])<len(full['signals']['map'])==6000
    assert small['raw_summary']==full['raw_summary']
    stats=small['raw_summary']['map']
    assert stats['observations']==stats['finite_observations']==6000
    assert stats['minimum']==-10 and stats['mean']==pytest.approx(values.mean())
    assert stats['sample_sd']==pytest.approx(values.std(ddof=1))
    assert full['signals']['map'][0]['MAP_clean'] is None
