param(
    [Parameter(Mandatory=$true)][string]$OutputPath,
    [ValidateRange(10,600)][int]$DurationSeconds=180,
    [ValidateRange(1,10)][int]$IntervalSeconds=2,
    [string]$Serial,
    [string]$SdkRoot
)
. (Join-Path $PSScriptRoot 'DeviceCommon.ps1')
$adbPath=Resolve-ProbeAdb $SdkRoot
$selected=Get-ProbeDevice $adbPath $Serial
$destination=[IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $destination) { throw 'Window evidence will not be overwritten.' }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
$watch=[Diagnostics.Stopwatch]::StartNew()
$samples=0
while ($watch.Elapsed.TotalSeconds -lt $DurationSeconds) {
    $started=[DateTime]::UtcNow.ToString('o')
    $windows=& $adbPath -s $selected shell dumpsys window
    if ($LASTEXITCODE -ne 0) { throw 'Window diagnostic failed; partial evidence preserved.' }
    $focusLine=$windows | Where-Object { $_ -match '^\s*mCurrentFocus=' } | Select-Object -First 1
    $package=$null
    $user=$null
    if ($focusLine -match '\bu(\d+)\s+([A-Za-z0-9_.]+)/') { $user=[int]$Matches[1]; $package=$Matches[2] }
    $class=if ($package -eq 'cn.xindong.g1probe') { 'PROBE' } elseif ($package -eq 'com.tencent.mm') { 'WECHAT' } elseif ($package) { 'OTHER' } else { 'UNKNOWN' }
    $row=[ordered]@{schema=1;host_started_at_utc=$started;host_finished_at_utc=[DateTime]::UtcNow.ToString('o');elapsed_ms=$watch.ElapsedMilliseconds;focused_package=$package;focused_user=$user;classification=$class;scope='sampled focus only; not proof of continuous state or message arrival'}
    [IO.File]::AppendAllText($destination,(($row | ConvertTo-Json -Compress)+[Environment]::NewLine),[Text.UTF8Encoding]::new($false))
    $samples++
    Start-Sleep -Seconds $IntervalSeconds
}
Write-Output "Focus samples written: $samples. Message acceptance NOT_EVALUATED."
