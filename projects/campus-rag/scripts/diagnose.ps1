$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$system = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors,VirtualizationFirmwareEnabled,SecondLevelAddressTranslationExtensions
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object DeviceID,Size,FreeSpace
$gpu = & nvidia-smi --query-gpu=name,memory.total,memory.used,driver_version --format=csv,noheader
$commandPaths = @{}
foreach ($toolName in @('wsl','docker','ollama','python','node','git')) {
    $command = Get-Command $toolName -ErrorAction SilentlyContinue
    $commandPaths[$toolName] = if ($command) { $command.Path } else { $null }
}
$ports = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(8008,11434,8080,8443,5432,5433) } | Select-Object LocalAddress,LocalPort,OwningProcess)
$models = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 5
$health = Invoke-RestMethod 'http://127.0.0.1:8008/api/health' -TimeoutSec 5
$report = [ordered]@{
    checked_at = (Get-Date).ToString('o'); actual_project_exists = (Test-Path -LiteralPath $projectRoot)
    os = $system.Caption; os_version = $system.Version; total_ram_bytes = $system.TotalVisibleMemorySize * 1024
    available_ram_bytes = $system.FreePhysicalMemory * 1024; cpu = $cpu; gpu_sample = $gpu
    disk = $disk; commands = $commandPaths; listeners = $ports; models = $models.models
    app_health = $health; docker_desktop_installed = ((Test-Path -LiteralPath 'C:\Program Files\Docker\Docker\Docker Desktop.exe') -or (Test-Path -LiteralPath "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe"))
    wsl_status_note = '初次检查：wsl.exe存在，但WSL组件未安装，无Linux发行版；重启后需重新核验'
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "$projectRoot\reports\environment.json" -Encoding utf8
Write-Output "环境报告已保存：reports\environment.json；未输出代理、账号或密钥。"
