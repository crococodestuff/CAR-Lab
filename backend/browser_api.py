"""Local browser transport/storage adapter; all scientific calculations use car_core."""
import asyncio
import base64
import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

from backend.car_core.analysis import analyze, fingerprint, explain_window, compare_runs
from backend.car_core.config import AnalysisConfig
from backend.car_core.ingest import decode_csv, normalize_track
from backend.car_core.synthetic import generate
from backend.car_core.quality import mark_quality
from backend.car_core.raw_summary import summarize_raw
from backend.car_core.signals import signal_payload
from backend.car_core.mapopt import analyze_mapopt, formula_example
from backend.car_core.export import export_zip

DATA = Path('/car-data')
BASE = 'https://api.vitaldb.net/'
SOURCE = 'https://vitaldb.net/dataset/?query=overview'
LICENSE = 'https://physionet.org/content/vitaldb/1.0.0/'
CHANNELS = {'map': ('Solar8000/ART_MBP', 'mmHg', 2), 'left': ('Invos/SCO2_L', '%', 5),
            'right': ('Invos/SCO2_R', '%', 5), 'etco2': ('Solar8000/ETCO2', 'mmHg', 2),
            'spo2': ('Solar8000/PLETH_SPO2', '%', 2), 'hr': ('Solar8000/HR', 'bpm', 2)}


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    tmp.replace(path)


def write(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)


async def fetch(resource):
    from pyodide.http import pyfetch
    if resource not in ('cases', 'trks') and not re.fullmatch('[a-fA-F0-9]{40,64}', resource):
        raise ValueError('非法上游资源')
    for attempt in range(3):
        try:
            response = await asyncio.wait_for(pyfetch(BASE + resource, credentials='omit', redirect='error'), 60)
            if not response.ok:
                raise ValueError(f'VitalDB 返回 HTTP {response.status}')
            raw = await asyncio.wait_for(response.bytes(), 60)
            if len(raw) > 100_000_000:
                raise ValueError('上游响应超出 100 MB 限制')
            return raw
        except Exception:
            if attempt == 2:
                raise ValueError('无法读取 VitalDB；请检查网络后重试，也可使用合成实验室') from None
            await asyncio.sleep(attempt + 1)


async def refresh_catalog():
    payloads = {name: await fetch(name) for name in ('cases', 'trks')}
    cases, trks = decode_csv(payloads['cases']), decode_csv(payloads['trks'])
    if not {'caseid', 'age', 'opname'} <= set(cases.columns) or not {'caseid', 'tname', 'tid'} <= set(trks.columns):
        raise ValueError('VitalDB 目录格式变化')
    snapshot = digest(payloads['cases'] + payloads['trks'])
    sets = {key: set(trks.loc[trks.tname == CHANNELS[key][0], 'caseid']) for key in ('map', 'left', 'right')}
    ids = sorted(sets['map'] & (sets['left'] | sets['right']))
    records = []
    for cid in ids:
        rows = cases.loc[cases.caseid == cid]
        meta = json.loads(rows.to_json(orient='records'))[0] if len(rows) else {'age': None, 'opname': None}
        tracks = {k: {'tid': str(t.iloc[0].tid), 'tname': name, 'unit': unit, 'nominal_interval': interval, 'nominal_source': SOURCE}
                  for k, (name, unit, interval) in CHANNELS.items()
                  if len(t := trks.loc[(trks.caseid == cid) & (trks.tname == name)])}
        records.append({**meta, 'caseid': int(cid), 'tracks': tracks, 'source': 'VitalDB',
                        'population': '成人公开手术数据', 'metadata_snapshot_id': snapshot})
    manifest = {'snapshot_id': snapshot, 'fetched_at': now(), 'cases_count': len(cases),
                'left_count': len(sets['left']), 'right_count': len(sets['right']), 'candidate_count': len(ids),
                'both_sides_with_map': len(sets['map'] & sets['left'] & sets['right']),
                'sources': {n: {'url': BASE+n, 'sha256': digest(raw)} for n, raw in payloads.items()}, 'cases': records}
    for name, raw in payloads.items():
        write(DATA/'catalog'/snapshot/(name+'.csv'), raw)
    save(DATA/'catalog'/'current.json', manifest)
    return {k: v for k, v in manifest.items() if k != 'cases'}


def list_cases():
    path = DATA/'catalog'/'current.json'
    rows = read(path)['cases'] if path.exists() else []
    for row in rows:
        folder = DATA/'cases'/str(row['caseid'])
        row['cached'] = (folder/'manifest.json').exists()
        row['quality'] = read(folder/'quality.json') if (folder/'quality.json').exists() else None
    return rows


def get_case(cid):
    row = next((r for r in list_cases() if r['caseid'] == cid), None)
    if row is None:
        raise ValueError('病例不在候选目录中，请先更新官方索引')
    return row


def load_tracks(manifest):
    if 'generator' in manifest:
        return generate(**manifest['generator'])
    tracks = {}
    for key, meta in manifest['tracks'].items():
        if not re.fullmatch('[a-fA-F0-9]{40,64}', meta['tid']):
            raise ValueError('缓存轨道 ID 无效')
        raw = (DATA/'tracks'/meta['tid']/'raw.csv').read_bytes()
        if digest(raw) != meta['sha256']:
            raise ValueError('原始缓存校验失败')
        tracks[key] = normalize_track(raw)[0]
    return tracks


async def download_case(cid, auxiliary):
    case = get_case(cid)
    target = DATA/'cases'/str(cid)/'manifest.json'
    needed = {k: v for k, v in case['tracks'].items() if auxiliary or k in ('map', 'left', 'right')}
    if target.exists():
        old = read(target)
        if all(k in old['tracks'] and old['tracks'][k]['tid'] == v['tid'] for k, v in needed.items()):
            load_tracks(old)
            return old
    tracks = {}
    for key, meta in needed.items():
        tid = meta['tid']
        if not re.fullmatch('[a-fA-F0-9]{40,64}', tid):
            raise ValueError('上游轨道 ID 无效')
        path = DATA/'tracks'/tid/'raw.csv'
        saved = path.parent/'manifest.json'
        if path.exists() and saved.exists():
            raw, info = path.read_bytes(), read(saved)
            if digest(raw) != info['sha256']:
                raise ValueError('原始缓存校验失败')
        else:
            raw = await fetch(tid)
            _, stats = normalize_track(raw)
            info = {**meta, **stats, 'sha256': digest(raw), 'url': BASE+tid,
                    'fetched_at': now(), 'license_source': LICENSE,
                    'normalization': 'same-time conflicts invalid; nonfinite invalid; stable time sort'}
            write(path, raw)
            save(saved, info)
        tracks[key] = info
    manifest = {'case': case, 'tracks': tracks, 'downloaded_at': now()}
    save(target, manifest)
    return manifest


def annotations(cid):
    p = DATA/'cases'/str(cid)/'annotations.json'
    return read(p) if p.exists() else {'version': 0, 'items': []}


def save_annotations(cid, body):
    get_case(cid)
    previous = annotations(cid)
    if body.get('version') != previous['version']:
        raise ValueError('标记版本已更新，请重新加载')
    items = body.get('items', [])
    if not isinstance(items, list) or len(items) > 200:
        raise ValueError('标记最多 200 条')
    clean = []
    for item in items:
        start, end = float(item['start']), float(item['end'])
        channel, reason = item.get('channel', 'all'), item['reason']
        if not 0 <= start < end <= 172800 or channel not in ('all', *CHANNELS) or not isinstance(reason, str) or not 1 <= len(reason) <= 300:
            raise ValueError('标记范围、通道或原因无效')
        clean.append({'id': str(item.get('id', uuid.uuid4().hex))[:80], 'start': start, 'end': end,
                      'channel': channel, 'reason': reason, 'operator': 'local_user', 'created_at': str(item.get('created_at', now()))[:80]})
    current = {'version': previous['version']+1, 'caseid': cid, 'updated_at': now(), 'items': clean}
    save(DATA/'cases'/str(cid)/'annotation_history'/f'{current["version"]}.json', current)
    save(DATA/'cases'/str(cid)/'annotations.json', current)
    return current


def run_analysis(body):
    config = AnalysisConfig(**body.get('config', {}))
    synthetic, cid = body.get('synthetic'), body.get('caseid')
    if synthetic is not None:
        tracks = generate(**synthetic)
        manifest = {'case': {'caseid': None, 'age': None, 'opname': '合成信号实验', 'population': '合成演示 · 不是真实病例', 'source': 'synthetic'},
                    'generator': synthetic, 'tracks': {k: {'sha256': digest(f.to_csv(index=False).encode()), 'unit': 'mmHg' if k == 'map' else '%', 'nominal_interval': 2 if k == 'map' else 5} for k, f in tracks.items()}}
        marks = []
    else:
        if type(cid) is not int or not 1 <= cid <= 100000:
            raise ValueError('需要有效病例或合成实验参数')
        manifest = read(DATA/'cases'/str(cid)/'manifest.json')
        tracks, marks = load_tracks(manifest), annotations(cid)['items']
    version = read(Path('/app/build.json'))['sha256']
    hashes = {'input_hash': fingerprint({k: v['sha256'] for k, v in manifest['tracks'].items()}),
              'annotation_hash': fingerprint(marks), 'config_hash': fingerprint(config.to_dict()),
              'code_version': version, 'metadata_hash': fingerprint(manifest['case'])}
    import sys, numpy, pandas
    runtime = {'python': sys.version.split()[0], 'numpy': numpy.__version__, 'pandas': pandas.__version__, 'engine': 'Pyodide'}
    run_id = fingerprint({**hashes, 'runtime': runtime})
    path = DATA/'runs'/run_id/'result.json'
    if path.exists():
        return read(path)
    result = analyze(tracks, config, marks)
    result.update(hashes)
    result.update(run_id=run_id, created_at=now(), status='complete', error=None, manifest=manifest,
                  annotations=marks, mode='synthetic' if synthetic is not None else 'real', runtime=runtime)
    quality, _ = mark_quality(tracks['map'], 'map', config, marks)
    quality = quality.loc[(quality.time >= result['range']['start']) & (quality.time <= result['range']['end']), ['time', 'MAP_raw', 'MAP_clean', 'quality_flag', 'valid']]
    payload = quality.to_csv(index=False, na_rep='NaN').encode('utf-8-sig')
    write(path.parent/'map_quality.csv', payload)
    result['map_quality'] = {'version': 1, 'rows': len(quality), 'sha256': digest(payload), 'invalid_points': int((~quality.valid).sum()), 'review_points': int((quality.valid & quality.quality_flag.str.contains('map_(?:zero|low|high)_review')).sum())}
    save(path, result)
    if synthetic is None and config == AnalysisConfig() and not marks:
        save(DATA/'cases'/str(cid)/'quality.json', {'run_id': run_id, 'summary': result['summary'], 'accepted': any(v['valid_outputs'] for v in result['summary'].values()), 'mode': 'strict_default'})
    return result


def get_run(run_id):
    if not re.fullmatch('[a-f0-9]{64}', run_id):
        raise ValueError('运行 ID 无效')
    return read(DATA/'runs'/run_id/'result.json')


def quality_csv(result):
    payload = (DATA/'runs'/result['run_id']/'map_quality.csv').read_bytes()
    if digest(payload) != result['map_quality']['sha256']:
        raise ValueError('MAP 质控快照校验失败')
    return payload


def attachment(raw, filename, mime):
    return {'base64': base64.b64encode(raw).decode(), 'filename': filename, 'mime': mime}


async def dispatch(request):
    url = urlsplit(request['path'])
    path, query, method = url.path, parse_qs(url.query), request.get('method', 'GET')
    body = request.get('body') or {}
    if path == '/health':
        return {'status': 'ok', 'mode': 'browser'}
    if path == '/catalog/refresh' and method == 'POST':
        return await refresh_catalog()
    if path == '/catalog':
        p = DATA/'catalog'/'current.json'
        return {k: v for k, v in read(p).items() if k != 'cases'} if p.exists() else None
    if path == '/cases':
        return list_cases()
    if match := re.fullmatch(r'/cases/(\d+)(?:/(download|signals|annotations))?', path):
        cid, action = int(match[1]), match[2]
        if action == 'download' and method == 'POST':
            return await download_case(cid, query.get('auxiliary') == ['true'])
        if action == 'annotations':
            return save_annotations(cid, body) if method == 'POST' else annotations(cid)
        if action == 'signals':
            manifest = read(DATA/'cases'/str(cid)/'manifest.json')
            return {'signals': signal_payload(load_tracks(manifest), 0, 172800, 3000, annotations=annotations(cid)['items']), 'manifest': manifest, 'display_only': True}
        return get_case(cid)
    if path == '/analyses' and method == 'POST':
        r = run_analysis(body)
        return {'run_id': r['run_id'], 'config_hash': r['config_hash']}
    if path == '/mapopt/example':
        return formula_example()
    if match := re.fullmatch(r'/analyses/([a-f0-9]{64})(?:/(signals|blocks|windows|compare|mapopt|map-quality|export)(?:/([^/]+))?)?', path):
        run_id, action, item = match.groups()
        r = get_run(run_id)
        if action is None:
            return r
        if action == 'windows':
            return explain_window(r, item)
        if action == 'compare':
            other = get_run(item)
            if r['input_hash'] != other['input_hash']:
                raise ValueError('仅比较同一份输入数据的运行')
            return compare_runs(r, other)
        if action == 'mapopt':
            fit_method, width, day = query.get('method', ['windows'])[0], int(query.get('width', ['5'])[0]), int(query.get('day', ['0'])[0])
            if fit_method not in ('windows', 'bins') or width not in (2, 5, 10) or not 0 <= day <= 100000:
                raise ValueError('MAPopt 参数无效')
            report_id = fingerprint({'run': run_id, 'method': fit_method, 'width': width, 'day': day, 'version': read(Path('/app/build.json'))['sha256']})
            p = DATA/'mapopt'/(report_id+'.json')
            if p.exists():
                return read(p)
            report = analyze_mapopt(r, fit_method, width, day)
            report.update(report_id=report_id, code_version=r['code_version'])
            save(p, report)
            return report
        if action == 'map-quality':
            return attachment(quality_csv(r), f'map-quality-{run_id[:12]}.csv', 'text/csv')
        if action == 'export':
            return attachment(export_zip(r, quality_csv(r), r['runtime']), f'car-lab-{run_id[:12]}.zip', 'application/zip')
        tracks = load_tracks(r['manifest'])
        config = AnalysisConfig.from_saved(r['config'])
        if action == 'blocks':
            index = int(item)
            if not 0 <= index < len(r['blocks']):
                raise ValueError('时间块不存在')
            block, raw = r['blocks'][index], {}
            for key, frame in tracks.items():
                f, _ = mark_quality(frame, key, config, r['annotations'])
                raw[key] = json.loads(f.loc[(f.time >= block['start']) & (f.time < block['end'])].to_json(orient='records'))
            return {'block': block, 'observations': raw}
        if action == 'signals':
            full = query.get('full') == ['true']
            start, end = r['range']['start'], r['range']['end']
            counts = {k: int(((f.time >= start) & (f.time <= end)).sum()) for k, f in tracks.items()}
            if full and sum(counts.values()) > 500000:
                raise ValueError('完整原始点超过50万，请缩短分析范围')
            output = signal_payload(tracks, start, end, None if full else 4000, config, r['annotations'])
            return {'signals': output, 'raw_summary': summarize_raw(tracks, start, end), 'display_only': True, 'full_resolution': full,
                    'sampling': {k: {'raw_points': counts[k], 'display_points': sum(p['flags'] != 'record_gap' for p in rows), 'nominal_interval': r['manifest']['tracks'][k].get('nominal_interval'), 'interval_seconds': r['manifest']['tracks'][k].get('interval_seconds')} for k, rows in output.items()}}
    raise ValueError('浏览器接口不存在')


async def dispatch_json(request_json):
    try:
        result = await dispatch(json.loads(request_json))
        return json.dumps(result, ensure_ascii=False, allow_nan=False)
    except FileNotFoundError:
        raise ValueError('当前浏览器没有此缓存，请重新下载或计算') from None
