import gzip
from io import BytesIO
import numpy as np
import pandas as pd


def decode_csv(payload: bytes) -> pd.DataFrame:
    if payload[:2] == b'\x1f\x8b':
        payload = gzip.decompress(payload)
    try:
        frame = pd.read_csv(BytesIO(payload))
    except Exception as exc:
        raise ValueError('无法解析上游 CSV') from exc
    if frame.empty or len(frame.columns) < 2:
        raise ValueError('上游 CSV 为空或缺少字段')
    return frame


def normalize_track(payload: bytes):
    frame = decode_csv(payload)
    if len(frame.columns) != 2 or str(frame.columns[0]).lower() != 'time':
        raise ValueError('数值通道必须包含 Time 与一个数值列')
    frame.columns = ['time', 'value']
    frame = frame.apply(pd.to_numeric, errors='coerce')
    invalid_time = ~np.isfinite(frame.time)
    stats = {'invalid_time': int(invalid_time.sum()), 'nonmonotonic': int((frame.time.diff() < 0).sum())}
    frame = frame.loc[~invalid_time].sort_values('time', kind='stable')
    groups = frame.groupby('time').value
    conflict_times = groups.nunique(dropna=False).loc[lambda s: s > 1].index
    stats['duplicate_rows'] = int(frame.time.duplicated().sum())
    stats['conflict_timestamps'] = len(conflict_times)
    frame = frame.drop_duplicates('time').reset_index(drop=True)
    frame['conflict'] = frame.time.isin(conflict_times)
    frame['valid'] = np.isfinite(frame.value) & ~frame.conflict
    stats['nonfinite_values'] = int((~np.isfinite(frame.value)).sum())
    if frame.empty:
        raise ValueError('通道没有有效时间戳')
    intervals = np.diff(frame.time)
    stats['interval_seconds'] = {k: float(np.quantile(intervals, q)) if len(intervals) else None for k,q in [('p05',.05),('median',.5),('p95',.95),('max',1)]}
    stats['time_start'], stats['time_end'] = float(frame.time.min()), float(frame.time.max())
    return frame, stats
