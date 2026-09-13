import numpy as np
import pandas as pd

SCENARIOS = ('independent','coupled','delay','gaps_spikes','constant')

def generate(scenario='coupled', seed=42, coupling=.8, noise=1., delay=30):
    if scenario not in SCENARIOS or not 0<=coupling<=1 or not 0<=noise<=10 or not 0<=delay<=300:
        raise ValueError('合成参数无效')
    rng=np.random.default_rng(seed); t=np.arange(0,1801,1.)
    slow=np.convolve(rng.normal(size=len(t)+60),np.ones(61)/61,'valid')*35
    other=np.convolve(rng.normal(size=len(t)+60),np.ones(61)/61,'valid')*35
    m=75+slow
    c=0 if scenario=='independent' else coupling
    shifted=np.interp(t-delay,t,slow) if scenario=='delay' else slow
    l=65+c*shifted+(1-c)*other+noise*rng.normal(size=len(t))
    r=68+c*shifted+(1-c)*other+noise*rng.normal(size=len(t))
    if scenario=='constant': l[:]=95; r[:]=70
    tracks={}
    for key,vals,interval in [('map',m,2),('left',l,5),('right',r,5)]:
        tt=t[::interval]; vv=vals[::interval].copy()
        if scenario=='gaps_spikes':
            vv[(tt>=600)&(tt<760)]=np.nan; vv[(tt>=1000)&(tt<1010)]+=70
        tracks[key]=pd.DataFrame({'time':tt,'value':vv,'valid':np.isfinite(vv),'conflict':False})
    return tracks
