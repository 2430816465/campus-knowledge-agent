$projectRoot = Split-Path -Parent $PSScriptRoot
Invoke-RestMethod 'http://127.0.0.1:8008/api/health' -TimeoutSec 5 | ConvertTo-Json -Depth 4
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -in 8008,11434 | Select-Object LocalAddress,LocalPort,OwningProcess | Format-Table
