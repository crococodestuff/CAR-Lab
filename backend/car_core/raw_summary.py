"""Descriptive statistics of full normalized observations, before analysis QC."""
import numpy as np
import pandas as pd
from collections import Counter
from .quality import mark_quality


def summarize_raw(tracks, start, end):
    summary = {}
    for channel in ('map', 'left', 'right'):
        frame = tracks.get(channel)
        values = (pd.to_numeric(frame.loc[(frame.time >= start) & (frame.time <= end), 'value'], errors='coerce').to_numpy(dtype=float)
                  if frame is not None else np.array([], dtype=float))
        finite = values[np.isfinite(values)]
        n, total = len(finite), len(values)
        def number(value):
            return float(value) if np.isfinite(value) else None
        summary[channel] = {
            'observations': total, 'finite_observations': n,
            'nonfinite_observations': total-n,
            'nonfinite_fraction': (total-n)/total if total else None,
            'minimum': number(np.min(finite)) if n else None,
            'maximum': number(np.max(finite)) if n else None,
            'mean': number(np.mean(finite)) if n else None,
            'sample_sd': number(np.std(finite, ddof=1)) if n > 1 else None,
        }
    return summary


def summarize_quality(tracks, start, end, config, annotations=()):
    """Compare identical full observation ranges, before QC vs retained point values.

    Point availability is separate from block coverage and COx computability.
    Flags may overlap, but each excluded observation is counted only once.
    """
    before = summarize_raw(tracks, start, end)
    retained, counts, reasons, flagged = {}, {}, {}, {}
    for channel in ('map', 'left', 'right'):
        frame = tracks.get(channel)
        if frame is None:
            counts[channel], reasons[channel], flagged[channel] = 0, {}, 0
            continue
        marked, _ = mark_quality(frame, channel, config, annotations)
        scoped = marked.loc[(marked.time >= start) & (marked.time <= end)]
        counts[channel] = int((~scoped.valid).sum())
        flagged[channel] = int(((scoped['flags'] != '') | ~scoped.valid).sum())
        reasons[channel] = dict(Counter(flag for flags in scoped.loc[~scoped.valid, 'flags'] for flag in flags.split('|') if flag))
        retained[channel] = scoped.loc[scoped.valid, ['time', 'clean_value']].rename(columns={'clean_value': 'value'})
    after = summarize_raw(retained, start, end)
    return {channel: {'before': before[channel], 'after': after[channel],
                      'excluded_points': counts[channel],
                      'flagged_points': flagged[channel], 'review_only_points': flagged[channel]-counts[channel],
                      'excluded_fraction': counts[channel]/before[channel]['observations'] if before[channel]['observations'] else None,
                      'excluded_flags': reasons[channel]}
            for channel in ('map', 'left', 'right')}
