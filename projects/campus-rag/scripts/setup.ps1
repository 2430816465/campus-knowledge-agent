$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimePython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (-not (Test-Path -LiteralPath "$projectRoot\.venv\Scripts\python.exe")) {
    if (Test-Path -LiteralPath $runtimePython) { & $runtimePython -m venv "$projectRoot\.venv" } else { py -3.12 -m venv "$projectRoot\.venv" }
}
& "$projectRoot\.venv\Scripts\python.exe" -m pip install -r "$projectRoot\requirements.lock.txt"
if ($LASTEXITCODE -ne 0) { throw '依赖安装失败' }
