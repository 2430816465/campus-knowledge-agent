$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonExe = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonExe)) { throw '缺少项目虚拟环境，请先运行 scripts\setup.ps1' }
$env:OLLAMA_NO_CLOUD = '1'
$env:OLLAMA_HOST = '127.0.0.1:11434'
$env:OLLAMA_NUM_PARALLEL = '1'
$env:OLLAMA_CONTEXT_LENGTH = '4096'
$env:OLLAMA_MAX_LOADED_MODELS = '1'
$env:PYTHONIOENCODING = 'utf-8'
$runtimeFile = Join-Path $projectRoot '.secrets\runtime.json'
if (Test-Path -LiteralPath $runtimeFile) {
    $runtimeConfig = Get-Content -LiteralPath $runtimeFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($runtimeConfig.DATABASE_URL -like 'postgresql*') {
        $dockerExe = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
        if (-not (Test-Path -LiteralPath $dockerExe)) { throw '找不到 Docker Desktop CLI，请核对已有安装' }
        $env:PATH = (Split-Path -Parent $dockerExe) + ';' + $env:PATH
        & $dockerExe info --format '{{.ServerVersion}}' 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Docker 引擎尚未运行；请打开已有 Docker Desktop，等待 Engine running 后重试。无需重新安装。' }
        & $dockerExe compose --project-name campus-business --env-file (Join-Path $projectRoot '.secrets\business-postgres.env') -f (Join-Path $projectRoot 'deploy\business-postgres.yml') up -d --wait
        if ($LASTEXITCODE -ne 0) { throw '业务 PostgreSQL 未通过健康检查；保留原数据，请查看 Docker 日志' }
    }
}
$ollamaExe = Join-Path $env:USERPROFILE '.local\share\ollama\ollama.exe'
if (-not (Test-Path -LiteralPath $ollamaExe)) {
    $ollamaExe = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
}
try { $null = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3 } catch {
    if (-not (Test-Path -LiteralPath $ollamaExe)) { throw '找不到已有Ollama，请核对安装位置' }
    $modelProcess = Start-Process -FilePath $ollamaExe -ArgumentList 'serve' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput "$projectRoot\reports\ollama.stdout.log" -RedirectStandardError "$projectRoot\reports\ollama.stderr.log" -PassThru
    $modelProcess.Id | Set-Content "$projectRoot\reports\ollama.pid"
    Start-Sleep -Seconds 3
}
try { $health = Invoke-RestMethod 'http://127.0.0.1:8008/api/health' -TimeoutSec 3 } catch { $health = $null }
if ($health -and $health.school -eq '南京晓庄学院') { Write-Output '项目已经运行：http://127.0.0.1:8008'; exit }
if (Get-NetTCPConnection -LocalPort 8008 -State Listen -ErrorAction SilentlyContinue) { throw '8008端口被其他程序占用，不自动停止其他程序' }
$service = Start-Process -FilePath $pythonExe -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8008' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput "$projectRoot\reports\server.stdout.log" -RedirectStandardError "$projectRoot\reports\server.stderr.log" -PassThru
$service.Id | Set-Content "$projectRoot\reports\server.pid"
Start-Sleep -Seconds 2
$health = Invoke-RestMethod 'http://127.0.0.1:8008/api/health' -TimeoutSec 5
Write-Output ('启动成功：http://127.0.0.1:8008；数据库：' + $health.database)
Write-Output '管理员：http://127.0.0.1:8008/admin；密码在 .secrets/admin-password.txt，勿发送到聊天。'
