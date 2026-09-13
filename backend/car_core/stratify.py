import math
import numpy as np


def stratify(windows, width):
    groups={}
    for w in windows:
        if w['cox'] is not None:
            key=(w['side'],math.floor(w['mean_map']/width)*width)
            groups.setdefault(key,[]).append(w)
    return [{'side':side,'map_low':low,'map_high':low+width,'mean_cox':float(np.mean([w['cox'] for w in ws])),'median_cox':float(np.median([w['cox'] for w in ws])),'outputs':len(ws),'support_seconds':sum(w['support_end']-w['support_start'] for w in ws),'observed_map_min':min(w['mean_map'] for w in ws),'observed_map_max':max(w['mean_map'] for w in ws),'low_coverage':sum(w['support_end']-w['support_start'] for w in ws)<300} for (side,low),ws in sorted(groups.items())]
