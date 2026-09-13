import numpy as np
from .quality import mark_quality
from .config import AnalysisConfig

def signal_payload(tracks,start,end,max_points,config=None,annotations=()):
    output={}
    for key,frame in tracks.items():
        f,_=mark_quality(frame,key,config or AnalysisConfig(),annotations)
        f=f.loc[(f.time>=start)&(f.time<=end)]
        nominal=2 if key not in ('left','right') else 5
        times=f.time.to_numpy()
        gaps=[{'time':float(times[i]+nominal),'value':None,'valid':False,'flags':'record_gap'} for i in np.flatnonzero(np.diff(times)>nominal*3)]
        # Segment envelope retains extrema and explicit gaps; only display data are reduced.
        if max_points is not None and len(f)>max_points:
            indices=set(np.linspace(0,len(f)-1,max_points//3,dtype=int).tolist())
            for group in np.array_split(np.arange(len(f)),max(1,max_points//3)):
                vals=f.value.iloc[group].to_numpy()
                if np.isfinite(vals).any():
                    indices.update((int(group[np.nanargmin(vals)]),int(group[np.nanargmax(vals)])))
            indices.update(np.flatnonzero(~f.valid.to_numpy())[::max(1,len(f)//max_points)].tolist())
            f=f.iloc[sorted(indices)]
        records=[]
        for row in f.itertuples():
            records.append({'time':float(row.time),'value':float(row.value) if np.isfinite(row.value) else None,'valid':bool(row.valid),'flags':row.flags, **({'MAP_raw':float(row.MAP_raw) if np.isfinite(row.MAP_raw) else None,'MAP_clean':float(row.MAP_clean) if np.isfinite(row.MAP_clean) else None,'quality_flag':row.quality_flag} if key=='map' else {})})
        output[key]=sorted(records+gaps,key=lambda r:r['time'])
    return output
