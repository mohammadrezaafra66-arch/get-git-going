# show-ip.ps1
# نمایش IPهای IPv4 فعال لپ‌تاپ برای تنظیم LAN_HOST_IP.

$ErrorActionPreference = "Stop"

Write-Host "=== IPهای فعال این لپ‌تاپ ===" -ForegroundColor Cyan
Write-Host ""

$addrs = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254.*" -and
        $_.PrefixOrigin -ne "WellKnown"
    } |
    Sort-Object InterfaceAlias

if (-not $addrs) {
    Write-Host "هیچ IPv4 فعالی پیدا نشد. آیا کابل LAN یا Wi-Fi وصل است؟" -ForegroundColor Yellow
    exit 1
}

foreach ($a in $addrs) {
    Write-Host ("Interface : {0}" -f $a.InterfaceAlias) -ForegroundColor White
    Write-Host ("IP        : {0}" -f $a.IPAddress) -ForegroundColor Green
    Write-Host ("Prefix    : /{0}" -f $a.PrefixLength)
    Write-Host ""
}

Write-Host "راهنما:" -ForegroundColor Cyan
Write-Host "- IP اینترفیس متصل به شبکه شرکت (LAN/Wi-Fi شرکت) را انتخاب کنید." -ForegroundColor Gray
Write-Host "- معمولاً شبیه 192.168.x.x یا 10.x.x.x است." -ForegroundColor Gray
Write-Host "- این IP را در deploy/lan/.env.lan در متغیرهای LAN_HOST_IP، VITE_SUPABASE_URL،" -ForegroundColor Gray
Write-Host "  SITE_URL، API_EXTERNAL_URL و ADDITIONAL_REDIRECT_URLS جایگزین کنید." -ForegroundColor Gray
Write-Host "- بهتر است IP لپ‌تاپ روی روتر شرکت رزرو (static lease) شود." -ForegroundColor Gray