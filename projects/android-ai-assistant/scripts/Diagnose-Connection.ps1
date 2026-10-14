param([string]$SdkRoot, [string]$OutputDirectory)
. (Join-Path $PSScriptRoot 'DeviceCommon.ps1')

# Read the actual host state. Never install a driver, grant phone permissions,
# change USB modes, or treat a visible device as a successful WeChat test.
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $projectRoot ('evidence\runs\connection-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$adbPath = Resolve-ProbeAdb $SdkRoot
$adbListing = @(& $adbPath devices -l 2>&1 | ForEach-Object { $_.ToString() })
if ($LASTEXITCODE -ne 0) { throw 'ADB device enumeration failed.' }
$adbVersion = @(& $adbPath version 2>&1 | ForEach-Object { $_.ToString() })
if ($LASTEXITCODE -ne 0) { throw 'ADB version check failed.' }
$states = @($adbListing | Where-Object { $_ -match '^\S+\s+(device|unauthorized|offline|recovery|sideload)\b' } | ForEach-Object { ($_ -split '\s+')[1] })
$authorized = @($states | Where-Object { $_ -eq 'device' }).Count
$unauthorized = @($states | Where-Object { $_ -eq 'unauthorized' }).Count
$offline = @($states | Where-Object { $_ -eq 'offline' }).Count
$state = if ($authorized -gt 0) { 'AUTHORIZED_DEVICE_VISIBLE' }
    elseif ($unauthorized -gt 0) { 'WAITING_FOR_PHONE_RSA_AUTHORIZATION' }
    elseif ($offline -gt 0) { 'ADB_DEVICE_OFFLINE' }
    elseif ($states.Count -gt 0) { 'DEVICE_NOT_IN_NORMAL_ANDROID_MODE' }
    else { 'NO_ADB_DEVICE_VISIBLE' }

$pnpError = $null
$usb = @()
$pnpProblems = @()
try {
    $present = @(Get-PnpDevice -PresentOnly -ErrorAction Stop)
    $usb = @($present | Where-Object { $_.InstanceId -like 'USB\*' -or $_.Class -eq 'WPD' } | ForEach-Object {
        # Keep the VID/PID/interface only. Omit each physical device's unique ID.
        $idParts = $_.InstanceId -split '\\'
        [ordered]@{
            status = [string]$_.Status
            class = [string]$_.Class
            name = [string]$_.FriendlyName
            hardware_family = ($idParts | Select-Object -First 2) -join '\'
            problem = [int]$_.Problem
        }
    })
    $pnpProblems = @($present | Where-Object { $_.Status -ne 'OK' } | ForEach-Object {
        [ordered]@{ status=[string]$_.Status; class=[string]$_.Class; name=[string]$_.FriendlyName; problem=[int]$_.Problem }
    })
} catch { $pnpError = $_.Exception.GetType().Name }

$serverListeners = @()
$serverCheckError = $null
try {
    $serverListeners = @(Get-NetTCPConnection -LocalPort 5037 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        [ordered]@{ address=[string]$_.LocalAddress; port=$_.LocalPort; process_id=$_.OwningProcess }
    })
} catch { $serverCheckError = $_.Exception.GetType().Name }

$report = [ordered]@{
    collected_at = [DateTimeOffset]::Now.ToString('o')
    state = $state
    adb_version = $adbVersion
    adb_counts = [ordered]@{ authorized=$authorized; unauthorized=$unauthorized; offline=$offline; total=$states.Count }
    default_adb_server_listeners = $serverListeners
    server_check_error = $serverCheckError
    present_usb_devices_without_unique_ids = $usb
    present_pnp_problems_without_unique_ids = $pnpProblems
    pnp_check_error = $pnpError
    scope = 'Host connection diagnostic only; no APK installation, permission changes, or WeChat interaction.'
    interpretation = 'An empty ADB list does not establish whether a cable is physically plugged in or which component caused the missing data connection.'
    g1_acceptance = 'NOT_ASSESSED_BY_CONNECTION_DIAGNOSTIC'
}
$utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllLines((Join-Path $OutputDirectory 'adb-devices.txt'), [string[]]$adbListing, $utf8)
[IO.File]::WriteAllText((Join-Path $OutputDirectory 'connection-check.json'), ($report | ConvertTo-Json -Depth 8), $utf8)
Write-Output "Connection state: $state"
Write-Output "Authorized: $authorized; unauthorized: $unauthorized; offline: $offline"
Write-Output "Evidence directory: $OutputDirectory"
if ($authorized -eq 0) { exit 2 }
