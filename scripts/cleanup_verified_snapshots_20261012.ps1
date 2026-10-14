param([switch]$ValidateOnly, [switch]$Round2, [switch]$Round3)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$snapshotRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'data\parse-runs')).TrimEnd('\') + '\'
$planPath = Join-Path $projectRoot 'reports\parse-snapshot-cleanup-20261012-plan.json'
$receiptPath = Join-Path $projectRoot 'reports\parse-snapshot-cleanup-20261012-receipt.json'
$expectedCount = 17
$expectedBytes = 25682931712
if ($Round2 -and $Round3) { throw 'Select only one cleanup round.' }
if ($Round2) {
    $planPath = Join-Path $projectRoot 'reports\parse-snapshot-cleanup-round2-20261012-plan.json'
    $receiptPath = Join-Path $projectRoot 'reports\parse-snapshot-cleanup-round2-20261012-receipt.json'
    $expectedCount = 21
    $expectedBytes = 23507341312
}
if ($Round3) {
    $planPath = Join-Path $projectRoot 'reports\parse-snapshot-cleanup-round3-20261013-plan.json'
    $receiptPath = Join-Path $projectRoot 'reports\parse-snapshot-cleanup-round3-20261013-receipt.json'
    $expectedCount = 20
    $expectedBytes = 32366497792
}
$plan = Get-Content -LiteralPath $planPath -Raw -Encoding UTF8 | ConvertFrom-Json
$candidates = @($plan.files | Where-Object decision -eq 'delete')
$parser = Get-Content -LiteralPath (Join-Path $projectRoot 'reports\downloaded-parse-state.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$guardian = Get-Content -LiteralPath (Join-Path $projectRoot 'reports\parse-supervisor-state.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$protectedRuns = @($plan.protected_runs) + @($parser.run_id) + @($guardian.runs | ForEach-Object run_id)
if ($candidates.Count -ne $expectedCount -or ($candidates | Measure-Object bytes -Sum).Sum -ne $expectedBytes) { throw 'Unexpected cleanup manifest; refusing deletion.' }
$handles = [Collections.Generic.List[object]]::new()
$sidecars = @{}
try {
# Keep read/write access excluded through validation and deletion. Delete sharing
# permits only the explicit Remove-Item calls below, not SQLite readers/writers.
foreach ($candidate in $candidates) {
    $target = [IO.Path]::GetFullPath($candidate.path)
    if (-not $target.StartsWith($snapshotRoot, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($target) -ne '.sqlite3') { throw 'Target outside snapshot directory.' }
    $handles.Add([IO.File]::Open($target, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Delete))
    $item = Get-Item -LiteralPath $target -Force
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -ne $candidate.bytes -or $protectedRuns -contains $item.Directory.Name) { throw 'Target identity changed or protected.' }
    $timestampNs = ([decimal]$item.LastWriteTimeUtc.Ticks - 621355968000000000) * 100
    if ([Math]::Abs($timestampNs - [decimal]$candidate.mtime_ns) -gt 1000) { throw 'Snapshot modified after audit.' }
    if ($Round2 -or $Round3) {
        $checkpoint = [IO.Path]::GetFullPath($candidate.retained_checkpoint)
        if ([IO.Path]::GetDirectoryName($checkpoint) -ne $item.DirectoryName -or $checkpoint -eq $target -or -not (Test-Path -LiteralPath $checkpoint -PathType Leaf) -or -not (Test-Path -LiteralPath $candidate.retained_result -PathType Leaf)) { throw 'Required recovery checkpoint or result missing.' }
        $runState = Get-Content -LiteralPath (Join-Path $item.DirectoryName 'state.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($runState.status -notin @('bounded_run_completed', 'waiting_memory_checkpoint_retained')) { throw 'Run is not safely resumable.' }
    }
    if (Test-Path -LiteralPath ($target + '-journal')) { throw 'SQLite journal present; recovery review required.' }
    $sidecars[$target] = @()
    foreach ($suffix in @('-wal', '-shm')) {
        $sidecar = $target + $suffix
        if (Test-Path -LiteralPath $sidecar) {
            $sidecarItem = Get-Item -LiteralPath $sidecar -Force
            if ($sidecarItem.PSIsContainer -or ($sidecarItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Unsafe SQLite sidecar path.' }
            $handle = [IO.File]::Open($sidecar, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Delete)
            $handles.Add($handle)
            if (($suffix -eq '-wal' -and $handle.Length -ne 0) -or ($suffix -eq '-shm' -and $handle.Length -ne 32768)) { throw 'SQLite sidecar contains data or has unexpected size; retaining snapshot.' }
            $sidecars[$target] += $sidecar
        }
    }
    if ((Test-Path -LiteralPath ($target + '-shm')) -and -not (Test-Path -LiteralPath ($target + '-wal'))) { throw 'SHM without verified empty WAL; retaining snapshot.' }
    $ancestor = $item.Directory
    while ($ancestor.FullName.StartsWith($snapshotRoot.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) {
        if ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse directory in target path.' }
        $ancestor = $ancestor.Parent
    }
}
if ($ValidateOnly) {
    Write-Output ('Validated {0} snapshots, including exclusive access and empty WAL checks. No files deleted.' -f $candidates.Count)
    return
}
$results = [Collections.Generic.List[object]]::new()
$freeBefore = (Get-PSDrive C).Free
foreach ($candidate in $candidates) {
    try {
        Remove-Item -LiteralPath $candidate.path -Force -ErrorAction Stop
        foreach ($sidecar in $sidecars[[IO.Path]::GetFullPath($candidate.path)]) {
            Remove-Item -LiteralPath $sidecar -Force -ErrorAction Stop
        }
        $results.Add([pscustomobject]@{ path = $candidate.path; bytes = $candidate.bytes; deleted = -not (Test-Path -LiteralPath $candidate.path) })
    } catch {
        $results.Add([pscustomobject]@{ path = $candidate.path; bytes = $candidate.bytes; deleted = $false; error = $_.Exception.Message })
    }
    [ordered]@{ checked_at = (Get-Date).ToString('o'); plan = $planPath; free_before = $freeBefore; free_after = (Get-PSDrive C).Free; results = @($results.ToArray()); originals_logs_states_deleted = $false } |
        ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $receiptPath -Encoding UTF8
}
$deleted = @($results | Where-Object deleted)
Write-Output ('Deleted {0}/{1} verified snapshots; released {2:N2} GiB; C free {3:N2} GiB.' -f $deleted.Count, $candidates.Count, (($deleted | Measure-Object bytes -Sum).Sum / 1GB), ((Get-PSDrive C).Free / 1GB))
if ($deleted.Count -ne $candidates.Count) { throw 'Some snapshots were not deleted. See cleanup receipt; do not retry without checking it.' }
} finally {
    foreach ($handle in $handles) { $handle.Dispose() }
    # Windows frees delete-pending files only after the last handle closes.
    # Refresh the receipt after closing our validation handles.
    if (-not $ValidateOnly -and (Get-Variable results -ErrorAction SilentlyContinue)) {
        [ordered]@{ checked_at = (Get-Date).ToString('o'); plan = $planPath; free_before = $freeBefore; free_after = (Get-PSDrive C).Free; handles_closed = $true; results = @($results.ToArray()); originals_logs_states_deleted = $false } |
            ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $receiptPath -Encoding UTF8
    }
}
