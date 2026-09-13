"""Descriptive statistics of full normalized observations, before analysis QC."""
import numpy as np
import pandas as pd


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
