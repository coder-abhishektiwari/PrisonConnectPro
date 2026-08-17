@echo off
setlocal
title PrisonConnect - Start LOCAL stack (backend + signaling + media + family-web)
set "SELF=%~f0"
set "PC_REPO=%~dp0"

rem If a stop argument is given, tear down the local servers.
if /i "%~1"=="stop" goto :stopall

powershell -NoProfile -ExecutionPolicy Bypass -Command "$b=Get-Content -LiteralPath $env:SELF; $m=[Array]::IndexOf($b,'__PS1_BEGIN__'); if($m -lt 0){Write-Host 'marker not found' -ForegroundColor Red; exit 1}; $slice=$b[($m+1)..($b.Length-1)]; [IO.File]::WriteAllLines((Join-Path $env:TEMP 'pc_start_local.ps1'), [string[]]$slice)"
if errorlevel 1 goto :fail
powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\pc_start_local.ps1"
set "RC=%ERRORLEVEL%"
del /q "%TEMP%\pc_start_local.ps1" >nul 2>&1
if "%RC%"=="0" (echo. & pause) else (goto :fail)
exit /b %RC%

:stopall
powershell -NoProfile -ExecutionPolicy Bypass -Command "$pids = @(); if(Test-Path (Join-Path $env:TEMP 'pc_local_pids.txt')){ Get-Content (Join-Path $env:TEMP 'pc_local_pids.txt') | ForEach-Object { if($_ -match '^\d+$'){ Stop-Process -Id ([int]$_) -Force -ErrorAction SilentlyContinue } } }; Remove-Item (Join-Path $env:TEMP 'pc_local_pids.txt') -ErrorAction SilentlyContinue; Write-Host 'Stopped local PrisonConnect servers (backend/signaling/media/family-web).' -ForegroundColor Yellow"
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
if (Test-Path Env:PC_REPO) { $repo = $env:PC_REPO.TrimEnd('\') }
elseif (Test-Path Env:SELF) { $repo = (Split-Path $env:SELF -Parent).TrimEnd('\') }
else { $repo = (Get-Location).Path.TrimEnd('\') }
$logRoot = Join-Path $repo 'backend\logs'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

function Write-Step($s) { Write-Host "`n=== $s ===" -ForegroundColor Cyan }
function Write-Ok($s)   { Write-Host "[OK] $s" -ForegroundColor Green }
function Write-Warn($s) { Write-Host "[WARN] $s" -ForegroundColor Yellow }

Write-Step '1/6 Postgres (docker)'
$pg = docker ps --filter "name=prisonconnect-postgres" --format "{{.Names}}" 2>$null | Select-Object -First 1
if ($pg) { Write-Ok "postgres container running: $pg" }
else { Write-Host 'prisonconnect-postgres container is not running. Start it (e.g. docker run -d --name prisonconnect-postgres -p 55432:5432 -e POSTGRES_USER=prisonconnect -e POSTGRES_PASSWORD=qOFP25CTtZ1WzxjnEGwrUJuoV0ae93Sg -e POSTGRES_DB=prisonconnect postgres:16) then re-run.' -ForegroundColor Red; exit 1 }

Write-Step '2/6 Detect LAN / hotspot IP'
$lan = $null
$cfg = Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' -and $_.NetAdapter.Name -notmatch 'vEthernet|WSL|Loopback' } | Select-Object -First 1
if ($cfg) { $lan = $cfg.IPv4Address.IPAddress }
if (-not $lan) {
  $lan = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.InterfaceAlias -notmatch 'vEthernet|WSL|Loopback' } | Select-Object -First 1).IPAddress
}
if (-not $lan) { $lan = '192.168.1.100'; Write-Warn "Could not detect LAN IP; using fallback $lan - edit media-server/.env RTC_ANNOUNCED_IP if devices can't connect." }
Write-Ok "LAN IP: $lan"

Write-Step '3/6 Media server (mediasoup, node)'
$env:RTC_ANNOUNCED_IP = $lan
$env:RTC_LISTEN_IP = '0.0.0.0'
$mp = Start-Process node -ArgumentList 'server.js' -WorkingDirectory (Join-Path $repo 'media-server') -RedirectStandardOutput (Join-Path $logRoot 'media.out.log') -RedirectStandardError (Join-Path $logRoot 'media.err.log') -WindowStyle Hidden -PassThru
Write-Ok ('media-server starting (pid ' + $mp.Id + ')')
Start-Sleep -Seconds 3

Write-Step '4/6 Signaling server (socket.io, node)'
$sp = Start-Process node -ArgumentList 'server.js' -WorkingDirectory (Join-Path $repo 'signaling-server') -RedirectStandardOutput (Join-Path $logRoot 'signaling.out.log') -RedirectStandardError (Join-Path $logRoot 'signaling.err.log') -WindowStyle Hidden -PassThru
Write-Ok ('signaling starting (pid ' + $sp.Id + ')')

Write-Step '5/6 Backend (node)'
$bp = Start-Process node -ArgumentList 'server.js' -WorkingDirectory (Join-Path $repo 'backend') -RedirectStandardOutput (Join-Path $logRoot 'backend.out.log') -RedirectStandardError (Join-Path $logRoot 'backend.err.log') -WindowStyle Hidden -PassThru
Write-Ok ('backend starting (pid ' + $bp.Id + ')')

Write-Step '6/6 Family web (vite dev)'
$fp = Start-Process npm.cmd -ArgumentList 'run','dev' -WorkingDirectory (Join-Path $repo 'family-web') -RedirectStandardOutput (Join-Path $logRoot 'family-web.out.log') -RedirectStandardError (Join-Path $logRoot 'family-web.err.log') -WindowStyle Hidden -PassThru
Write-Ok ('family-web starting (pid ' + $fp.Id + ')')

$pids = @($mp.Id, $sp.Id, $bp.Id, $fp.Id)
Set-Content -LiteralPath (Join-Path $env:TEMP 'pc_local_pids.txt') -Value $pids

Write-Host ""
Write-Step 'Waiting for health checks...'
function Wait-Health($name, $url) {
  for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    try { $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { Write-Ok "$name OK ($url)"; return } } catch {}
  }
  Write-Warn "$name not responding at $url - check backend\logs"
}
Wait-Health 'backend'    'http://127.0.0.1:59354/health'
Wait-Health 'signaling'  'http://127.0.0.1:3002/api/health'
Wait-Health 'media'      'http://127.0.0.1:3003/health'

Write-Host ""
Write-Host "############################################################################" -ForegroundColor White
Write-Host "# LOCAL STACK IS RUNNING                                                #" -ForegroundColor White
Write-Host "############################################################################" -ForegroundColor White
Write-Host ""
Write-Host "Family web (open on this PC):  http://127.0.0.1:5173" -ForegroundColor Green
Write-Host "  LAN (phone/hotspot access):  http://$lan`:5173   (http, so WebOTP auto-fill won't work on phone)" -ForegroundColor Green
Write-Host ""
Write-Host "Backend API:   http://127.0.0.1:59354"
Write-Host "Signaling:     http://127.0.0.1:3002"
Write-Host "Media server:  http://127.0.0.1:3003   (RTC announced IP: $lan)"
Write-Host ""
Write-Host "Kiosk APK (local URLs baked): android-kiosk\app\build\outputs\apk\debug\app-debug.apk" -ForegroundColor Yellow
Write-Host "  build with local URLs: gradlew assembleDebug -PAPI_BASE_URL=http://$lan`:59354 -PSIGNALING_URL=http://$lan`:3002"
Write-Host ""
Write-Host "Call link + OTP appear in: backend\logs\sms.jsonl" -ForegroundColor DarkYellow
Write-Host "Server logs: backend\logs\*.out.log / *.err.log"
Write-Host ""
Write-Host "To stop everything: run:  start-local.bat stop" -ForegroundColor DarkGray
Write-Host "Keep this window open (or the TCP listeners alive) while testing." -ForegroundColor DarkGray