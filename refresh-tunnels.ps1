# Extracts fresh trycloudflare URLs from tunnel logs and writes them into
# root .env (SIGNALING_PUBLIC_URL) and family-web/.env (VITE_SIGNALING_URL).
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Get-TunnelUrl($logFile) {
    if (-not (Test-Path $logFile)) { return $null }
    foreach ($line in Get-Content $logFile) {
        if ($line -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
            return $Matches[0]
        }
    }
    return $null
}

$sig = Get-TunnelUrl "$root\logs\tun_signaling.log"
$fw  = Get-TunnelUrl "$root\logs\tun_familyweb.log"
Write-Host "SIG=$sig"
Write-Host "FW=$fw"

if ($sig) {
    $envPath = "$root\.env"
    $content = Get-Content $envPath -Raw
    $content = $content -replace '(?m)^SIGNALING_PUBLIC_URL=.*$', "SIGNALING_PUBLIC_URL=$sig"
    Set-Content -Path $envPath -Value $content -NoNewline
    Write-Host "[OK] SIGNALING_PUBLIC_URL updated"
}
if ($fw) {
    $envPath = "$root\family-web\.env"
    $content = Get-Content $envPath -Raw
    $content = $content -replace '(?m)^VITE_SIGNALING_URL=.*$', "VITE_SIGNALING_URL=$fw"
    Set-Content -Path $envPath -Value $content -NoNewline
    Write-Host "[OK] family-web VITE_SIGNALING_URL updated"
}
if (-not $sig -or -not $fw) { exit 1 }