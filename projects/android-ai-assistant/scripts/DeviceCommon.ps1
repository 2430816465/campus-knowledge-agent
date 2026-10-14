$ErrorActionPreference = 'Stop'
function Resolve-ProbeAdb([string]$SdkRoot) {
    if (-not $SdkRoot) { $SdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
    $adbPath = Join-Path $SdkRoot 'platform-tools\adb.exe'
    if (-not (Test-Path -LiteralPath $adbPath)) { throw "ADB missing: $adbPath" }
    return $adbPath
}
function Get-ProbeDevice([string]$AdbPath, [string]$Serial) {
    $listing = & $AdbPath devices -l
    if ($LASTEXITCODE -ne 0) { throw 'adb devices failed' }
    $available = @($listing | Where-Object { $_ -match '^\S+\s+device\b' } | ForEach-Object { ($_ -split '\s+')[0] })
    if ($Serial) {
        if ($available -notcontains $Serial) { throw 'Selected device unavailable or unauthorized. Unlock phone and authorize USB debugging.' }
    } elseif ($available.Count -eq 1) { $Serial = $available[0] }
    elseif ($available.Count -eq 0) { throw 'No authorized device. Connect/unlock the Redmi phone and accept USB debugging; no real-device test was performed.' }
    else { throw 'Multiple devices: specify -Serial explicitly.' }
    if ($Serial.StartsWith('emulator-')) { throw 'Emulator cannot satisfy the designated Redmi acceptance requirement.' }
    return $Serial
}
function Invoke-ProbeAdb([string]$AdbPath, [string]$Serial, [string[]]$Arguments) {
    $result = & $AdbPath -s $Serial @Arguments
    if ($LASTEXITCODE -ne 0) { throw "ADB command failed: $($Arguments[0])" }
    return $result
}
