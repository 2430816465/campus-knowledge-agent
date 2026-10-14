param([string]$Serial, [string]$SdkRoot)
. (Join-Path $PSScriptRoot 'DeviceCommon.ps1')
$adbPath = Resolve-ProbeAdb $SdkRoot
$selected = Get-ProbeDevice $adbPath $Serial
$projectRoot = Split-Path -Parent $PSScriptRoot
$apkPath = Join-Path $projectRoot 'deliverables\xindong-g1-probe-debug.apk'
if (-not (Test-Path -LiteralPath $apkPath)) { throw 'Build the APK first using scripts/Build.ps1.' }
$deviceModel = ((Invoke-ProbeAdb $adbPath $selected @('shell','getprop','ro.product.model')) -join '').Trim()
if ($deviceModel -match 'sdk_gphone|sdk_phone|Emulator') { throw 'Emulator model rejected for Redmi verification.' }
Push-Location $projectRoot
try { Invoke-ProbeAdb $adbPath $selected @('install','-r','deliverables\xindong-g1-probe-debug.apk') }
finally { Pop-Location }
Invoke-ProbeAdb $adbPath $selected @('shell','am','start','-n','cn.xindong.g1probe/.MainActivity')
Write-Output 'APK installed and opened. Grant permissions manually on the phone; installation is not G1 acceptance.'
