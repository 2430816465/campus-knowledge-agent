param([string]$Serial, [string]$SdkRoot, [string]$OutputDirectory)
. (Join-Path $PSScriptRoot 'DeviceCommon.ps1')
if (-not $OutputDirectory) { $OutputDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'evidence\runs\device-baseline' }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$adbPath = Resolve-ProbeAdb $SdkRoot
$listing = & $adbPath devices -l
[IO.File]::WriteAllLines((Join-Path $OutputDirectory 'adb-devices.txt'),[string[]]$listing,[Text.UTF8Encoding]::new($false))
$baseline = [ordered]@{ state='WAITING_FOR_DEVICE'; collected_at=[DateTimeOffset]::Now.ToString('o'); properties=@{}; wechat_version=$null }
try {
    $selected = Get-ProbeDevice $adbPath $Serial
    $baseline.state = 'CONNECTED_NOT_YET_TESTED'
    $propNames = @('ro.product.manufacturer','ro.product.brand','ro.product.model','ro.product.device','ro.build.version.release','ro.build.version.sdk','ro.build.version.security_patch','ro.build.display.id','ro.build.version.incremental','ro.mi.os.version.name','ro.miui.ui.version.name')
    foreach ($propName in $propNames) {
        $baseline.properties[$propName] = ((Invoke-ProbeAdb $adbPath $selected @('shell','getprop',$propName)) -join "`n").Trim()
    }
    $packageData = Invoke-ProbeAdb $adbPath $selected @('shell','dumpsys','package','com.tencent.mm')
    $baseline.wechat_version = @($packageData | Where-Object { $_ -match '^\s*version(Name|Code)=' } | ForEach-Object { $_.Trim() })
    $baseline.enabled_accessibility_services = ((Invoke-ProbeAdb $adbPath $selected @('shell','settings','get','secure','enabled_accessibility_services')) -join "`n").Trim()
    $baseline.enabled_notification_listeners = ((Invoke-ProbeAdb $adbPath $selected @('shell','settings','get','secure','enabled_notification_listeners')) -join "`n").Trim()
    $baseline.manual_checks_pending = @('Exact retail model from Settings','HyperOS version from Settings','WeChat notifications and mute setting','Dedicated test account consent','Independent sending endpoint and clock alignment')
} catch {
    $baseline.reason = $_.Exception.Message
    if ($baseline.state -ne 'WAITING_FOR_DEVICE') { $baseline.state = 'INCOMPLETE_DEVICE_BASELINE' }
} finally {
    [IO.File]::WriteAllText((Join-Path $OutputDirectory 'device-baseline.json'),($baseline | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
}
Write-Output "Device baseline state: $($baseline.state)"
if ($baseline.state -eq 'WAITING_FOR_DEVICE') { Write-Output $baseline.reason; exit 2 }
if ($baseline.state -eq 'INCOMPLETE_DEVICE_BASELINE') { Write-Output $baseline.reason; exit 3 }
