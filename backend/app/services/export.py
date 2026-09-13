import importlib.metadata
from backend.car_core.export import svg_chart, LIMITS, export_zip as core_export_zip
from .runs import map_quality_csv

def export_zip(result):
    versions={p:importlib.metadata.version(p) for p in ("numpy","pandas","scipy","fastapi","pydantic","pyarrow")}
    return core_export_zip(result,map_quality_csv(result),versions)
