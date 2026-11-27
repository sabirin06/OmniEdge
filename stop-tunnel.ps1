# Stop the Cloudflare Quick Tunnel and return OmniEdge to local-only mode.
#
#   powershell -ExecutionPolicy Bypass -File .\stop-tunnel.ps1
#
# Stops the cloudflared process started by start-tunnel.ps1, restores the local
# ALLOWED_HOSTS / CSRF_TRUSTED_ORIGINS / HTTPS_ENABLED values in .env and recreates
# only the api container. Database and evidence volumes are not touched.
param([int]$Port = 8080)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$stateDir = Join-Path $root ".tunnel"
$pidFile = Join-Path $stateDir "cloudflared.pid"
$urlFile = Join-Path $stateDir "url.txt"
$envFile = Join-Path $root ".env"

Set-Location $root

if (Test-Path $pidFile) {
    $tunnelPid = [int](Get-Content $pidFile)
    $process = Get-Process -Id $tunnelPid -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -eq "cloudflared") {
        Stop-Process -Id $tunnelPid -Force
        Write-Host "Stopped cloudflared (PID $tunnelPid)."
    } else {
        Write-Host "No running tunnel process found for PID $tunnelPid."
    }
    Remove-Item $pidFile -Force
} else {
    Write-Host "No tunnel PID file found; nothing to stop."
}
if (Test-Path $urlFile) { Remove-Item $urlFile -Force }

if (Test-Path $envFile) {
    $values = @{
        "ALLOWED_HOSTS"        = "localhost,127.0.0.1"
        "CSRF_TRUSTED_ORIGINS" = "http://localhost:$Port"
        "HTTPS_ENABLED"        = "False"
    }
    $lines = [System.Collections.Generic.List[string]]([IO.File]::ReadAllLines($envFile))
    foreach ($key in $values.Keys) {
        $index = -1
        for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -match "^$key=") { $index = $i; break } }
        $line = "$key=$($values[$key])"
        if ($index -ge 0) { $lines[$index] = $line } else { $lines.Add($line) }
    }
    [IO.File]::WriteAllLines($envFile, $lines, (New-Object System.Text.UTF8Encoding($false)))
    docker compose up -d --force-recreate --no-deps api | Out-Null
    Write-Host "Restored local settings; OmniEdge is back on http://localhost:$Port only."
}
