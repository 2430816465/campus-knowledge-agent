[CmdletBinding()]
param(
    [string]$ProjectRoot = (Join-Path $PSScriptRoot '..'),
    [string]$Python,
    [string]$Cohort,
    [ValidateRange(1, 2147483647)][int]$Rounds = 1,
    [ValidateRange(0, 2147483647)][int]$MaxRequests = 500,
    [ValidateRange(1, 2147483647)][int]$ImportLimit = 300,
    [ValidateRange(1, 2147483647)][int]$DocLimit = 20,
    [switch]$SkipDoc,
    [switch]$RediscoverArchived,
    [switch]$StopWhenExhausted,
    [switch]$DownloadOnly
)

$ErrorActionPreference = 'Stop'
$spawned = $false
$spawnedPid = $null

function ConvertTo-NativeArgument([string]$Value) {
    # Start-Process joins ArgumentList on Windows. Quote each argument for the
    # native command line; no shell, Invoke-Expression or string-built PS code.
    $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
    $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
    return '"' + $escaped + '"'
}

try {
    $ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).ProviderPath
    if (-not $Python) { $Python = Join-Path $ProjectRoot '.venv\Scripts\python.exe' }
    $Python = (Resolve-Path -LiteralPath $Python).ProviderPath
    if ($Cohort) { $Cohort = (Resolve-Path -LiteralPath $Cohort).ProviderPath }
    $pipeline = Join-Path $ProjectRoot 'scripts\sync_school_archive.py'
    $statusScript = Join-Path $ProjectRoot 'scripts\school_sync_status.py'
    foreach ($required in @($Python, $pipeline, $statusScript)) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
            throw 'Required Python/pipeline/status file is unavailable.'
        }
    }
    $dataRoot = if ($env:CAMPUS_DATA) {
        if ([IO.Path]::IsPathRooted($env:CAMPUS_DATA)) { [IO.Path]::GetFullPath($env:CAMPUS_DATA) }
        else { [IO.Path]::GetFullPath((Join-Path $ProjectRoot $env:CAMPUS_DATA)) }
    } else { Join-Path $ProjectRoot 'data' }
    # No PID or previous launch receipt is needed to refuse a duplicate.
    $probeText = & $Python $statusScript '--project-root' $ProjectRoot '--data-root' $dataRoot '--preflight'
    $probeCode = $LASTEXITCODE
    $probe = ($probeText -join [Environment]::NewLine) | ConvertFrom-Json
    if ($probeCode -ne 0 -or -not $probe.preflight.allowed) {
        [ordered]@{ spawned = $false; reason = $probe.preflight.reason; locks = $probe.locks;
            core_pipeline_lock_is_final_arbiter = $true } | ConvertTo-Json -Depth 8 -Compress
        if ($probeCode -eq 75) { exit 75 }
        exit 1
    }

    $launchId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + [guid]::NewGuid().ToString('N')
    $logs = [IO.Path]::GetFullPath((Join-Path $dataRoot ('school-sync-launch-logs\' + $launchId)))
    $boundary = [IO.Path]::GetFullPath($dataRoot).TrimEnd('\') + '\'
    if (-not $logs.StartsWith($boundary, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Launch log path escapes the configured data directory.'
    }
    [IO.Directory]::CreateDirectory($logs) | Out-Null
    $stdoutLog = Join-Path $logs 'pipeline.stdout.log'
    $stderrLog = Join-Path $logs 'pipeline.stderr.log'
    $nativeArguments = @('-u', $pipeline, '--rounds', [string]$Rounds,
        '--max-requests', [string]$MaxRequests, '--import-limit', [string]$ImportLimit,
        '--doc-limit', [string]$DocLimit)
    if ($SkipDoc) { $nativeArguments += '--skip-doc' }
    if ($Cohort) { $nativeArguments += @('--cohort', $Cohort) }
    if ($RediscoverArchived) { $nativeArguments += '--rediscover-archived' }
    if ($StopWhenExhausted) { $nativeArguments += '--stop-when-exhausted' }
    if ($DownloadOnly) { $nativeArguments += '--download-only' }
    $argumentLine = ($nativeArguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' '
    $startedAt = [DateTime]::UtcNow.ToString('o')
    $previousCampusData = $env:CAMPUS_DATA
    try {
        # Normalize an optional relative data directory for both preflight and
        # child, regardless of the directory the user launched PowerShell from.
        $env:CAMPUS_DATA = $dataRoot
        $process = Start-Process -FilePath $Python -ArgumentList $argumentLine -WorkingDirectory $ProjectRoot `
            -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
    }
    finally { $env:CAMPUS_DATA = $previousCampusData }
    $spawned = $true
    $spawnedPid = $process.Id
    $receipt = [ordered]@{ schema_version = 1; launch_id = $launchId; spawned = $true;
        pid = $process.Id; started_at = $startedAt; status = 'spawned_pending_core_lock';
        stdout_log = $stdoutLog; stderr_log = $stderrLog; rounds_requested = $Rounds;
        core_pipeline_lock_is_final_arbiter = $true; pid_is_informational_only = $true }
    # This receipt proves only process creation. The child's own OS lock/state
    # decides whether any work starts; two racing launchers cannot run two cores.
    $receiptJson = $receipt | ConvertTo-Json -Depth 8 -Compress
    [IO.File]::WriteAllText((Join-Path $logs 'launch.json'), $receiptJson, [Text.UTF8Encoding]::new($false))
    $receiptJson
    exit 0
}
catch {
    [ordered]@{ spawned = $spawned; pid = $spawnedPid; reason = 'launcher_failed'; error_type = $_.Exception.GetType().Name } |
        ConvertTo-Json -Compress
    exit 1
}
