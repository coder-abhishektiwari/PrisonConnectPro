# PrisonConnect - .env Configuration Script
# Called by start.bat to write stable URLs to all .env files.
#
# Key idea: the machine has NO router (no port forwarding) and a dynamic
# public IP. All public access goes through tunnels:
#   - TURN          : playit.gg TCP/UDP tunnels (stable hostname)
#   - HTTP/WS       : cloudflared quick tunnels (URL changes per run, but the
#                     backend hands the fresh signaling URL to clients at runtime)
#
# Calls are pure 1-to-1 P2P WebRTC: media flows directly between the kiosk
# and the family browser, so there is no announced-IP / RTC port range to
# configure anymore. TURN is only an ICE connectivity fallback.

param(
    [Parameter(Mandatory=$true)]
    [string]$PublicIP
)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Update-EnvFile {
    param([string]$FilePath, [hashtable]$Pairs)
    $content = ""
    if (Test-Path $FilePath) { $content = Get-Content $FilePath -Raw }
    foreach ($key in $Pairs.Keys) {
        $val = $Pairs[$key]
        if ($content -match "(?m)^$key=") {
            $content = $content -replace "(?m)^$key=.*$", "$key=$val"
        } else {
            $content = $content.TrimEnd() + [Environment]::NewLine + "$key=$val" + [Environment]::NewLine
        }
    }
    Set-Content -Path $FilePath -Value $content -NoNewline
    Write-Host "  [OK] $FilePath"
}

Write-Host ""
Write-Host "[setup-env] Writing stable URLs with PUBLIC_IP=$PublicIP" -ForegroundColor Cyan

# ---- root .env: consumed by docker-compose ----
Update-EnvFile "$Root\.env" @{
    "FAMILY_WEB_URL"   = "http://${PublicIP}:5173"
}

# ---- signaling-server ----
Update-EnvFile "$Root\signaling-server\.env" @{
    "PORT" = "3002"
}

# ---- backend: internal service URLs + public family-web link for SMS ----
Update-EnvFile "$Root\backend\.env" @{
    "SIGNALING_URL"   = "http://127.0.0.1:3002"
    "FAMILY_WEB_URL"  = "http://${PublicIP}:5173"
}

Write-Host "[setup-env] Done." -ForegroundColor Cyan
