@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  PrisonConnect - Full Stack Launcher
::  Backend stack (postgres, coturn, signaling, backend API)
::  runs in DOCKER CONTAINERS. Only the frontends (vite dev servers)
::  run directly on this machine.
::
::  Calls are pure 1-to-1 P2P WebRTC (no media server):
::   - TURN         : playit.gg tunnels     -> stable hostname
::   - HTTP/WS      : cloudflared quick tunnels (fresh URL per run;
::                    the backend hands it to clients at runtime)
:: ============================================================

title PrisonConnect Launcher

set "ROOT=%~dp0"
set "LOGS=%ROOT%logs"
if not exist "%LOGS%" mkdir "%LOGS%"

echo.
echo  ===================================
echo    P R I S O N C O N N E C T
echo  ===================================
echo    Docker backend + tunnel access
echo  ===================================
echo.

:: ============================================================
::  STEP 1: Check prerequisites
:: ============================================================
echo [1/10] Checking prerequisites...
where node >nul 2>&1
if errorlevel 1 ( echo   [ERROR] Node.js not found & pause & exit /b 1 )
echo   [OK] Node.js
where docker >nul 2>&1
if errorlevel 1 ( echo   [ERROR] Docker not found & pause & exit /b 1 )
echo   [OK] Docker
set "HAS_CF=0"
if exist "%ROOT%cloudflared.exe" set "HAS_CF=1"
if "%HAS_CF%"=="1" ( echo   [OK] cloudflared.exe ) else ( echo   [WARN] cloudflared.exe not found - web tunnels disabled )
set "PLAYIT_EXE=C:\Program Files\playit_gg\bin\playit.exe"
if exist "%PLAYIT_EXE%" ( echo   [OK] playit agent ) else ( echo   [WARN] playit agent not found - media/TURN tunnels must be up manually )
echo.

:: ============================================================
::  STEP 2: Detect public IP
:: ============================================================
echo [2/10] Detecting public IP...
set "PUBLIC_IP="
for /f "delims=" %%i in ('curl -s https://ipinfo.io/ip 2^>nul') do set "PUBLIC_IP=%%i"
if "!PUBLIC_IP!"=="" ( for /f "delims=" %%i in ('curl -s https://ifconfig.me 2^>nul') do set "PUBLIC_IP=%%i" )
if "!PUBLIC_IP!"=="" ( set /p "PUBLIC_IP=  Enter public IP: " )
echo   Public IP: !PUBLIC_IP!
echo.

:: ============================================================
::  STEP 3: Write stable .env values
::  setup-env.ps1 resolves the playit hostname to a STABLE edge IP
::  for WebRTC ICE candidates (survives home IP changes).
:: ============================================================
echo [3/10] Writing stable URLs to .env files...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%setup-env.ps1" -PublicIP "!PUBLIC_IP!"
echo.

:: ============================================================
::  STEP 4: Start Docker Desktop if not running
::  NOTE: "docker info" can succeed while the Linux engine pipe is
::  still initializing, so the compose step later RETRIES on its own.
:: ============================================================
echo [4/10] Checking Docker...
docker info >nul 2>&1
if not errorlevel 1 goto docker_ok
echo   Docker Desktop not running. Starting...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
echo   Waiting for Docker to start (max 120s)...
set /a "WAIT=0"
:docker_wait
ping -n 6 127.0.0.1 >nul
set /a "WAIT+=5"
docker info >nul 2>&1
if not errorlevel 1 goto docker_ok
if !WAIT! lss 120 goto docker_wait
echo   [ERROR] Docker did not start in time
pause & exit /b 1
:docker_ok
echo   [OK] Docker Desktop is running
echo.

:: ============================================================
::  STEP 5: Start infra containers (PostgreSQL + coturn)
:: ============================================================
echo [5/10] Starting Docker containers (postgres, coturn)...
cd /d "%ROOT%"
docker compose up -d postgres coturn
echo   Waiting for PostgreSQL to be ready...
set /a "PGWAIT=0"
:pg_wait
ping -n 3 127.0.0.1 >nul
set /a "PGWAIT+=2"
docker exec prisonconnect-postgres pg_isready -U prisonconnect >nul 2>&1
if not errorlevel 1 goto pg_ok
if !PGWAIT! lss 30 goto pg_wait
echo   [WARN] PostgreSQL not ready yet, continuing anyway
goto pg_done
:pg_ok
echo   [OK] PostgreSQL is ready
:pg_done
echo   [OK] coturn started
echo.

:: ============================================================
::  STEP 6: Detect local server IP
::  Uses the adapter that owns the DEFAULT GATEWAY (the real LAN
::  NIC), so virtual adapters (WSL 172.24.x, VirtualBox 192.168.56.x,
::  Docker) never win.
:: ============================================================
echo [6/10] Detecting local network IP...
set "LOCAL_IP="
for /f "delims=" %%i in ('powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | Select-Object -First 1).IPv4Address.IPAddress" 2^>nul') do if not defined LOCAL_IP set "LOCAL_IP=%%i"
if defined LOCAL_IP goto got_local
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1"') do (
    set "RAW=%%a"
    set "LOCAL_IP=!RAW: =!"
    goto :got_local
)
:got_local
if "!LOCAL_IP!"=="" set "LOCAL_IP=127.0.0.1"
echo   Local IP: !LOCAL_IP!
echo.

:: ============================================================
::  STEP 7: Public tunnels FIRST (signaling + family web)
::  The signaling tunnel URL is written into root .env as
::  SIGNALING_PUBLIC_URL BEFORE the backend container starts,
::  so create-call responses carry a working public URL.
:: ============================================================
echo [7/10] Starting public tunnels (signaling + family web)...

:: Kill stale launcher windows from a previous run (crashed runs leave
:: orphaned cloudflared tunnels holding random URLs).
taskkill /FI "WINDOWTITLE eq Tunnel-Signaling*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Tunnel-FamilyWeb*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Tunnel-WardenDash*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Tunnel-VendorDash*" /F >nul 2>&1

:: Free host ports in case stale processes from an old non-docker run hold them.
echo   Freeing ports 3002/59354 if occupied...
powershell -NoProfile -Command "foreach ($p in 3002,59354) { Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"

:: Best-effort: make sure the playit agent service is running (TURN fallback).
if exist "%PLAYIT_EXE%" (
    "%PLAYIT_EXE%" start >nul 2>&1 && echo   [OK] playit agent started || echo   [INFO] playit agent already running or needs manual start
)

set "TUN_SIGNALING="
set "TUN_FAMILYWEB="
if "%HAS_CF%"=="0" (
    echo   [SKIP] cloudflared.exe not found - no public HTTP tunnels
    goto after_tunnels
)
start "Tunnel-Signaling" /min cmd /c "%ROOT%cloudflared.exe tunnel --url http://127.0.0.1:3002 > "%LOGS%\tun_signaling.log" 2>&1"
echo   [OK] Signaling tunnel starting (port 3002)
start "Tunnel-FamilyWeb" /min cmd /c "%ROOT%cloudflared.exe tunnel --url http://127.0.0.1:5173 > "%LOGS%\tun_familyweb.log" 2>&1"
echo   [OK] Family Web tunnel starting (port 5173)

echo   Waiting 15s for tunnels to come up...
ping -n 16 127.0.0.1 >nul

for /f "delims=" %%u in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%extract-tunnel-url.ps1" -LogFile "%LOGS%\tun_signaling.log"') do set "TUN_SIGNALING=%%u"
for /f "delims=" %%u in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%extract-tunnel-url.ps1" -LogFile "%LOGS%\tun_familyweb.log"') do set "TUN_FAMILYWEB=%%u"

:: Cloudflare's quick-tunnel API sometimes times out ("context deadline
:: exceeded"). Retry extraction, then recreate the tunnel if still nothing.
set /a "SIG_TRIES=0"
:sig_retry
if not "!TUN_SIGNALING!"=="" goto sig_ok
set /a "SIG_TRIES+=1"
if !SIG_TRIES! gtr 3 goto sig_fail
echo   Signaling tunnel URL pending - attempt !SIG_TRIES! of 3, waiting 12s...
ping -n 13 127.0.0.1 >nul
if !SIG_TRIES! geq 3 (
    echo   Recreating signaling tunnel...
    taskkill /FI "WINDOWTITLE eq Tunnel-Signaling*" /F >nul 2>&1
    start "Tunnel-Signaling" /min cmd /c "%ROOT%cloudflared.exe tunnel --url http://127.0.0.1:3002 > "%LOGS%\tun_signaling.log" 2>&1"
    ping -n 16 127.0.0.1 >nul
)
for /f "delims=" %%u in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%extract-tunnel-url.ps1" -LogFile "%LOGS%\tun_signaling.log"') do set "TUN_SIGNALING=%%u"
goto sig_retry
:sig_fail
echo   [WARN] Signaling tunnel could not be created - Cloudflare API unreachable. Kiosk will fall back to LAN signaling.
goto sig_write
:sig_ok
powershell -NoProfile -Command "(Get-Content '%ROOT%.env' -Raw) -replace '(?m)^SIGNALING_PUBLIC_URL=.*$', 'SIGNALING_PUBLIC_URL=!TUN_SIGNALING!' | Set-Content -Path '%ROOT%.env' -NoNewline"
echo   [OK] SIGNALING_PUBLIC_URL=!TUN_SIGNALING!
:sig_write

set /a "FW_TRIES=0"
:fw_retry
if not "!TUN_FAMILYWEB!"=="" goto fw_ok
set /a "FW_TRIES+=1"
if !FW_TRIES! gtr 3 goto fw_fail
echo   Family-web tunnel URL pending - attempt !FW_TRIES! of 3, waiting 12s...
ping -n 13 127.0.0.1 >nul
if !FW_TRIES! geq 3 (
    echo   Recreating family-web tunnel...
    taskkill /FI "WINDOWTITLE eq Tunnel-FamilyWeb*" /F >nul 2>&1
    start "Tunnel-FamilyWeb" /min cmd /c "%ROOT%cloudflared.exe tunnel --url http://127.0.0.1:5173 > "%LOGS%\tun_familyweb.log" 2>&1"
    ping -n 16 127.0.0.1 >nul
)
for /f "delims=" %%u in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%extract-tunnel-url.ps1" -LogFile "%LOGS%\tun_familyweb.log"') do set "TUN_FAMILYWEB=%%u"
goto fw_retry
:fw_fail
echo   [WARN] Family-web tunnel could not be created - SMS links will use the last known URL.
goto fw_write
:fw_ok
powershell -NoProfile -Command "(Get-Content '%ROOT%family-web\.env' -Raw) -replace '(?m)^VITE_SIGNALING_URL=.*$', 'VITE_SIGNALING_URL=!TUN_SIGNALING!' | Set-Content -Path '%ROOT%family-web\.env' -NoNewline"
echo   [OK] family-web VITE_SIGNALING_URL=!TUN_SIGNALING!
:fw_write
:after_tunnels
echo.

:: ============================================================
::  STEP 8: Build & start backend containers
::  (signaling-server, backend API - all in Docker)
::  RETRIES: right after Docker Desktop cold-starts, the Linux
::  engine pipe can lag behind "docker info" succeeding.
:: ============================================================
echo [8/10] Building and starting backend containers (docker compose)...
cd /d "%ROOT%"
set /a "DCOUNT=0"
:dc_up
set /a "DCOUNT+=1"
docker compose up -d --build signaling-server backend > "%LOGS%\compose-up.log" 2>&1
if not errorlevel 1 goto dc_ok
if !DCOUNT! lss 6 (
    echo   [WARN] Docker engine not ready yet - attempt !DCOUNT! of 6, retrying in 12s...
    ping -n 13 127.0.0.1 >nul
    goto dc_up
)
echo   [ERROR] docker compose kept failing. See logs\compose-up.log
goto dc_done
:dc_ok
echo   [OK] Containers built and started
:dc_done

echo   Waiting for services to become healthy...
set /a "MAX=45,R=0"
:bk1
set /a "R+=1"
if !R! geq !MAX! ( echo   [WARN] Backend container timeout & goto sigc1 )
curl -s http://127.0.0.1:59354/health >nul 2>&1
if errorlevel 1 ( ping -n 3 127.0.0.1 >nul & goto bk1 )
echo   [OK] Backend API ready on host port 59354
:sigc1
set /a "R=0"
:sigc2
set /a "R+=1"
if !R! geq !MAX! ( echo   [WARN] Signaling container timeout & goto done1 )
curl -s http://127.0.0.1:3002/api/health >nul 2>&1
if errorlevel 1 ( ping -n 3 127.0.0.1 >nul & goto sigc2 )
echo   [OK] Signaling ready on host port 3002
:done1
echo.

:: ============================================================
::  STEP 9: Staff/vendor tunnels + frontend dev servers (host)
:: ============================================================
echo [9/10] Starting remaining tunnels and frontend dev servers...
set "TUN_WARDENDASH="
set "TUN_VENDORDASH="
if "%HAS_CF%"=="1" (
    start "Tunnel-WardenDash" /min cmd /c "%ROOT%cloudflared.exe tunnel --url http://127.0.0.1:3001 > "%LOGS%\tun_wardendash.log" 2>&1"
    echo   [OK] Warden Dashboard tunnel
    start "Tunnel-VendorDash" /min cmd /c "%ROOT%cloudflared.exe tunnel --url http://127.0.0.1:5174 > "%LOGS%\tun_vendordash.log" 2>&1"
    echo   [OK] Vendor Dashboard tunnel
    ping -n 16 127.0.0.1 >nul
    for /f "delims=" %%u in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%extract-tunnel-url.ps1" -LogFile "%LOGS%\tun_wardendash.log"') do set "TUN_WARDENDASH=%%u"
    for /f "delims=" %%u in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%extract-tunnel-url.ps1" -LogFile "%LOGS%\tun_vendordash.log"') do set "TUN_VENDORDASH=%%u"
    if not "!TUN_WARDENDASH!"=="" (
        powershell -NoProfile -Command "(Get-Content '%ROOT%warden-dashboard\.env' -Raw) -replace '(?m)^VITE_SIGNALING_URL=.*$', 'VITE_SIGNALING_URL=!TUN_WARDENDASH!' | Set-Content -Path '%ROOT%warden-dashboard\.env' -NoNewline"
        echo   [OK] warden-dashboard VITE_SIGNALING_URL=!TUN_WARDENDASH!
    )
    if not "!TUN_VENDORDASH!"=="" (
        powershell -NoProfile -Command "(Get-Content '%ROOT%vendor-dashboard\.env' -Raw) -replace '(?m)^VITE_SIGNALING_URL=.*$', 'VITE_SIGNALING_URL=!TUN_VENDORDASH!' | Set-Content -Path '%ROOT%vendor-dashboard\.env' -NoNewline"
        echo   [OK] vendor-dashboard VITE_SIGNALING_URL=!TUN_VENDORDASH!
    )
)

start "Family-Web" /min cmd /c "cd /d "%ROOT%family-web" && npx vite --port 5173 > "%LOGS%\familyweb_vite.log" 2>&1"
echo   [OK] Family Web (port 5173)
start "Warden-Dashboard" /min cmd /c "cd /d "%ROOT%warden-dashboard" && npx vite --port 3001 > "%LOGS%\wardendash_vite.log" 2>&1"
echo   [OK] Warden Dashboard (port 3001)
start "Vendor-Dashboard" /min cmd /c "cd /d "%ROOT%vendor-dashboard" && npx vite --port 5174 > "%LOGS%\vendordash_vite.log" 2>&1"
echo   [OK] Vendor Dashboard (port 5174)
echo.

:: ============================================================
::  SUMMARY
::  NOTE: no parentheses anywhere inside echo text below - cmd's
::  parser chokes on them inside if/else blocks.
:: ============================================================

timeout /t 3 /nobreak >nul
echo.
echo  =====================================================
echo    S U M M A R Y
echo  =====================================================
echo.
echo  --- Docker Containers - backend stack ---
echo    PostgreSQL .............. localhost:55432  user: prisonconnect
echo    coturn .................. localhost:3478 udp+tcp , 5349 tcp
echo    Signaling Server ........ http://127.0.0.1:3002
echo    Backend API ............. http://127.0.0.1:59354
echo.
echo  --- Android Kiosk Config - build ONCE ---
echo    Same WiFi LAN:
echo      API_BASE_URL=http://!LOCAL_IP!:59354
echo      SIGNALING_URL=http://!LOCAL_IP!:3002   [auto-overridden at runtime]
echo    Anywhere - stable, recommended:
echo      Create ONE playit TCP tunnel to local port 59354, then use:
echo      API_BASE_URL=http://PLAYIT-HOST:PORT   [never changes again]
echo    The signaling URL is delivered by the backend inside every
echo    create-call response - no APK rebuild needed when it changes.
echo.
echo  --- Public URLs ---
if not "!TUN_SIGNALING!"=="" (
    echo    Signaling public ....... !TUN_SIGNALING!
) else (
    echo    Signaling public ....... pending - see logs\tun_signaling.log
)
if not "!TUN_FAMILYWEB!"=="" (
    echo    Family Web ............. !TUN_FAMILYWEB!
) else (
    echo    Family Web ............. http://!PUBLIC_IP!:5173
)
if not "!TUN_WARDENDASH!"=="" (
    echo    Warden Dashboard ....... !TUN_WARDENDASH!
) else (
    echo    Warden Dashboard ....... http://127.0.0.1:3001
)
if not "!TUN_VENDORDASH!"=="" (
    echo    Vendor Dashboard ....... !TUN_VENDORDASH!
) else (
    echo    Vendor Dashboard ....... http://127.0.0.1:5174
)
echo.
echo  --- Local Dev ---
echo    Family Web ............... http://127.0.0.1:5173
echo    Warden Dashboard ......... http://127.0.0.1:3001
echo    Vendor Dashboard ......... http://127.0.0.1:5174
echo.
echo  =====================================================
echo    Calls: pure P2P WebRTC - no media server.
echo    TURN fallback: coturn on ports 3478/5349
echo  =====================================================
echo.
echo  Press any key to stop all servers and containers...
echo.
pause >nul

:: ============================================================
::  CLEANUP
:: ============================================================
echo.
echo  Stopping all servers and containers...
taskkill /FI "WINDOWTITLE eq Tunnel-Signaling*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Tunnel-FamilyWeb*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Tunnel-WardenDash*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Tunnel-VendorDash*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Family-Web*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Warden-Dashboard*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Vendor-Dashboard*" /F >nul 2>&1
cd /d "%ROOT%"
docker compose stop backend signaling-server coturn postgres
echo  All services stopped.
echo.
endlocal