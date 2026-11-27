# Expose the local OmniEdge Docker stack through a free Cloudflare Quick Tunnel.
#
#   powershell -ExecutionPolicy Bypass -File .\start-tunnel.ps1
#
# - Starts cloudflared for http://localhost:8080 (the container Nginx, loopback only).
# - Reads the generated https://<random>.trycloudflare.com hostname.
# - Writes that exact hostname into .env (ALLOWED_HOSTS / CSRF_TRUSTED_ORIGINS),
#   turns HTTPS_ENABLED on (secure cookies, HTTPS redirect, HSTS) and recreates
#   only the api container. The database and evidence volumes are untouched.
# The URL is temporary: it changes every time the tunnel starts and stops working
# when this PC sleeps, shuts down or loses internet. Run .\stop-tunnel.ps1 to undo.
param([int]$Port = 8080)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$stateDir = Join-Path $root ".tunnel"
$logFile = Join-Path $stateDir "cloudflared.log"
$pidFile = Join-Path $stateDir "cloudflared.pid"
$urlFile = Join-Path $stateDir "url.txt"
$envFile = Join-Path $root ".env"

function Find-Cloudflared {
    $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($p in @("${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe", "$env:ProgramFiles\cloudflared\cloudflared.exe")) {
        if (Test-Path $p) { return $p }
    }
    throw "cloudflared.exe not found. Install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
}

function Set-EnvValues([hashtable]$values) {
    if (-not (Test-Path $envFile)) { throw ".env not found. Copy .env.example to .env first." }
    $lines = [System.Collections.Generic.List[string]]([IO.File]::ReadAllLines($envFile))
    foreach ($key in $values.Keys) {
        $index = -1
        for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -match "^$key=") { $index = $i; break } }
        $line = "$key=$($values[$key])"
        if ($index -ge 0) { $lines[$index] = $line } else { $lines.Add($line) }
    }
    [IO.File]::WriteAllLines($envFile, $lines, (New-Object System.Text.UTF8Encoding($false)))
}

function Wait-ApiHealthy {
    for ($i = 0; $i -lt 40; $i++) {
        $status = (docker inspect -f "{{.State.Health.Status}}" omniedge-api-1 2>$null)
        if ($status -eq "healthy") { return }
        Start-Sleep -Seconds 3
    }
    throw "The api container did not become healthy. Check: docker compose logs --tail=100 api"
}

Set-Location $root
New-Item -ItemType Directory -Force $stateDir | Out-Null

if ((Test-Path $pidFile) -and (Get-Process -Id ([int](Get-Content $pidFile)) -ErrorAction SilentlyContinue)) {
    Write-Host "A tunnel is already running: $(Get-Content $urlFile -ErrorAction SilentlyContinue)"
    Write-Host "Run .\stop-tunnel.ps1 first to start a new one."
    exit 0
}

Write-Host "Checking the local stack..."
docker compose up -d | Out-Null
Wait-ApiHealthy
$local = Invoke-RestMethod "http://localhost:$Port/api/v1/health/" -TimeoutSec 15
if ($local.status -ne "ok") { throw "Local health check failed: $($local | ConvertTo-Json -Compress)" }

Write-Host "Starting Cloudflare Quick Tunnel for http://localhost:$Port ..."
if (Test-Path $logFile) { Remove-Item $logFile -Force }
$exe = Find-Cloudflared
$process = Start-Process -FilePath $exe -ArgumentList @("tunnel", "--no-autoupdate", "--url", "http://localhost:$Port") `
    -RedirectStandardError $logFile -RedirectStandardOutput (Join-Path $stateDir "cloudflared.out") `
    -WindowStyle Hidden -PassThru
Set-Content -Path $pidFile -Value $process.Id -Encoding ascii

$hostName = $null
for ($i = 0; $i -lt 60 -and -not $hostName; $i++) {
    Start-Sleep -Seconds 1
    if ($process.HasExited) { throw "cloudflared exited. See $logFile" }
    if (Test-Path $logFile) {
        $match = Select-String -Path $logFile -Pattern "https://([a-z0-9-]+\.trycloudflare\.com)" | Select-Object -First 1
        if ($match) { $hostName = $match.Matches[0].Groups[1].Value }
    }
}
if (-not $hostName) { Stop-Process -Id $process.Id -Force; throw "No tunnel URL after 60 seconds. See $logFile" }
$url = "https://$hostName"
Set-Content -Path $urlFile -Value $url -Encoding ascii

Write-Host "Configuring Django for $hostName ..."
Set-EnvValues @{
    "ALLOWED_HOSTS"        = "localhost,127.0.0.1,$hostName"
    "CSRF_TRUSTED_ORIGINS" = "http://localhost:$Port,$url"
    "HTTPS_ENABLED"        = "True"
}
docker compose up -d --force-recreate --no-deps api | Out-Null
Wait-ApiHealthy

Write-Host "Waiting for the public URL to respond..."
$ok = $false
for ($i = 0; $i -lt 30 -and -not $ok; $i++) {
    try {
        $remote = Invoke-RestMethod "$url/api/v1/health/" -TimeoutSec 15
        $ok = ($remote.status -eq "ok")
    } catch { Start-Sleep -Seconds 3 }
}

Write-Host ""
if ($ok) { Write-Host "OmniEdge is public at: $url" -ForegroundColor Green }
else { Write-Host "Tunnel started at $url but the health check has not answered yet; retry in a minute." -ForegroundColor Yellow }
Write-Host "Health: $url/api/v1/health/"
Write-Host "While the tunnel runs, use the public URL (http://localhost:$Port redirects to HTTPS)."
Write-Host "Keep this PC awake and online. Stop with: .\stop-tunnel.ps1"
