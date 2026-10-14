$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot 'reports\server.pid'
if (Test-Path -LiteralPath $pidFile) {
    $serviceId = [int](Get-Content -LiteralPath $pidFile)
    $serviceInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$serviceId" -ErrorAction SilentlyContinue
    if ($serviceInfo -and $serviceInfo.CommandLine -like '*uvicorn*app.main:app*8008*' -and $serviceInfo.ExecutablePath -like "$projectRoot*") { Stop-Process -Id $serviceId; Write-Output '项目服务已停止，数据库和资料保留。' }
}
# Ollama 可被其他项目复用，不自动结束模型服务。
