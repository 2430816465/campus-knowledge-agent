param([string]$JavaHome,[string]$SdkRoot)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
if (-not $JavaHome) { $JavaHome=(Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'CodexAndroidBuild\jdk17') -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\javac.exe') } | Select-Object -First 1).FullName }
if (-not $JavaHome) { $JavaHome=$env:JAVA_HOME }
if (-not $JavaHome -or -not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin\javac.exe'))) { throw 'Pass JDK17 with -JavaHome.' }
if (-not $SdkRoot) { $SdkRoot=Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$env:JAVA_HOME=$JavaHome
$report=Join-Path $projectRoot 'reports\product'; $apk=Join-Path $projectRoot 'deliverables\xindong-junshi-debug.apk'
$tool=Join-Path $SdkRoot 'build-tools\35.0.0'
Push-Location $projectRoot
try {
    $signature=& (Join-Path $tool 'apksigner.bat') verify --verbose --print-certs 'deliverables\xindong-junshi-debug.apk' 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Product APK signature failed.' }
    $permissions=& (Join-Path $tool 'aapt.exe') dump permissions 'deliverables\xindong-junshi-debug.apk'
    if ($LASTEXITCODE -ne 0) { throw 'Product APK permissions failed.' }
    if (($permissions | Out-String) -notmatch 'android.permission.INTERNET') { throw 'Product AI requires network permission.' }
    if ($permissions -match 'READ_CONTACTS|RECORD_AUDIO|MANAGE_EXTERNAL_STORAGE|SYSTEM_ALERT_WINDOW|SEND_SMS') { throw 'Unexpected product permission.' }
    $metadata=& (Join-Path $tool 'aapt.exe') dump badging 'deliverables\xindong-junshi-debug.apk'
    if ($LASTEXITCODE -ne 0) { throw 'Product APK metadata failed.' }
} finally { Pop-Location }
$enc=[Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllLines((Join-Path $report 'apk-signature.txt'),[string[]]$signature,$enc)
[IO.File]::WriteAllLines((Join-Path $report 'apk-permissions.txt'),[string[]]$permissions,$enc)
[IO.File]::WriteAllLines((Join-Path $report 'apk-metadata.txt'),[string[]]($metadata | Where-Object { $_ -match '^(package:|sdkVersion:|targetSdkVersion:|native-code:|application-label:)' }),$enc)
$totals=@{tests=0;failures=0;errors=0;skipped=0}
$files=@(Get-ChildItem -LiteralPath (Join-Path $report 'kotlin') -Filter 'TEST-*.xml')
if ($files.Count -eq 0) { throw 'Product Kotlin test results missing.' }
foreach($file in $files) { [xml]$x=Get-Content -LiteralPath $file.FullName; foreach($field in @('tests','failures','errors','skipped')) { $totals[$field]+=[int]$x.testsuite.GetAttribute($field) } }
if ($totals.failures -ne 0 -or $totals.errors -ne 0 -or $totals.skipped -ne 0) { throw 'Product core tests did not all pass.' }
$androidTotals=@{tests=0;failures=0;errors=0;skipped=0}
$androidFiles=@(Get-ChildItem -LiteralPath (Join-Path $report 'android-unit') -Filter 'TEST-*.xml')
if ($androidFiles.Count -eq 0) { throw 'Android unit test results missing.' }
foreach($file in $androidFiles) { [xml]$x=Get-Content -LiteralPath $file.FullName; foreach($field in @('tests','failures','errors','skipped')) { $androidTotals[$field]+=[int]$x.testsuite.GetAttribute($field) } }
if ($androidTotals.failures -ne 0 -or $androidTotals.errors -ne 0 -or $androidTotals.skipped -ne 0) { throw 'Android unit tests did not all pass.' }
$packageLine=($metadata | Where-Object { $_ -match '^package:' } | Select-Object -First 1)
if ($packageLine -notmatch "^package: name='cn.xindong.junshi' versionCode='([0-9]+)' versionName='([^']+)'") { throw 'Unexpected product package metadata.' }
$versionCode=[int]$Matches[1]; $versionName=$Matches[2]
[xml]$lint=Get-Content -LiteralPath (Join-Path $report 'lint\lint-results-debug.xml')
$errors=@($lint.issues.issue | Where-Object severity -eq 'Error').Count
if ($errors -gt 0) { throw 'Product lint errors.' }
$summary=[ordered]@{ checked_at=[DateTimeOffset]::Now.ToString('o'); artifact='deliverables/xindong-junshi-debug.apk'; version=$versionName;version_code=$versionCode;
    bytes=(Get-Item -LiteralPath $apk).Length;sha256=(Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant();
    signature='apksigner verify succeeded; Android Debug'; internet_permission=$true; core_tests=$totals;android_unit_tests=$androidTotals;lint_errors=$errors;
    lint_warnings=@($lint.issues.issue | Where-Object severity -eq 'Warning').Count;
    real_phone='NOT_ASSESSED_BY_STATIC_INSPECTION'; real_wechat='NOT_ASSESSED_BY_STATIC_INSPECTION';
    real_ai_calls=$null;human_graded=$null;ai_passed=$null;
    note='Static APK inspection does not assess emulator, phone or AI quality; see separate reports.' }
[IO.File]::WriteAllText((Join-Path $report 'artifact-verification.json'),($summary | ConvertTo-Json -Depth 6),$enc)
$summary | ConvertTo-Json -Depth 6
