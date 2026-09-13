"""Build a deterministic, source-only Python bundle for GitHub Pages."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FILES = ['backend/__init__.py', 'backend/browser_api.py'] + [p.relative_to(ROOT).as_posix() for p in sorted((ROOT/'backend/car_core').glob('*.py'))]


def build():
    target = ROOT/'frontend/public'
    target.mkdir(parents=True, exist_ok=True)
    sources = {name: (ROOT/name).read_bytes() for name in FILES}
    manifest = {'files': {name: hashlib.sha256(raw).hexdigest() for name, raw in sources.items()}}
    manifest['sha256'] = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()
    with zipfile.ZipFile(target/'python-core.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, raw in {**sources, 'build.json': json.dumps(manifest).encode()}.items():
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, raw)
    (target/'python-build.json').write_text(json.dumps({**manifest, 'archive_sha256': hashlib.sha256((target/'python-core.zip').read_bytes()).hexdigest()}, indent=2)+'\n', encoding='utf-8')
    print(f'Browser bundle: {len(sources)} Python source files; {manifest["sha256"][:12]}')


if __name__ == '__main__':
    build()
