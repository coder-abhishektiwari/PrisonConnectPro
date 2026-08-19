@echo off
setlocal
title PrisonConnect - Start Media Server via Playit tunnel (internet, UDP-only)
set "SELF=%~f0"
set "PC_REPO=%~dp0"

rem If a stop argument is given, tear down the media server.
if /i "%~1"=="stop" goto :stopall

powershell -NoProfile -ExecutionPolicy Bypass -Command "$b=Get-Content -LiteralPath $env:SELF; $m=[Array]::IndexOf($b,'__PS1_BEGIN__'); if($m -lt 0){Write-Host 'marker not found' -ForegroundColor Red; exit 1}; $slice=$b[($m+1)..($b.Length-1)]; [IO.File]::WriteAllLines((Join-Path $env:TEMP 'pc_start_playit.ps1'), [string[]]$slice)"
if errorlevel 1 goto :fail
powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\pc_start_playit.ps1"
set "RC=%ERRORLEVEL%"
del /q "%TEMP%\pc_start_playit.ps1" >nul 2>&1
if "%RC%"=="0" (echo. & pause) else (goto :fail)
exit /b %RC%

:stopall
powershell -NoProfile -ExecutionPolicy Bypass -Command "$pids = @(); if(Test-Path (Join-Path $env:TEMP 'pc_playit_pids.txt')){ Get-Content (Join-Path $env:TEMP 'pc_playit_pids.txt') | ForEach-Object { if($_ -match '^\d+$'){ Stop-Process -Id ([int]$_) -Force -ErrorAction SilentlyContinue } } }; Remove-Item (Join-Path $env:TEMP 'pc_playit_pids.txt') -ErrorAction SilentlyContinue; Get-Process -Name 'mediasoup-worker' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; Write-Host 'Stopped playit media server (incl. orphaned worker).' -ForegroundColor Yellow"
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
$repo = $env:PC_REPO.TrimEnd('\')
$extEnv = Join-Path $repo 'external\ext.env'
$logRoot = Join-Path $repo 'backend\logs'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

$playitHostname = 'tissues-cafeteria.tun.ply.gg'
$playitPortBase = 35384
$playitPortCount = 4

function Write-Step($s) { Write-Host "`n=== $s ===" -ForegroundColor Cyan }
function Write-Ok($s)   { Write-Host "[OK] $s" -ForegroundColor Green }
function Write-Warn($s) { Write-Host "[WARN] $s" -ForegroundColor Yellow }

Write-Step '1/3 Config'
if (Get-Command Resolve-DnsName -ErrorAction SilentlyContinue) {
  $ip = (Resolve-DnsName $playitHostname -Type A -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress } | Select-Object -First 1 -ExpandProperty IPAddress)
  if ($ip) { $playitHost = $ip } else { Write-Warn "Could not resolve $playitHostname - using cached $playitHost"; $playitHost = '147.185.221.231' }
} else { $playitHost = '147.185.221.231' }
if (-not (Test-Path -LiteralPath $extEnv)) { Write-Host 'external\ext.env not found. Run start-external.bat once to generate secrets.' -ForegroundColor Red; exit 1 }
$vars = @{}
Get-Content -LiteralPath $extEnv | ForEach-Object { if ($_ -match '^([A-Z0-9_]+)=(.*)$') { $vars[$Matches[1]] = $Matches[2] } }
$mediaKey = $vars['PC_MEDIA_API_KEY']
if (-not $mediaKey) { Write-Host 'PC_MEDIA_API_KEY missing in external\ext.env.' -ForegroundColor Red; exit 1 }

Write-Host "Media API key : $mediaKey" -ForegroundColor Gray
Write-Host "Playit host   : $playitHost  (udp $playitPortBase-$($playitPortBase + $playitPortCount - 1), from $playitHostname)" -ForegroundColor Gray

Write-Step '2/3 Free port + launch media server'
$oldPidFile = Join-Path $env:TEMP 'pc_playit_pids.txt'
if (Test-Path -LiteralPath $oldPidFile) {
  Get-Content -LiteralPath $oldPidFile | ForEach-Object { if ($_ -match '^\d+$') { Stop-Process -Id ([int]$_) -Force -ErrorAction SilentlyContinue } }
}
# Orphaned mediasoup worker children (killed node leaves them holding ports)
Get-Process -Name 'mediasoup-worker' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
$free = $false
for ($i = 0; $i -lt 8; $i++) {
  Start-Sleep -Milliseconds 750
  $busy = Get-NetTCPConnection -LocalPort 3003 -State Listen -ErrorAction SilentlyContinue
  if (-not $busy) { $free = $true; break }
}
if (-not $free) { Write-Host "Port 3003 is still in use by pid(s) $((Get-NetTCPConnection -LocalPort 3003 -State Listen -ErrorAction SilentlyContinue).OwningProcess -join ',') - stop the conflicting media server first (run: start-playit.bat stop or start-local.bat stop) then retry." -ForegroundColor Red; exit 1 }
$env:PORT = '3003'
$env:MEDIA_API_KEY = $mediaKey
$env:RTC_LISTEN_IP = '0.0.0.0'
$env:RTC_ANNOUNCED_IP = $playitHost
$env:RTC_MIN_PORT = "$playitPortBase"
$env:RTC_MAX_PORT = "$($playitPortBase + $playitPortCount - 1)"
$env:RTC_ENABLE_UDP = 'true'
$env:RTC_ENABLE_TCP = 'false'

$mp = Start-Process node -ArgumentList 'server.js' -WorkingDirectory (Join-Path $repo 'media-server') -RedirectStandardOutput (Join-Path $logRoot 'playit-media.out.log') -RedirectStandardError (Join-Path $logRoot 'playit-media.err.log') -WindowStyle Hidden -PassThru
Write-Ok ('media-server starting (pid ' + $mp.Id + ')')
Set-Content -LiteralPath (Join-Path $env:TEMP 'pc_playit_pids.txt') -Value $mp.Id

Write-Step '3/3 Health check'
$healthy = $false
for ($i = 0; $i -lt 15; $i++) {
  Start-Sleep -Seconds 1
  try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3003/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { $healthy = $true; break } } catch {}
}
if ($healthy) { Write-Ok 'media-server responding on http://127.0.0.1:3003/health' } else { Write-Warn 'media-server health not confirmed yet - check backend\logs\playit-media.*.log' }

Write-Host ""
Write-Host "############################################################################" -ForegroundColor White
Write-Host "# PLAYIT DEPLOYMENT CHECKLIST                                          #" -ForegroundColor White
Write-Host "############################################################################" -ForegroundColor White
Write-Host ""
Write-Host "1) Playit dashboard: UDP tunnel origin MUST be 127.0.0.1:$playitPortBase" -ForegroundColor Yellow
Write-Host "   (same as its public port base). Edit it now: LOCAL/PORT ORIGIN = $playitPortBase" -ForegroundColor Yellow
Write-Host "   Public: tissues-cafeteria.tun.ply.gg:$playitPortBase  ->  local $playitPortBase-$($playitPortBase + $playitPortCount - 1)" -ForegroundColor Gray
Write-Host ""
Write-Host "2) Media HTTP API (TCP port 3003) - NOT covered by playit free UDP." -ForegroundColor Yellow
Write-Host "   Expose it with a free HTTP tunnel (keep it running in ANOTHER window):" -ForegroundColor Yellow
Write-Host "      cloudflared tunnel --url http://127.0.0.1:3003" -ForegroundColor Green
Write-Host "   Copy the https://xxxx.trycloudflare.com URL from its output." -ForegroundColor Gray
Write-Host ""
Write-Host "3) Render > signaling service > Environment:" -ForegroundColor Yellow
Write-Host "      MEDIA_SERVER_URL=https://xxxx.trycloudflare.com    (step 2 URL)" -ForegroundColor Green
Write-Host "      MEDIA_API_KEY=$mediaKey (leave as-is if already set)" -ForegroundColor Green
Write-Host ""
Write-Host "NOTE: if playit ever re-assigns its public IP, update RTC_ANNOUNCED_IP at the" -ForegroundColor DarkYellow
Write-Host "top of this script and edit it in Playit according to nslookup tissues-cafeteria.tun.ply.gg" -ForegroundColor DarkYellow
Write-Host ""
Write-Host "To stop media server: run:  start-playit.bat stop" -ForegroundColor DarkGray
Write-Host "Keep this machine ON + playit agent + cloudflared running while testing." -ForegroundColor DarkGray