param(
    [Parameter(Mandatory=$true)][string]$Config,
    [string]$Cases='qa/dialogue-samples.jsonl',
    [string]$Output='qa/private/dialogue-sample-run',
    [ValidateSet('check','run')][string]$Action='check',
    [string]$DpapiKeyPath
)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskJava=(Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'CodexAndroidBuild/jdk17') -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin/javac.exe') } | Select-Object -First 1).FullName
if (-not $taskJava) { throw 'JDK17 not found.' }
$taskOriginalJava=$env:JAVA_HOME
$taskOriginalArgs=$env:XINDONG_SAMPLE_ARGS
$taskOriginalKey=$env:XINDONG_SAMPLE_KEY
$taskOriginalJavaOpts=$env:JAVA_OPTS
$taskOriginalEncoding=[Console]::OutputEncoding
$taskPointer=[IntPtr]::Zero
$taskSecret=$null
Push-Location $taskRoot
try {
    [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
    $env:JAVA_OPTS=($taskOriginalJavaOpts+' -Dfile.encoding=UTF-8 -Dsun.stdout.encoding=UTF-8 -Dsun.stderr.encoding=UTF-8').Trim()
    if ($DpapiKeyPath) {
        $taskProtected=Get-Content -LiteralPath $DpapiKeyPath -Raw
        $taskSecret=ConvertTo-SecureString $taskProtected.Trim()
        $taskPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecret)
        $env:XINDONG_SAMPLE_KEY=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer)
    }
    $taskParts=@('--config',(Resolve-Path -LiteralPath $Config).Path,'--cases',(Resolve-Path -LiteralPath $Cases).Path,
        '--out',[IO.Path]::GetFullPath((Join-Path $taskRoot $Output)),'--action',$Action)
    if ($taskParts | Where-Object { $_.Contains('|') }) { throw 'Paths cannot contain the argument separator.' }
    $env:JAVA_HOME=$taskJava
    $env:XINDONG_SAMPLE_ARGS=$taskParts -join '|'
    & './gradlew.bat' ':qa-runner:runSamples' '--console=plain' '--no-daemon'
    if ($LASTEXITCODE -ne 0) { throw 'Sample runner failed; inspect its private ledger before another call.' }
} finally {
    $env:JAVA_HOME=$taskOriginalJava
    $env:XINDONG_SAMPLE_ARGS=$taskOriginalArgs
    $env:XINDONG_SAMPLE_KEY=$taskOriginalKey
    $env:JAVA_OPTS=$taskOriginalJavaOpts
    [Console]::OutputEncoding=$taskOriginalEncoding
    if ($taskPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer) }
    if ($taskSecret) { $taskSecret.Dispose() }
    Pop-Location
}
