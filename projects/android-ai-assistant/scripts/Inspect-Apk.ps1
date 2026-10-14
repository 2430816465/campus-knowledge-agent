param([string]$JavaHome, [string]$SdkRoot)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
if (-not $SdkRoot) { $SdkRoot=Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not $JavaHome) {
    $knownJdk=Join-Path $env:LOCALAPPDATA 'CodexAndroidBuild\jdk17'
    $candidate=Get-ChildItem -LiteralPath $knownJdk -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\javac.exe') } | Select-Object -First 1
    if ($candidate) { $JavaHome=$candidate.FullName } else { $JavaHome=$env:JAVA_HOME }
}
if (-not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin\java.exe'))) { throw 'Pass -JavaHome with JDK17.' }
$env:JAVA_HOME=$JavaHome
$apkPath=Join-Path $projectRoot 'deliverables\xindong-g1-probe-debug.apk'
$toolRoot=Join-Path $SdkRoot 'build-tools\35.0.0'
$reportRoot=Join-Path $projectRoot 'reports\tests'
New-Item -ItemType Directory -Force -Path $reportRoot | Out-Null
Push-Location $projectRoot
try {
$signature=& (Join-Path $toolRoot 'apksigner.bat') verify --verbose --print-certs 'deliverables\xindong-g1-probe-debug.apk' 2>&1
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
$permissions=& (Join-Path $toolRoot 'aapt.exe') dump permissions 'deliverables\xindong-g1-probe-debug.apk'
if ($LASTEXITCODE -ne 0) { throw 'APK permission inspection failed' }
if ($permissions -match 'android.permission.INTERNET') { throw 'Unexpected network permission in offline probe' }
$metadata=& (Join-Path $toolRoot 'aapt.exe') dump badging 'deliverables\xindong-g1-probe-debug.apk'
if ($LASTEXITCODE -ne 0) { throw 'APK metadata inspection failed' }
} finally { Pop-Location }
$encoding=[Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllLines((Join-Path $reportRoot 'apk-signature.txt'),[string[]]$signature,$encoding)
[IO.File]::WriteAllLines((Join-Path $reportRoot 'apk-permissions.txt'),[string[]]$permissions,$encoding)
[IO.File]::WriteAllLines((Join-Path $reportRoot 'apk-metadata.txt'),[string[]]($metadata | Where-Object { $_ -match '^(package:|sdkVersion:|targetSdkVersion:|native-code:|application-label:)' }),$encoding)
[xml]$lintDoc=Get-Content -LiteralPath (Join-Path $reportRoot 'lint\lint-results-debug.xml')
$coreTotals=@{tests=0;failures=0;errors=0;skipped=0}
$coreFiles=@(Get-ChildItem -LiteralPath (Join-Path $reportRoot 'kotlin') -Filter 'TEST-*.xml')
if($coreFiles.Count -eq 0) { throw 'No Kotlin test results found' }
foreach($resultFile in $coreFiles) {
    [xml]$coreDoc=Get-Content -LiteralPath $resultFile.FullName
    foreach($field in @('tests','failures','errors','skipped')) { $coreTotals[$field]+=[int]$coreDoc.testsuite.GetAttribute($field) }
}
if($coreTotals.failures -ne 0 -or $coreTotals.errors -ne 0) { throw 'Kotlin tests failed' }
$errors=@($lintDoc.issues.issue | Where-Object severity -eq 'Error').Count
if ($errors -ne 0) { throw 'Android lint errors present' }
$summary=[ordered]@{
    checked_at=[DateTimeOffset]::Now.ToString('o')
    artifact='deliverables/xindong-g1-probe-debug.apk'
    bytes=(Get-Item -LiteralPath $apkPath).Length
    sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $apkPath).Hash.ToLowerInvariant()
    signature='apksigner verify succeeded; Android Debug; v2'
    internet_permission=$false
    lint_errors=$errors
    lint_warnings=@($lintDoc.issues.issue | Where-Object severity -eq 'Warning').Count
    kotlin_rules=$coreTotals
    app_unit_tests='NO-SOURCE'
    emulator='NOT_TESTED'
    real_device='NOT_ASSESSED_BY_APK_INSPECTION; see docs/G1_REAL_DEVICE_REPORT.md'
    real_wechat='NOT_ASSESSED_BY_APK_INSPECTION; see docs/G1_REAL_DEVICE_REPORT.md'
    p0_gate='NOT_PASSED_UNPROVEN'
    ai_quality='NOT_STARTED'
}
[IO.File]::WriteAllText((Join-Path $reportRoot 'artifact-verification.json'),($summary | ConvertTo-Json -Depth 6),$encoding)
$summary | ConvertTo-Json -Depth 6
