param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonExe = Join-Path $projectRoot '.venv\Scripts\python.exe'
$pidFile = Join-Path $projectRoot 'reports\server.pid'
$launcherId = [int](Get-Content -LiteralPath $pidFile)
$launcher = Get-CimInstance Win32_Process -Filter "ProcessId=$launcherId"
if (-not $launcher -or $launcher.ExecutablePath -ne $pythonExe -or
    $launcher.CommandLine -notlike '*-m uvicorn app.main:app*127.0.0.1*8008*') {
    throw 'Web launcher identity mismatch; no process was stopped.'
}
$listener = @(Get-NetTCPConnection -LocalPort 8008 -State Listen)
if ($listener.Count -ne 1 -or $listener[0].LocalAddress -ne '127.0.0.1') {
    throw 'Expected one loopback web listener; no process was stopped.'
}
$webId = [int]$listener[0].OwningProcess
$web = Get-CimInstance Win32_Process -Filter "ProcessId=$webId"
if (-not $web -or ($webId -ne $launcherId -and $web.ParentProcessId -ne $launcherId) -or
    $web.CommandLine -notlike '*-m uvicorn app.main:app*127.0.0.1*8008*') {
    throw 'Web process identity mismatch; no process was stopped.'
}
$computeJson = & $pythonExe (Join-Path $PSScriptRoot 'compute_cli.py') status
if ($LASTEXITCODE -ne 0) { throw 'Cannot verify compute state; no process was stopped.' }
$compute = $computeJson | ConvertFrom-Json
if ($compute.compute_locked -or $compute.inference) {
    throw 'A model request is active. Retry after the request finishes; no process was stopped.'
}
if ($CheckOnly) {
    [pscustomobject]@{ launcher_pid=$launcherId; web_pid=$webId; identity_verified=$true; model_request_active=$false }
    exit
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
foreach ($stream in 'stdout','stderr') {
    $log = Join-Path $projectRoot "reports\server.$stream.log"
    if (Test-Path -LiteralPath $log) { Copy-Item -LiteralPath $log -Destination (Join-Path $projectRoot "reports\web-before-$stamp.$stream.log") }
}
Stop-Process -Id $webId
Start-Sleep -Seconds 1
if (Get-NetTCPConnection -LocalPort 8008 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Port 8008 remains occupied. No replacement service was started.'
}
$env:PYTHONIOENCODING = 'utf-8'
$service = Start-Process -FilePath $pythonExe -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8008' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot 'reports\server.stdout.log') -RedirectStandardError (Join-Path $projectRoot 'reports\server.stderr.log') -PassThru
$service.Id | Set-Content -LiteralPath $pidFile
Start-Sleep -Seconds 2
$health = Invoke-RestMethod 'http://127.0.0.1:8008/api/health' -TimeoutSec 10
if ($health.school -ne '南京晓庄学院') { throw 'Unexpected service health response.' }
Write-Output 'Web service reloaded. Database, model, tunnel and collection services were reused.'
