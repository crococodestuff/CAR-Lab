"""Descriptive MAPopt estimation from frozen, quality-checked COx windows."""
from dataclasses import replace
import math
import numpy as np
from .config import AnalysisConfig
from .cox import rolling_cox

VERSION = 'mapopt-1.1'
WINDOW_SECONDS = (180, 300, 600, 1200, 1800, 3600, 5400, 7200)
POLICY = {'min_fit_points': 5, 'min_unique_map': 5, 'min_r_squared': .2,
          'curvature_tolerance': 1e-10, 'bin_low_support_seconds': 300, 'positive_map_required': True}


def quadratic_fit(x, y):
    x, y = np.asarray(x, dtype=float), np.asarray(y, dtype=float)
    fit = {'coefficients': None, 'r_squared': None, 'rmse': None, 'vertex': None,
           'minimum_cox': None, 'mapopt': None, 'curve': [], 'reasons': []}
    if len(x) < POLICY['min_fit_points'] or len(np.unique(x)) < POLICY['min_unique_map']:
        fit['reasons'].append('insufficient_fit_points')
        return fit
    if not np.isfinite(x).all() or not np.isfinite(y).all():
        fit['reasons'].append('nonfinite_fit_input')
        return fit
    # Center and scale MAP before fitting; avoid ill-conditioned raw squared pressures.
    center, scale = float(np.mean(x)), float(np.ptp(x))
    if scale <= 1e-10:
        fit['reasons'].append('insufficient_map_variation')
        return fit
    z = (x-center)/scale
    matrix = np.column_stack((z*z, z, np.ones(len(z))))
    coeff, _, rank, _ = np.linalg.lstsq(matrix, y, rcond=None)
    if rank != 3 or not np.isfinite(coeff).all():
        fit['reasons'].append('singular_fit')
        return fit
    A, B, C = (float(v) for v in coeff)
    a, b = A/scale**2, B/scale-2*A*center/scale**2
    c = C-B*center/scale+A*center**2/scale**2
    predicted = matrix @ coeff
    sse, sst = float(np.sum((y-predicted)**2)), float(np.sum((y-np.mean(y))**2))
    r2 = None if sst <= 1e-12 else 1-sse/sst
    fit.update(coefficients={'a': a, 'b': b, 'c': c}, r_squared=r2,
               rmse=float(np.sqrt(sse/len(x))))
    if np.min(x) <= 0:
        fit['reasons'].append('nonpositive_map')
    grid = np.linspace(float(np.min(x)), float(np.max(x)), 201)
    fit['curve'] = [[float(v), float(A*((v-center)/scale)**2+B*((v-center)/scale)+C)] for v in grid]
    if A <= POLICY['curvature_tolerance']:
        fit['reasons'].append('not_upward')
    else:
        vertex = center-scale*B/(2*A)
        minimum = C-B*B/(4*A)
        fit.update(vertex=vertex, minimum_cox=minimum)
        if not float(np.min(x)) < vertex < float(np.max(x)):
            fit['reasons'].append('vertex_outside_range')
        if not -1 <= minimum <= 1:
            fit['reasons'].append('minimum_outside_cox')
    if r2 is None or r2 < POLICY['min_r_squared']:
        fit['reasons'].append('weak_fit')
    if not fit['reasons']:
        fit['mapopt'] = fit['vertex']
    return fit


def summarize(windows, side, window_seconds, period, method, width):
    candidates = [w for w in windows if w['side'] == side and
                  w['start'] >= period['start'] and w['end'] <= period['end']]
    good = [w for w in candidates if w['cox'] is not None and w['mean_map'] is not None
            and math.isfinite(w['cox']) and math.isfinite(w['mean_map'])]
    points = [{'map': w['mean_map'], 'cox': w['cox'], 'start': w['start'], 'end': w['end'],
               'window_id': w['window_id'], 'support_seconds': w['support_end']-w['support_start']}
              for w in good]
    groups = {}
    for p in points:
        groups.setdefault(math.floor(p['map']/width)*width, []).append(p)
    bins = []
    for low, items in sorted(groups.items()):
        ys = [p['cox'] for p in items]
        support = sum(p['support_seconds'] for p in items)
        bins.append({'map_low': low, 'map_high': low+width,
                     'mean_map': float(np.mean([p['map'] for p in items])),
                     'mean_cox': float(np.mean(ys)), 'sd_cox': float(np.std(ys, ddof=1)) if len(ys)>1 else None,
                     'outputs': len(items), 'support_seconds': support,
                     'low_support': support < POLICY['bin_low_support_seconds']})
    fit = quadratic_fit([p['map'] for p in points], [p['cox'] for p in points]) if method == 'windows' else quadratic_fit(
        [b['mean_map'] for b in bins], [b['mean_cox'] for b in bins])
    # Binning must not hide zero/nonpositive source MAP behind a positive bin average.
    if any(p['map'] <= 0 for p in points):
        if 'nonpositive_map' not in fit['reasons']:
            fit['reasons'].append('nonpositive_map')
        fit['mapopt'] = None
    return {'side': side, 'window_seconds': window_seconds, 'points': points, 'bins': bins,
            'valid_outputs': len(points), 'excluded_outputs': len(candidates)-len(points),
            'cross_boundary_outputs': sum(w['side']==side and period['start'] < w['end'] <= period['end']
                                          and w['start'] < period['start'] for w in windows),
            'support_seconds': sum(p['support_seconds'] for p in points),
            'map_range': [min(p['map'] for p in points), max(p['map'] for p in points)] if points else None,
            'fit_points': len(points) if method == 'windows' else len(bins), 'fit': fit}


def analyze_mapopt(result, method='windows', width=5, day=0):
    if method not in ('windows', 'bins') or width not in (2, 5, 10) or type(day) is not int or not 0 <= day <= 100000:
        raise ValueError('MAPopt拟合方式、分箱宽度或记录日无效')
    period = {'day': day, 'start': max(result['range']['start'], day*86400),
              'end': min(result['range']['end'], (day+1)*86400)}
    if period['end'] <= period['start']:
        raise ValueError('所选记录日与当前分析范围没有重叠')
    config = AnalysisConfig.from_saved(result['config'])
    lengths = sorted(set((*WINDOW_SECONDS, config.window_seconds)))
    results, skipped = [], []
    for length in lengths:
        try:
            variant = replace(config, window_seconds=length)
        except ValueError:
            skipped.append(length)
            continue
        # Reuse frozen block quality and the formal COx implementation, never current mutable annotations.
        windows = result['windows'] if length == config.window_seconds else rolling_cox(result['blocks'], variant)
        windows = [w for w in windows if w['end'] <= result['range']['end']]
        for side in config.sides:
            results.append(summarize(windows, side, length, period, method, width))
    return {'version': VERSION, 'mode': result['mode'], 'source_run_id': result['run_id'],
            'source_config': result['config'], 'period': period, 'method': method, 'bin_width': width,
            'policy': POLICY, 'results': results, 'skipped_window_seconds': skipped}


def formula_example():
    windows = [{'side': 'left', 'window_id': f'formula-{i}', 'start': i*10, 'end': i*10+300,
                'support_start': i*10+290, 'support_end': i*10+300,
                'mean_map': float(x), 'cox': float(.004*(x-50)**2+.10)}
               for i, x in enumerate(np.linspace(40, 60, 41))]
    period = {'day': 0, 'start': 0, 'end': 700}
    return {'version': VERSION, 'mode': 'formula_demo', 'source_run_id': None,
            'source_config': None, 'period': period, 'method': 'windows', 'bin_width': 5,
            'policy': POLICY, 'results': [summarize(windows, 'left', 300, period, 'windows', 5)],
            'skipped_window_seconds': []}
