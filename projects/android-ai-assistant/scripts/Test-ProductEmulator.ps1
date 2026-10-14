param([Parameter(Mandatory=$true)][ValidatePattern('^emulator-[0-9]+$')][string]$Serial,
      [string]$JavaHome,[string]$SdkRoot)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
if (-not $SdkRoot) { $SdkRoot=Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not $JavaHome) { $JavaHome=(Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'CodexAndroidBuild\jdk17') -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\javac.exe') } | Select-Object -First 1).FullName }
if (-not $JavaHome) { $JavaHome=$env:JAVA_HOME }
if (-not $JavaHome -or -not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin\javac.exe'))) { throw 'Pass JDK17 with -JavaHome.' }
$env:JAVA_HOME=$JavaHome; $env:ANDROID_HOME=$SdkRoot
$adb=Join-Path $SdkRoot 'platform-tools\adb.exe'
$qemu=& $adb -s $Serial shell getprop ro.kernel.qemu
if ($LASTEXITCODE -ne 0 -or ($qemu | Out-String).Trim() -ne '1') { throw 'The explicitly selected device is not a running emulator. No real phone will be tested.' }
Push-Location $projectRoot
try {
    New-Item -ItemType Directory -Force -Path 'reports\product' | Out-Null
    & '.\gradlew.bat' 'productVerification' ':product-app:assembleDebugAndroidTest' '--console=plain' '--no-daemon' *> 'reports\product\emulator-script-build.log'
    if ($LASTEXITCODE -ne 0) { throw 'Emulator test APK build failed; see emulator-script-build.log.' }
    # Windows Unicode-source builds use the documented ASCII build directory.
    $hash=[uint32]0
    foreach($letter in $projectRoot.ToCharArray()) { $hash=[uint32](([uint64]$hash*31+[uint32][char]$letter) -band 0xffffffffL) }
    $buildRoot=Join-Path $env:LOCALAPPDATA ('XindongG1Build\'+$hash.ToString('x')+'\product-app')
    if (-not ($projectRoot.ToCharArray() | Where-Object { [int]$_ -gt 127 })) { $buildRoot=Join-Path $projectRoot 'product-app\build' }
    & $adb -s $Serial install -r 'deliverables\xindong-junshi-debug.apk'
    if ($LASTEXITCODE -ne 0) { throw 'Selected emulator product install failed.' }
    & $adb -s $Serial install -r (Join-Path $buildRoot 'outputs\apk\androidTest\debug\product-app-debug-androidTest.apk')
    if ($LASTEXITCODE -ne 0) { throw 'Selected emulator test install failed.' }
    $output=& $adb -s $Serial shell am instrument -w -r 'cn.xindong.junshi.test/androidx.test.runner.AndroidJUnitRunner' 2>&1
    $exitCode=$LASTEXITCODE
    [IO.File]::WriteAllLines((Join-Path $projectRoot 'reports\product\emulator-instrumentation.txt'),[string[]]$output,[Text.UTF8Encoding]::new($false))
    $result=$output | Out-String
    if ($exitCode -ne 0 -or $result -notmatch 'OK \([0-9]+ tests?\)' -or $result -match 'FAILURES!!!|INSTRUMENTATION_FAILED|Process crashed') { throw 'Emulator instrumentation failed; inspect emulator-instrumentation.txt.' }
    $ocr=& $adb -s $Serial exec-out run-as cn.xindong.junshi cat files/qa-synthetic-ocr.json
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic OCR observation missing.' }
    [IO.File]::WriteAllText((Join-Path $projectRoot 'reports\product\synthetic-ocr.json'),($ocr | Out-String).Trim(),[Text.UTF8Encoding]::new($false))
    Write-Output ($result -split "`n" | Where-Object { $_ -match 'OK \(' })
    Write-Output 'Synthetic own-app emulator tests only; no real WeChat, phone, or provider AI acceptance.'
} finally { Pop-Location }
