param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
& $Python -m venv .venv
if ($LASTEXITCODE -ne 0) { throw 'Python environment creation failed' }
& .\.venv\Scripts\python.exe -m pip install -r requirements.lock
if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed' }
& .\.venv\Scripts\python.exe -m pip install -e . --no-deps
if ($LASTEXITCODE -ne 0) { throw 'Package installation failed' }
& npm.cmd ci --prefix frontend
if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed' }
& node frontend/scripts/copy-monaco.mjs
if ($LASTEXITCODE -ne 0) { throw 'Local Monaco installation failed' }
Write-Host 'Ready. Run: .\.venv\Scripts\python.exe scripts/run.py'
