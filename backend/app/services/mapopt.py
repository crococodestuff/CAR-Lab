from backend.car_core.analysis import fingerprint
from backend.car_core.mapopt import analyze_mapopt, VERSION
from .runs import get_run
from .store import DATA, code_version, read_json, save_json


def get_mapopt(run_id, method='windows', width=5, day=0):
    result = get_run(run_id)
    version = code_version()
    report_id = fingerprint({'source_run_id': run_id, 'method': method, 'width': width,
                             'day': day, 'version': VERSION, 'code_version': version})
    path = DATA/'mapopt'/f'{report_id}.json'
    if path.exists():
        return read_json(path)
    report = analyze_mapopt(result, method, width, day)
    report.update(report_id=report_id, code_version=version)
    save_json(path, report)
    return report
