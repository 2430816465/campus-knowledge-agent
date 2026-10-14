param([string]$JavaHome, [string]$SdkRoot)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
if (-not $JavaHome) { $JavaHome=Join-Path $env:LOCALAPPDATA 'CodexAndroidBuild\jdk17\jdk-17.0.20.1+1' }
if (-not $SdkRoot) { $SdkRoot=Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$env:JAVA_HOME=$JavaHome
$environmentReport=[ordered]@{
    captured_at=[DateTimeOffset]::Now.ToString('o')
    os=[Environment]::OSVersion.VersionString
    shell=$PSVersionTable.PSVersion.ToString()
    architecture=$env:PROCESSOR_ARCHITECTURE
    java_home=$JavaHome
    sdk_root=$SdkRoot
    disk_free_gb=[Math]::Round((Get-PSDrive C).Free/1GB,1)
    proxy_configured=[bool]($env:HTTPS_PROXY -or $env:HTTP_PROXY)
    java_version=@(& (Join-Path $JavaHome 'bin\java.exe') -version 2>&1 | ForEach-Object { "$_" })
    adb_version=@(& (Join-Path $SdkRoot 'platform-tools\adb.exe') version)
    devices=@(& (Join-Path $SdkRoot 'platform-tools\adb.exe') devices -l)
    git_version=(& git --version)
    python_version=(& python --version)
    installed_sdk=@(& (Join-Path $SdkRoot 'cmdline-tools\latest\bin\sdkmanager.bat') --list_installed 2>&1 | ForEach-Object { "$_" })
}
$target=Join-Path $projectRoot 'reports\environment\host-environment.json'
[IO.File]::WriteAllText($target,($environmentReport | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
Write-Output $target
