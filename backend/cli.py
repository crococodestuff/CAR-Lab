import argparse
import json
from pathlib import Path
from scipy.stats import pearsonr
from backend.car_core.config import AnalysisConfig
from backend.car_core.analysis import explain_window
from backend.app.services import vitaldb,runs
from backend.app.services.export import export_zip
from backend.app.services.store import DATA,save_json,atomic_bytes,now

def main():
    parser=argparse.ArgumentParser(description='CAR Lab 真实病例分析 / 离线重算')
    parser.add_argument('--case',type=int); parser.add_argument('--screen',type=int,default=1)
    parser.add_argument('--refresh',action='store_true'); parser.add_argument('--offline',action='store_true')
    parser.add_argument('--window',type=int,default=300); parser.add_argument('--output',default='data/demo')
    parser.add_argument('--sensitivity',action='store_true',help='显式开启探索模式，不替代严格验收')
    parser.add_argument('--pair-ratio',type=float,default=.8)
    args=parser.parse_args()
    if args.refresh and args.offline: parser.error('offline 与 refresh 不可同时使用')
    if args.refresh or not vitaldb.list_cases():
        if args.offline: parser.error('尚无目录缓存，不能离线发现病例')
        print(json.dumps(vitaldb.refresh_catalog(),ensure_ascii=False))
    ids=[args.case] if args.case else [c['caseid'] for c in vitaldb.list_cases()]
    checked=[]; selected=None
    for cid in ids:
        if not args.offline: vitaldb.download_case(cid)
        r=runs.run_analysis(cid,AnalysisConfig(window_seconds=args.window,sensitivity=args.sensitivity,min_pair_ratio=args.pair_ratio))
        errors=[]
        for w in r['windows']:
            if w['cox'] is None: continue
            rows=[p for p in explain_window(r,w['window_id'])['pairs'] if p['valid']]
            reference=float(pearsonr([p['map'] for p in rows],[p['rso2'] for p in rows]).statistic)
            errors.append(abs(reference-w['cox']))
        accepted=bool(errors)
        checked.append({'caseid':cid,'age':r['manifest']['case'].get('age'),'sensitivity':args.sensitivity,'accepted':accepted,'reason':('存在探索窗口' if args.sensitivity else '存在严格合格窗口') if accepted else '无有效窗口；保持所选质量标准','summary':r['summary'],'independent_scipy_max_error':max(errors,default=None),'run_id':r['run_id']})
        print(json.dumps(checked[-1],ensure_ascii=False),flush=True)
        if accepted and selected is None: selected=r
        if len(checked)>=args.screen and selected is not None: break
    out=Path(args.output); out.mkdir(parents=True,exist_ok=True)
    save_json(out/'screening.json',{'checked_at':now(),'cases':checked})
    if not selected and checked:
        atomic_bytes(out/'no-valid-window-report.zip',export_zip(r))
    if selected:
        atomic_bytes(out/'example-report.zip',export_zip(selected))
        save_json(out/'example-run.json',{'run_id':selected['run_id'],'caseid':selected['manifest']['case']['caseid'],'summary':selected['summary']})
        print(f'完成：{out.resolve()}')
    else: raise SystemExit('所检查病例无有效窗口，详见 screening.json')

if __name__=='__main__': main()
