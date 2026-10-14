param([string]$Config='qa\private\config.local.json',[string]$Output,[ValidateRange(1,100)][int]$Limit=1,[switch]$Resume,
      [ValidateSet('run','status','confirm-budget','reconcile')][string]$Action='run',[string]$ChargeId,[string]$ActualYuan,[string]$JavaHome)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
if (-not $Output) { $Output='qa\private\run-'+(Get-Date -Format 'yyyyMMdd-HHmmss') }
if (-not [IO.Path]::IsPathRooted($Config)) { $Config=Join-Path $projectRoot $Config }
if (-not [IO.Path]::IsPathRooted($Output)) { $Output=Join-Path $projectRoot $Output }
if (-not (Test-Path -LiteralPath $Config)) { throw 'Copy qa/config-template.json to qa/private/config.local.json and fill credentials locally. Never send keys in chat.' }
if (-not $JavaHome) { $JavaHome=(Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'CodexAndroidBuild\jdk17') -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\javac.exe') } | Select-Object -First 1).FullName }
if (-not $JavaHome) { $JavaHome=$env:JAVA_HOME }
if (-not $JavaHome -or -not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin\javac.exe'))) { throw 'JDK 17 required; pass -JavaHome or configure JAVA_HOME.' }
$compilerVersion=& (Join-Path $JavaHome 'bin\javac.exe') -version 2>&1
if ($LASTEXITCODE -ne 0 -or ($compilerVersion | Out-String) -notmatch '^javac 17(?:\.|\s|$)') { throw 'JDK 17 required; the selected JAVA_HOME has another compiler version. Pass -JavaHome.' }
$env:JAVA_HOME=$JavaHome
Push-Location $projectRoot
$previousQaArgs=$env:XINDONG_QA_ARGS
$previousJavaOpts=$env:JAVA_OPTS
$previousConsoleEncoding=[Console]::OutputEncoding
try {
    [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
    $env:JAVA_OPTS=($previousJavaOpts+' -Dfile.encoding=UTF-8 -Dsun.stdout.encoding=UTF-8 -Dsun.stderr.encoding=UTF-8').Trim()
    $argsValue='--config|'+$Config+'|--action|'+$Action
    if ($Action -eq 'run') { $argsValue+='|--cases|'+(Join-Path $projectRoot 'qa\cases.jsonl')+'|--out|'+$Output+'|--limit|'+$Limit+'|--resume|'+$Resume.IsPresent.ToString().ToLowerInvariant() }
    if ($Action -eq 'reconcile') { if (-not $ChargeId -or -not $ActualYuan) { throw 'Reconcile requires ChargeId and verified ActualYuan.' }; $argsValue+='|--charge|'+$ChargeId+'|--actual-yuan|'+$ActualYuan }
    $env:XINDONG_QA_ARGS=$argsValue
    & '.\gradlew.bat' ':qa-runner:runQuality' '--console=plain' '--no-daemon'
    if ($LASTEXITCODE -ne 0) { throw 'Real quality run stopped; check private ledger before retrying. No pass status has been issued.' }
} finally {
    $env:XINDONG_QA_ARGS=$previousQaArgs; $env:JAVA_OPTS=$previousJavaOpts
    [Console]::OutputEncoding=$previousConsoleEncoding
    Pop-Location
}
