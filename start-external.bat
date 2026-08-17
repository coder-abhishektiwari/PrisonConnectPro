@echo off
setlocal
title PrisonConnect - Start Media Server + TURN (internet)
set "SELF=%~f0"
set "PC_REPO=%~dp0"

rem If a stop argument is given, tear down the external containers.
if /i "%~1"=="stop" goto :stopall

powershell -NoProfile -ExecutionPolicy Bypass -Command "$b=Get-Content -LiteralPath $env:SELF; $m=[Array]::IndexOf($b,'__PS1_BEGIN__'); if($m -lt 0){Write-Host 'marker not found' -ForegroundColor Red; exit 1}; $slice=$b[($m+1)..($b.Length-1)]; [IO.File]::WriteAllLines((Join-Path $env:TEMP 'pc_start_external.ps1'), [string[]]$slice)"
if errorlevel 1 goto :fail
powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\pc_start_external.ps1"
set "RC=%ERRORLEVEL%"
del /q "%TEMP%\pc_start_external.ps1" >nul 2>&1
if "%RC%"=="0" (echo. & pause) else (goto :fail)
exit /b %RC%

:stopall
powershell -NoProfile -ExecutionPolicy Bypass -Command "docker rm -f pc-media-ext 2>&1 | Out-Null; docker rm -f pc-coturn-ext 2>&1 | Out-Null; Write-Host 'Removed pc-media-ext and pc-coturn-ext containers' -ForegroundColor Yellow"
pause
exit /b 0

:fail
echo.
echo [ERROR] Something failed - see output above.
pause
exit /b 1
__PS1_BEGIN__
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$repo   = $env:PC_REPO.TrimEnd('\')
$extDir = Join-Path $repo 'external'
New-Item -ItemType Directory -Force -Path $extDir | Out-Null
$extEnv = Join-Path $extDir 'ext.env'
$turnCfgOut = Join-Path $extDir 'turnserver.conf'
$mediaImage = 'prisonconnect-media-ext'
$mediaName = 'pc-media-ext'
$turnName  = 'pc-coturn-ext'
$realm = 'prisonconnect.internet'
$turnUser = 'prisonconnect'

function Write-Step($s) { Write-Host "`n=== $s ===" -ForegroundColor Cyan }
function Write-Ok($s)   { Write-Host "[OK] $s" -ForegroundColor Green }
function Write-Warn($s) { Write-Host "[WARN] $s" -ForegroundColor Yellow }
function New-HexSecret($bytes) {
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $b = New-Object byte[] $bytes
  $rng.GetBytes($b)
  return ([System.BitConverter]::ToString($b)).Replace('-','').ToLower()
}
function Get-PublicIP {
  $urls = @('https://api.ipify.org','https://ifconfig.me/ip','https://icanhazip.com','https://ipinfo.io/ip')
  foreach ($u in $urls) {
    try { $ip = (Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 8).Content.Trim(); if ($ip -match '^\d{1,3}(\.\d{1,3}){3}$') { return $ip } } catch {}
  }
  return $null
}

Write-Step '1/6 Docker engine'
if (Get-Command docker -ErrorAction SilentlyContinue) {
  docker info 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Ok 'Docker is running.' } else { Write-Host 'Docker engine is not running. Please start Docker Desktop and run this again.' -ForegroundColor Red; exit 1 }
} else { Write-Host 'docker command not found. Install Docker Desktop first.' -ForegroundColor Red; exit 1 }

Write-Step '2/6 Public IP'
$pub = Get-PublicIP
$local = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } | Select-Object -First 1).IPAddress
if ($pub) {
  Write-Ok "Public IP: $pub"
  if ($local -and ($local -eq $pub)) { Write-Ok 'Machine has a directly-reachable public IP.' }
  else { Write-Warn "Machine LAN IP is $local but public IP is $pub - this looks like NAT/CGNAT."; Write-Warn 'Render can only reach you if this machine sports a routed public IP or you port-forward (3003/tcp, 40000-40999/udp, 3478, 5349, 41000-41040/udp).' }
} else {
  $pub = $local
  Write-Warn 'Could not detect a public IP over the internet; using the LAN IP as fallback.'
}

Write-Step '3/6 Credentials (generated once, persisted)'
$vars = @{}
if (Test-Path -LiteralPath $extEnv) {
  Get-Content -LiteralPath $extEnv | ForEach-Object { if ($_ -match '^([A-Z0-9_]+)=(.*)$') { $vars[$Matches[1]] = $Matches[2] } }
}
$mediaKey  = $vars['PC_MEDIA_API_KEY']
$turnSecret = $vars['PC_TURN_SECRET']
$turnPass   = $vars['PC_TURN_PASSWORD']
if (-not $mediaKey)   { $mediaKey   = New-HexSecret 16 }
if (-not $turnSecret) { $turnSecret = New-HexSecret 32 }
if (-not $turnPass)   { $turnPass   = New-HexSecret 12 }
Set-Content -LiteralPath $extEnv -Value @(
  "PC_MEDIA_API_KEY=$mediaKey",
  "PC_TURN_SECRET=$turnSecret",
  "PC_TURN_PASSWORD=$turnPass",
  "PC_TURN_REALM=$realm"
)
Write-Ok 'Secrets written to external\ext.env (gitignored).'

Write-Step '4/6 TURN config (coturn)'
$src = Join-Path $repo 'coturn\turnserver.conf'
if (-not (Test-Path -LiteralPath $src)) { Write-Host 'coturn\turnserver.conf not found.' -ForegroundColor Red; exit 1 }
$cfg = Get-Content -Raw -LiteralPath $src
$cfg = $cfg -replace 'static-auth-secret=.*', "static-auth-secret=$turnSecret"
$cfg = $cfg -replace 'realm=.*', "realm=$realm"
$cfg = $cfg -replace 'server-name=.*', "server-name=$realm"
$cfg = $cfg -replace '(?m)^#?\s*external-ip=.*$', "external-ip=$pub"
if ($cfg -notmatch 'lt-cred-mech')               { $cfg += "`nlt-cred-mech`n" }
if ($cfg -notmatch '(?m)^user=prisonconnect:')   { $cfg += "`nuser=prisonconnect:$turnPass`n" }
[System.IO.File]::WriteAllText($turnCfgOut, $cfg)
Write-Ok "Wrote external\turnserver.conf (external-ip=$pub, secret set)."

Write-Step '5/6 Build + start containers'
Write-Host 'Pulling/building media server image (first run may take a while)...'
docker build -q -t $mediaImage (Join-Path $repo 'media-server') 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host 'Media-server image build failed.' -ForegroundColor Red; exit 1 }
docker rm -f $mediaName 2>$null | Out-Null
docker rm -f $turnName  2>$null | Out-Null

docker pull -q coturn/coturn:latest 2>$null | Out-Null

docker run -d --name $mediaName --restart unless-stopped -p 3003:3003 -p 40000-40999:40000-40999/udp -e PORT=3003 -e MEDIA_API_KEY=$mediaKey -e RTC_LISTEN_IP=0.0.0.0 -e RTC_ANNOUNCED_IP=$pub -e RTC_MIN_PORT=40000 -e RTC_MAX_PORT=40999 $mediaImage 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host 'media-server container failed to start.' -ForegroundColor Red; exit 1 }

docker run -d --name $turnName --restart unless-stopped -p 3478:3478/udp -p 3478:3478/tcp -p 5349:5349/tcp -p 5349:5349/udp -p 41000-41040:49160-49200/udp -v "$(Join-Path $extDir 'turnserver.conf'):/etc/coturn/turnserver.conf:ro" -v "$(Join-Path $repo 'coturn\certs'):/etc/coturn/certs:ro" coturn/coturn:latest 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host 'coturn container failed to start.' -ForegroundColor Red; exit 1 }

Write-Step '6/6 Health check'
$healthy = $false
for ($i = 0; $i -lt 15; $i++) {
  Start-Sleep -Seconds 2
  try { $r = Invoke-WebRequest -Uri "http://127.0.0.1:3003/health" -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { $healthy = $true; break } } catch {}
}
if ($healthy) { Write-Ok 'media-server responding on http://127.0.0.1:3003/health' } else { Write-Warn 'media-server health not confirmed yet - check `docker logs pc-media-ext`.' }
Start-Sleep -Seconds 2
docker logs $turnName 2>$null | Select-Object -Last 3
Write-Ok "coturn container started ($turnName)."

Write-Host ""
Write-Host "############################################################################" -ForegroundColor White
Write-Host "# Render ENV VALUES (copy these into your Render services)              #" -ForegroundColor White
Write-Host "############################################################################" -ForegroundColor White
Write-Host ""
Write-Host "PUBLIC media/TURN base:  http://${pub}:3003   /   turn:${pub}:3478" -ForegroundColor Green
Write-Host ""
Write-Host "--- Backend (API) ---" -ForegroundColor Yellow
Write-Host "MEDIA_SERVER_URL=http://${pub}:3003"
Write-Host "MEDIA_API_KEY=$mediaKey"
Write-Host "SIGNALING_URL=<keep your existing Render signaling URL>"
Write-Host ""
Write-Host "--- Signaling server ---" -ForegroundColor Yellow
Write-Host "MEDIA_SERVER_URL=http://${pub}:3003"
Write-Host "MEDIA_API_KEY=$mediaKey"
Write-Host ""
Write-Host "--- Family-web / kiosk / dashboards (build-time Vite vars) ---" -ForegroundColor Yellow
$ice = "[{`"urls`":[`"turn:${pub}:3478?transport=udp`",`"turn:${pub}:3478?transport=tcp`"],`"username`":`"$turnUser`",`"credential`":`"$turnPass`"},{`"urls`":`"stun:${pub}:3478`"}]"
Write-Host "VITE_WEBRTC_ICE_SERVERS=$ice"
Write-Host ""
Write-Host "--- TURN REST-API secret (for clients using use-auth-secret) ---" -ForegroundColor Yellow
Write-Host "TURN_STATIC_AUTH_SECRET=$turnSecret"
Write-Host "TURN_REALM=$realm"
Write-Host "TURN_USERNAME=$turnUser"
Write-Host "TURN_PASSWORD=$turnPass"
Write-Host ""
Write-Host "NOTE: turns:${pub}:5349 is also published, but its self-signed cert will be" -ForegroundColor DarkYellow
Write-Host "rejected by browsers - use the plain turn: URLs above for now." -ForegroundColor DarkYellow
Write-Host "Ports to open on this machine/router (if NAT/CGNAT): 3003/tcp, 40000-40999/udp," -ForegroundColor DarkYellow
Write-Host "3478/udp+tcp, 5349/udp+tcp, 41000-41040/udp." -ForegroundColor DarkYellow
Write-Host ""
Write-Host "Reset secrets (e.g. leak): delete external\ext.env and re-run." -ForegroundColor DarkGray
Write-Host "To stop everything: run:  start-external.bat stop" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Keep this machine ON and Docker running while testing." -ForegroundColor DarkGray