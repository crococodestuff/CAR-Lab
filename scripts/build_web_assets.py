"""Publish only allowlisted public catalog fields and pinned Python runtime assets.

No local case data, annotations or analysis results are read by this builder.
"""
from pathlib import Path
import csv
import gzip
import hashlib
import io
import json
import math
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'frontend/public'
RUNTIME = 'https://cdn.jsdelivr.net/pyodide/v314.0.6/full/'
CHANNELS = {'map': ('Solar8000/ART_MBP', 'mmHg', 2), 'left': ('Invos/SCO2_L', '%', 5),
            'right': ('Invos/SCO2_R', '%', 5), 'etco2': ('Solar8000/ETCO2', 'mmHg', 2),
            'spo2': ('Solar8000/PLETH_SPO2', '%', 2), 'hr': ('Solar8000/HR', 'bpm', 2)}


def fetch(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=90) as response:
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def rows(raw):
    if raw[:2] == b'\x1f\x8b':
        raw = gzip.decompress(raw)
    return csv.DictReader(io.StringIO(raw.decode('utf-8-sig')))


def number(value):
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (ValueError, TypeError):
        return None


def validate_numeric_track(raw, channel):
    reader = csv.reader(io.StringIO(raw.decode('utf-8-sig')))
    if next(reader, None) != ['Time', channel]:
        raise ValueError('Public track schema changed')
    for row in reader:
        if len(row) != 2:
            raise ValueError('Unexpected public track columns')
        for cell in row:
            if cell.strip():
                float(cell)  # Includes NaN/Inf; validate text only, do not clean or rewrite.


def catalog():
    payloads = {name: fetch('https://api.vitaldb.net/' + name) for name in ('cases', 'trks')}
    selected = {}
    by_name = {v[0]: (key, v) for key, v in CHANNELS.items()}
    for row in rows(payloads['trks']):
        if row['tname'] in by_name:
            key, (name, unit, interval) = by_name[row['tname']]
            selected.setdefault(int(row['caseid']), {})[key] = {
                'tid': row['tid'], 'tname': name, 'unit': unit, 'nominal_interval': interval,
                'nominal_source': 'https://vitaldb.net/dataset/?query=overview'}
    cases = []
    total = 0
    for row in rows(payloads['cases']):
        total += 1
        cid = int(row['caseid'])
        tracks = selected.get(cid, {})
        if 'map' not in tracks or not {'left', 'right'} & tracks.keys():
            continue
        cases.append({'caseid': cid, 'opname': row.get('opname') or None,
                      **{key: number(row.get(key)) for key in ('age', 'caseend', 'opstart', 'opend', 'anestart', 'aneend')},
                      'tracks': tracks, 'source': 'VitalDB', 'population': '成人公开手术数据'})
    snapshot = hashlib.sha256(payloads['cases'] + payloads['trks']).hexdigest()
    for case in cases:
        case['metadata_snapshot_id'] = snapshot
    manifest = {'snapshot_id': snapshot, 'fetched_at': datetime.now(timezone.utc).isoformat(),
                'cases_count': total, 'candidate_count': len(cases),
                'left_count': sum('left' in v for v in selected.values()),
                'right_count': sum('right' in v for v in selected.values()),
                'both_sides_with_map': sum({'map', 'left', 'right'} <= v.keys() for v in selected.values()),
                'sources': {name: {'url': 'https://api.vitaldb.net/' + name, 'sha256': hashlib.sha256(raw).hexdigest()} for name, raw in payloads.items()},
                'license_source': 'https://physionet.org/content/vitaldb/1.0.0/', 'cases': sorted(cases, key=lambda v: v['caseid'])}
    # Only the numeric tracks of the public candidate cases; never read local case files.
    # Serve plain CSV from Pages to avoid upstream gzip/CORS failures in WebKit.
    track_dir = TARGET / 'public-tracks'
    track_dir.mkdir(parents=True, exist_ok=True)
    names = {track['tid']: track['tname'] for case in cases for track in case['tracks'].values()}
    tids = sorted(names)
    def copy_track(tid):
        if len(tid) not in (40, 64) or any(c not in '0123456789abcdefABCDEF' for c in tid):
            raise ValueError('Unsafe public track ID')
        raw = fetch('https://api.vitaldb.net/' + tid)
        if raw[:2] == b'\x1f\x8b':
            raw = gzip.decompress(raw)
        # Preserve all source CSV values/timestamps, including gaps and invalid values.
        validate_numeric_track(raw, names[tid])
        (track_dir / (tid + '.csv')).write_bytes(raw)
        return tid, {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw),
                     'source_url': 'https://api.vitaldb.net/' + tid}
    with ThreadPoolExecutor(max_workers=4) as pool:
        manifest['public_track_files'] = dict(pool.map(copy_track, tids))
    print(f'Public numeric tracks: {len(tids)} files; {sum(v["bytes"] for v in manifest["public_track_files"].values())} bytes')
    data = json.dumps(manifest, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode()
    (TARGET / 'catalog.json').write_bytes(data)
    print(f'Public catalog: {len(cases)} candidates; {len(data)} bytes; no observations in catalog')


def runtime():
    folder = TARGET / 'pyodide'
    folder.mkdir(parents=True, exist_ok=True)
    lock = fetch(RUNTIME + 'pyodide-lock.json')
    packages = json.loads(lock)['packages']
    assets = {name: None for name in ('pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip')}
    pending, seen = ['numpy', 'pandas'], set()
    while pending:
        name = pending.pop()
        if name in seen:
            continue
        seen.add(name)
        package = packages[name]
        assets[package['file_name']] = package['sha256']
        pending.extend(package['depends'])
    (folder / 'pyodide-lock.json').write_bytes(lock)
    for name, sha in assets.items():
        if Path(name).name != name:
            raise ValueError('Unsafe runtime filename')
        path = folder / name
        raw = path.read_bytes() if path.exists() else fetch(RUNTIME + name)
        if sha and hashlib.sha256(raw).hexdigest() != sha:
            raise ValueError('Runtime package hash mismatch: ' + name)
        path.write_bytes(raw)
    print(f'Runtime: {len(assets) + 1} pinned assets; {sum(p.stat().st_size for p in folder.iterdir())} bytes')


if __name__ == '__main__':
    TARGET.mkdir(parents=True, exist_ok=True)
    catalog()
    runtime()
