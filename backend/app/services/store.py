from pathlib import Path
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
import uuid

ROOT=Path(__file__).resolve().parents[3]
DATA=Path(os.environ.get('CAR_DATA_DIR',ROOT/'data')).resolve()

def now(): return datetime.now(timezone.utc).isoformat()

def atomic_bytes(path, payload):
    path=Path(path); path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp')
    try:
        temp.write_bytes(payload); os.replace(temp,path)
    finally:
        temp.unlink(missing_ok=True)

def save_json(path,value): atomic_bytes(path,json.dumps(value,ensure_ascii=False,allow_nan=False,indent=2).encode())
def read_json(path): return json.loads(Path(path).read_text(encoding='utf-8'))
def digest(payload): return sha256(payload).hexdigest()

def code_version():
    files=sorted((ROOT/'backend').rglob('*.py'))
    return digest(b''.join(p.relative_to(ROOT).as_posix().encode()+p.read_bytes() for p in files))
