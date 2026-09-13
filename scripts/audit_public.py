"""Inspect the exact Git index without printing potentially sensitive matches."""
import json
import re
import subprocess
import sys
from pathlib import PurePosixPath

FORBIDDEN = {'data', 'artifacts', '.venv', 'node_modules', '__pycache__', '.pytest_cache',
             'test-results', 'playwright-report', '.codex', '.agents', '.vscode', '.idea', 'dist', 'dist-pages'}
INTERNAL = {'CAR_Lab_Codex_Handoff.md', 'docs/status.md', 'docs/decisions.md', 'docs/plan.md'}
PATTERNS = {
    'private user directory': re.compile(r'(?i)(?:[a-z]:[\\/]+Users[\\/]+[^\\/\s]+|/Users/[\w.-]+|/home/[\w.-]+)'),
    'private absolute workspace': re.compile(r'(?i)(?<![\w/])[a-z]:[\\/]+(?:Work|Documents|Desktop|Downloads)[\\/]'),
    'private key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
    'access token': re.compile(r'(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{25,}|sk-[A-Za-z0-9_-]{25,}|AKIA[A-Z0-9]{16})'),
    'credential URL': re.compile(r'https?://[^\s/:@]+:[^\s/@]+@'),
    'personal email': re.compile(r'\b[\w.+-]+@(?:gmail|outlook|hotmail|qq|163|126|icloud)\.com\b', re.I),
    'assigned credential': re.compile(r'''(?i)(?:api[_-]?key|secret|password|access[_-]?token)\s*[:=]\s*["'][^"'\s]{8,}["']'''),
}


def audit():
    names = subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')
    failures = []
    count = 0
    for name in filter(None, names):
        count += 1
        path = PurePosixPath(name)
        if FORBIDDEN.intersection(path.parts) or name in INTERNAL or (path.name.startswith('.env') and path.name != '.env.example') or path.suffix.lower() in {'.pem', '.key', '.p12', '.pfx', '.sqlite', '.db', '.log', '.zip', '.parquet'}:
            failures.append((name, 'excluded local file'))
        raw = subprocess.check_output(['git', 'show', ':'+name])
        if len(raw) > 2_000_000:
            failures.append((name, 'unexpected large file'))
        try:
            text = raw.decode('utf-8-sig')
        except UnicodeDecodeError:
            failures.append((name, 'binary file requires explicit review'))
            continue
        for reason, pattern in PATTERNS.items():
            for match in pattern.finditer(text):
                failures.append((f'{name}:{text.count(chr(10), 0, match.start())+1}', reason))
        if path.suffix == '.ipynb':
            notebook = json.loads(text)
            if any(c.get('outputs') or c.get('execution_count') is not None for c in notebook['cells']):
                failures.append((name, 'executed notebook output'))
    for name, reason in failures:
        print(f'FAIL {name}: {reason}')
    print(f'Audited {count} indexed files; {len(failures)} findings. Matching content was not printed.')
    return bool(failures) or count == 0


if __name__ == '__main__':
    sys.exit(audit())
