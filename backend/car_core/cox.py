import numpy as np


def rolling_cox(blocks, config):
    windows=[]
    N=config.window_seconds//config.block_seconds
    for idx,b in enumerate(blocks):
        if b['end'] % config.step_seconds: continue
        for side in config.sides:
            subset=blocks[max(0,idx-N+1):idx+1]
            pairs=[x for x in subset if x['map']['valid'] and x[side]['valid']]
            x=np.array([p['map']['mean'] for p in pairs]); y=np.array([p[side]['mean'] for p in pairs])
            reason=[]; hints=[]; r=None
            if len(subset)<N or b['end']-config.window_seconds<config.start: reason.append('warmup')
            if len(pairs)<config.required_pairs: reason.append('insufficient_pairs')
            mx=float(np.mean(x)) if len(x) else None; my=float(np.mean(y)) if len(y) else None
            sx=float(np.std(x,ddof=1)) if len(x)>1 else None; sy=float(np.std(y,ddof=1)) if len(y)>1 else None
            if sx is not None and sy is not None:
                if sx<=config.numerical_sd_tolerance or sy<=config.numerical_sd_tolerance: reason.append('zero_variance')
                elif not reason:
                    r=float(np.dot(x-mx,y-my)/np.sqrt(np.dot(x-mx,x-mx)*np.dot(y-my,y-my)))
                    if abs(r)>1+1e-12: raise ArithmeticError('Pearson 超出浮点容差')
                    r=float(np.clip(r,-1,1))
                if sx<config.low_sd_map or sy<config.low_sd_rso2: hints.append('low_variation')
            if len(pairs)<N: hints.append('window_has_gaps')
            windows.append({'window_id':f'{idx}-{side}','start':b['end']-config.window_seconds,'end':b['end'],'side':side,'cox':r,'valid_pairs':len(pairs),'expected_pairs':N,'required_pairs':config.required_pairs,'sd_map':sx,'sd_rso2':sy,'mean_map':mx,'mean_rso2':my,'reasons':reason,'hints':hints,'support_start':max(config.start,b['end']-config.step_seconds),'support_end':b['end']})
    return windows
