import math
import numpy as np
from .quality import mark_quality


def subtract_intervals(start, end, exclusions):
    spans = [(start,end)] if end > start else []
    for a,b in exclusions:
        next_spans = []
        for x,y in spans:
            if b <= x or a >= y: next_spans.append((x,y))
            else:
                if x < a: next_spans.append((x,a))
                if b < y: next_spans.append((b,y))
        spans = next_spans
    return spans


def aggregate_track(frame, channel, nominal, config, annotations, end):
    f, exclusions = mark_quality(frame, channel, config, annotations)
    B = config.block_seconds
    first, last = math.floor(config.start/B), math.ceil(end/B)
    if last-first > 20000: raise ValueError('最多分析 20000 个时间块，请缩短范围或增加块长')
    times, values, valid = f.time.to_numpy(), f.clean_value.to_numpy(), f.valid.to_numpy()
    # Do not extend beyond the last observed timestamp or borrow pre-range observations.
    next_times = np.r_[times[1:], times[-1]]
    supports = np.minimum(next_times, times+nominal)
    coverage = np.zeros(last-first)
    support_segments = [[] for _ in range(last-first)]
    for i in np.flatnonzero(valid & (times >= config.start) & (times < end)):
        for a,b in subtract_intervals(times[i], min(supports[i],end), exclusions):
            for k in range(max(first,math.floor(a/B)), min(last,math.ceil(b/B))):
                x,y = max(a,k*B), min(b,(k+1)*B)
                if y>x:
                    coverage[k-first] += y-x
                    support_segments[k-first].append((x,y))
    rows = []
    for k in range(first,last):
        a,b = k*B,(k+1)*B
        lo,hi = np.searchsorted(times,[max(a,config.start),min(b,end)])
        mask = valid[lo:hi]
        vt, vv = times[lo:hi][mask], values[lo:hi][mask]
        flags = set('|'.join(f['flags'].iloc[lo:hi]).split('|'))-{''}
        if any(x<b and y>a for x,y in exclusions): flags.add('manual_exclusion')
        cov = min(1., coverage[k-first]/B)
        if not len(vv): flags.add('no_observations')
        if cov+1e-12 < config.min_block_coverage: flags.add('coverage_insufficient')
        if a < config.start or b > end: flags.add('range_boundary')
        if len(vv)>1 and np.ptp(vv)<=config.numerical_sd_tolerance: flags.add('flat_suspect')
        spans = support_segments[k-first]
        cursor, max_uncovered = a,0.
        for x,y in spans:
            max_uncovered = max(max_uncovered,x-cursor)
            cursor=max(cursor,y)
        max_uncovered=max(max_uncovered,b-cursor)
        if max_uncovered > nominal+1e-9: flags.add('long_gap')
        # Coverage alone must not hide a contiguous hole longer than one nominal interval.
        ok = bool(len(vv) and cov+1e-12 >= config.min_block_coverage and a>=config.start and b<=end and max_uncovered<=nominal+1e-9)
        rows.append({'start':a,'end':b,'mean':float(np.mean(vv)) if len(vv) else None,'count':len(vv),'span_seconds':float(vt[-1]-vt[0]) if len(vt) else 0,'coverage':cov,'max_uncovered_seconds':max_uncovered,'valid':ok,'flags':sorted(flags),'source':channel})
    return rows
