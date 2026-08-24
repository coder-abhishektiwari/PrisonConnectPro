# PrisonConnect - Extract clean tunnel URLs from cloudflare logs
param(
    [Parameter(Mandatory=$true)]
    [string]$LogFile,
    [string]$Prefix = "https://"
)

$content = Get-Content $LogFile -Raw -ErrorAction SilentlyContinue
if (-not $content) { return "" }

# Match https://xxxx.trycloudflare.com (ignore surrounding log noise)
if ($content -match "https://[a-zA-Z0-9\-]+\.trycloudflare\.com") {
    return $Matches[0]
}
return ""
