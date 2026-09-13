param([int]$Port = 8765)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$carPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $carPython)) { throw '请先按 README 安装 Python 依赖。' }
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'frontend\dist\index.html'))) { throw '请先运行前端构建：cd frontend; pnpm build' }
Write-Host "CAR Lab: http://127.0.0.1:$Port"
& $carPython -m uvicorn backend.app.main:app --host 127.0.0.1 --port $Port
