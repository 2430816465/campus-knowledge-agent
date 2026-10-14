param([Parameter(Mandatory=$true)][string]$DevicePath, [Parameter(Mandatory=$true)][string]$RunId, [string]$Serial, [string]$SdkRoot)
. (Join-Path $PSScriptRoot 'DeviceCommon.ps1')
if ($RunId -notmatch '^[A-Za-z0-9_-]{1,80}$') { throw 'RunId must contain only letters, digits, underscore, hyphen.' }
if ($DevicePath -notmatch '^/sdcard/Download/g1-[A-Za-z0-9_-]+\.jsonl$') { throw 'Select an explicitly exported g1-*.jsonl ASCII filename in Download; rename duplicate exports in the system picker.' }
$adbPath=Resolve-ProbeAdb $SdkRoot
$selected=Get-ProbeDevice $adbPath $Serial
$destination=Join-Path (Split-Path -Parent $PSScriptRoot) "evidence\runs\$RunId"
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$filePath=Join-Path $destination 'events.jsonl'
if (Test-Path -LiteralPath $filePath) { throw 'Existing evidence will not be overwritten; use a new RunId.' }
function Get-RemoteEvidenceHash {
    $hashLine = & $adbPath -s $selected shell sha256sum $DevicePath
    if ($LASTEXITCODE -ne 0 -or "$hashLine" -notmatch '^([0-9a-fA-F]{64})\s') { throw 'Cannot read remote export SHA-256.' }
    return $Matches[1].ToLowerInvariant()
}
$beforeHash=Get-RemoteEvidenceHash
Push-Location $destination
try { Invoke-ProbeAdb $adbPath $selected @('pull',$DevicePath,'events.jsonl') }
finally { Pop-Location }
$localHash=(Get-FileHash -Algorithm SHA256 -LiteralPath $filePath).Hash.ToLowerInvariant()
$afterHash=Get-RemoteEvidenceHash
if ($beforeHash -ne $localHash -or $afterHash -ne $localHash) { throw 'Export changed while pulling. Partial file preserved; wait for export completion and use a new RunId.' }
& python (Join-Path $PSScriptRoot 'compare_evidence.py') --events $filePath --verify-only
if ($LASTEXITCODE -ne 0) { throw 'Export is incomplete or failed integrity checks. File preserved; do not use for acceptance.' }
$receipt=[ordered]@{schema=1;verified_at_utc=[DateTime]::UtcNow.ToString('o');serial=$selected;device_path=$DevicePath;bytes=(Get-Item -LiteralPath $filePath).Length;sha256=$localHash;remote_before_sha256=$beforeHash;remote_after_sha256=$afterHash;export_status='COMPLETE_HASH_CHAIN_VERIFIED';wechat_acceptance='NOT_EVALUATED'}
[IO.File]::WriteAllText((Join-Path $destination 'pull-receipt.json'),($receipt | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
Get-FileHash -Algorithm SHA256 -LiteralPath $filePath
