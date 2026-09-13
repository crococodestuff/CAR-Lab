import numpy as np
import pandas as pd


def mark_quality(frame, channel, config, annotations):
    f = frame.copy()
    f['value'] = pd.to_numeric(f['value'], errors='coerce')
    flags = [set() for _ in range(len(f))]
    for i, row in enumerate(f.itertuples()):
        if not np.isfinite(row.value): flags[i].add('nonfinite')
        if row.conflict: flags[i].add('timestamp_conflict')
        if not row.valid and np.isfinite(row.value) and not row.conflict:
            flags[i].add('source_invalid')
    f.loc[~np.isfinite(f.value) | f.conflict, 'valid'] = False
    if channel == 'map' and config.map_quality_enabled:
        rules = [
            ('map_negative', f.value < 0, True),
            ('map_zero_review', f.value == 0, False),
            ('map_low_review', (f.value > 0) & (f.value < config.map_review_low), False),
            ('map_high_review', f.value > config.map_review_high, False),
            ('device_error_code', f.value.isin(config.map_error_codes), True),
        ]
        for name, mask, invalid in rules:
            for i in np.flatnonzero(mask): flags[i].add(name)
            if invalid: f.loc[mask, 'valid'] = False
    if channel in ('left', 'right') and config.nirs_quality_enabled:
        for name, mask in [('nirs_below_range', np.isfinite(f.value) & (f.value < config.nirs_range_low)),
                           ('nirs_above_range', np.isfinite(f.value) & (f.value > config.nirs_range_high))]:
            for i in np.flatnonzero(mask): flags[i].add(name)
            if config.nirs_range_action == 'exclude': f.loc[mask, 'valid'] = False
    threshold = config.jump_map if channel == 'map' else config.jump_rso2
    values = f.value.to_numpy()
    jumps = np.r_[False, np.abs(np.diff(values)) > threshold] if len(values) else np.array([], dtype=bool)
    for i in np.flatnonzero(jumps): flags[i].add('jump_suspect')
    if channel in ('left','right') and config.ceiling_hint:
        for i in np.flatnonzero(values >= config.ceiling_value): flags[i].add('ceiling_candidate')
    # Impossible percentage values are hints, not a broad physiological exclusion.
    if channel in ('left','right','spo2'):
        for i in np.flatnonzero((values < 0) | (values > 100)): flags[i].add('extreme_suspect')
    exclusions = []
    if config.use_annotations:
        for a in annotations:
            if a['channel'] in ('all', channel):
                exclusions.append((a['start'], a['end']))
                mask = (f.time >= a['start']) & (f.time < a['end'])
                f.loc[mask,'valid'] = False
                for i in np.flatnonzero(mask): flags[i].add('manual_exclusion')
    if config.exclude_suspect:
        f.loc[[bool(x & {'jump_suspect','ceiling_candidate','extreme_suspect'}) for x in flags], 'valid'] = False
    f['flags'] = ['|'.join(sorted(x)) for x in flags]
    f['clean_value'] = f.value.where(f.valid, np.nan)
    if channel == 'map':
        f['MAP_raw'] = f.value
        f['MAP_clean'] = f.clean_value
        f['quality_flag'] = f['flags'].replace('', 'range_ok' if config.map_quality_enabled else 'legacy_available')
    elif channel in ('left', 'right'):
        f['NIRS_raw'] = f.value
        f['NIRS_clean'] = f.clean_value
        f['quality_flag'] = f['flags'].replace('', 'range_ok' if config.nirs_quality_enabled else 'legacy_available')
    return f, exclusions
