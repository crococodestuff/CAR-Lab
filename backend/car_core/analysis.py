from collections import Counter
from hashlib import sha256
import json
import numpy as np
import pandas as pd
from . import ALGORITHM_VERSION
from .aggregate import aggregate_track
from .cox import rolling_cox
from .stratify import stratify


def fingerprint(value):
    return sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,allow_nan=False).encode()).hexdigest()


def analyze(tracks, config, annotations=(), nominal=None):
    if 'map' not in tracks or not ({'left','right'} & tracks.keys()):
        raise ValueError('需要有创 MAP 和至少一侧脑氧')
    nominal=nominal or {'map':2,'left':5,'right':5,'spo2':2,'etco2':2,'hr':2}
    end=config.end if config.end is not None else max(float(f.time.max()) for f in tracks.values())
    if end <= config.start or end-config.start > 172800: raise ValueError('范围需为正且不超过 48 小时')
    missing=pd.DataFrame({'time':[config.start,end],'value':[np.nan,np.nan],'valid':[False,False],'conflict':[False,False]})
    agg={key:aggregate_track(tracks.get(key,missing),key,nominal[key],config,annotations,end) for key in ('map','left','right')}
    blocks=[{'start':r['start'],'end':r['end'],**{key:vals[i] for key,vals in agg.items()}} for i,r in enumerate(agg['map'])]
    windows=rolling_cox(blocks,config)
    windows=[w for w in windows if w['end']<=end]
    summary={}
    for side in config.sides:
        ws=[w for w in windows if w['side']==side]; good=[w for w in ws if w['cox'] is not None]
        seconds=sum(w['support_end']-w['support_start'] for w in good)
        overlap=0
        if side in tracks:
            overlap=max(0,min(end,float(tracks['map'].time.max()),float(tracks[side].time.max()))-max(config.start,float(tracks['map'].time.min()),float(tracks[side].time.min())))
        summary[side]={'selected_seconds':end-config.start,'raw_overlap_seconds':overlap,'quality_seconds':sum(config.block_seconds for b in blocks if b['map']['valid'] and b[side]['valid']),'computable_seconds':seconds,'no_result_seconds':end-config.start-seconds,'valid_outputs':len(good),'null_reasons':dict(Counter(r for w in ws if w['cox'] is None for r in w['reasons'])),'above_reference_fraction':sum(w['support_end']-w['support_start'] for w in good if config.reference is not None and w['cox']>config.reference)/seconds if seconds and config.reference is not None else None}
    return {'algorithm_version':ALGORITHM_VERSION,'config':config.to_dict(),'range':{'start':config.start,'end':end},'blocks':blocks,'windows':windows,'map_bins':stratify(windows,config.map_bin_width),'summary':summary}


def explain_window(result, window_id):
    w=next((w for w in result['windows'] if w['window_id']==window_id),None)
    if w is None: raise KeyError('窗口不存在')
    side=w['side']
    rows=[{'start':b['start'],'end':b['end'],'map':b['map']['mean'],'rso2':b[side]['mean'],'valid':b['map']['valid'] and b[side]['valid'],'map_coverage':b['map']['coverage'],'rso2_coverage':b[side]['coverage'],'flags':sorted(set(b['map']['flags']+b[side]['flags']))} for b in result['blocks'] if b['start']>=w['start'] and b['end']<=w['end']]
    return {**w,'pairs':rows,'config_hash':result.get('config_hash'),'interpretation':'当前窗口不可计算；请查看阻止配对的时间块。' if w['cox'] is None else ('这一窗口内 MAP 与脑氧呈同向变化。' if w['cox']>0 else '这一窗口内 MAP 与脑氧呈反向或弱关联变化。')+'这描述信号关系；仍需考虑氧合、通气、氧耗和信号质量，不能直接给出诊断。'}


def compare_runs(a,b):
    out={}
    for side in ('left','right'):
        wa=[w for w in a['windows'] if w['side']==side and w['cox'] is not None]
        wb=[w for w in b['windows'] if w['side']==side and w['cox'] is not None]
        i=j=0; seconds=sa=sb=0.
        while i<len(wa) and j<len(wb):
            x,y=wa[i],wb[j]
            duration=max(0,min(x['support_end'],y['support_end'])-max(x['support_start'],y['support_start']))
            seconds+=duration; sa+=duration*x['cox']; sb+=duration*y['cox']
            if x['support_end']<=y['support_end']: i+=1
            else: j+=1
        out[side]={'common_seconds':seconds,'a_seconds':sum(w['support_end']-w['support_start'] for w in wa),'b_seconds':sum(w['support_end']-w['support_start'] for w in wb),'a_mean_common':sa/seconds if seconds else None,'b_mean_common':sb/seconds if seconds else None,'mean_difference_common':(sb-sa)/seconds if seconds else None}
    return out
