param([string]$JavaHome, [string]$SdkRoot, [switch]$RefreshLocks)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $JavaHome) {
    $knownJdk = Join-Path $env:LOCALAPPDATA 'CodexAndroidBuild\jdk17'
    $candidate = Get-ChildItem -LiteralPath $knownJdk -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\javac.exe') } | Select-Object -First 1
    if ($candidate) { $JavaHome = $candidate.FullName } else { $JavaHome = $env:JAVA_HOME }
}
if (-not $SdkRoot) { $SdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin\javac.exe'))) { throw 'JDK 17+ required; pass -JavaHome.' }
if (-not (Test-Path -LiteralPath (Join-Path $SdkRoot 'platforms\android-36\android.jar'))) { throw 'Install Android SDK platform 36; pass -SdkRoot.' }
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot
$sdkProperty = $SdkRoot.Replace('\','/')
[IO.File]::WriteAllText((Join-Path $projectRoot 'local.properties'), "sdk.dir=$sdkProperty`n", [Text.UTF8Encoding]::new($false))
Push-Location $projectRoot
try {
    New-Item -ItemType Directory -Force -Path 'reports\tests','deliverables' | Out-Null
    $buildArgs = @('stageVerification','--console=plain','--no-daemon')
    if ($RefreshLocks) { $buildArgs += '--write-locks' }
    & '.\gradlew.bat' @buildArgs 2>&1 | Tee-Object -FilePath 'reports\tests\gradle-build.log'
    if ($LASTEXITCODE -ne 0) { throw "Gradle failed ($LASTEXITCODE); see reports/tests/gradle-build.log" }
    $apkHash = (Get-FileHash -Algorithm SHA256 -LiteralPath 'deliverables\xindong-g1-probe-debug.apk').Hash.ToLowerInvariant()
    [IO.File]::WriteAllText((Join-Path $projectRoot 'deliverables\SHA256SUMS.txt'), "$apkHash  xindong-g1-probe-debug.apk`n", [Text.UTF8Encoding]::new($false))
} finally { Pop-Location }
