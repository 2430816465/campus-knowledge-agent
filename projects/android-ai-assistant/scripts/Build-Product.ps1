param([string]$JavaHome, [string]$SdkRoot, [switch]$RefreshLocks)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $JavaHome) { $JavaHome = (Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'CodexAndroidBuild\jdk17') -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\javac.exe') } | Select-Object -First 1).FullName }
if (-not $JavaHome) { $JavaHome = $env:JAVA_HOME }
if (-not $SdkRoot) { $SdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin\javac.exe'))) { throw 'JDK 17 required.' }
if (-not (Test-Path -LiteralPath (Join-Path $SdkRoot 'platforms\android-36\android.jar'))) { throw 'Android platform 36 required.' }
$env:JAVA_HOME=$JavaHome
$env:ANDROID_HOME=$SdkRoot
$env:ANDROID_SDK_ROOT=$SdkRoot
[IO.File]::WriteAllText((Join-Path $projectRoot 'local.properties'),"sdk.dir=$($SdkRoot.Replace('\','/'))`n",[Text.UTF8Encoding]::new($false))
Push-Location $projectRoot
try {
    New-Item -ItemType Directory -Force -Path 'reports\product','deliverables' | Out-Null
    $buildArgs=@('productVerification','--console=plain','--no-daemon')
    if ($RefreshLocks) { $buildArgs += '--write-locks' }
    & '.\gradlew.bat' @buildArgs 2>&1 | Tee-Object -FilePath 'reports\product\gradle-build.log'
    if ($LASTEXITCODE -ne 0) { throw "Product build failed ($LASTEXITCODE)." }
    Get-FileHash -LiteralPath 'deliverables\xindong-junshi-debug.apk' -Algorithm SHA256
} finally { Pop-Location }
