# show-ip.ps1
# نمایش IPهای IPv4 فعال لپ‌تاپ برای تنظیم LAN_HOST_IP.
# سازگار با Windows PowerShell 5.1.

$ErrorActionPreference = "Continue"
$targetIp = "192.168.170.10"

Write-Host "=== IPهای فعال این لپ‌تاپ ===" -ForegroundColor Cyan
Write-Host ""

$all = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue
$addrs = @()
foreach ($a in $all) {
    $ip = $a.IPAddress
    if ($ip -like "127.*") { continue }
    if ($ip -like "169.254.*") { continue }
    if ($a.PrefixOrigin -eq "WellKnown") { continue }
    $addrs += $a
}

if ($addrs.Count -eq 0) {
    Write-Host "هیچ IPv4 فعالی پیدا نشد. آیا کابل LAN یا Wi-Fi وصل است؟" -ForegroundColor Yellow
    exit 1
}

$found = $false
foreach ($a in $addrs) {
    $marker = ""
    if ($a.IPAddress -eq $targetIp) {
        $marker = "  <-- LAN_HOST_IP پیش‌فرض"
        $found = $true
    }
    Write-Host ("Interface : {0}" -f $a.InterfaceAlias) -ForegroundColor White
    if ($marker) {
        Write-Host ("IP        : {0}{1}" -f $a.IPAddress, $marker) -ForegroundColor Green
    } else {
        Write-Host ("IP        : {0}" -f $a.IPAddress) -ForegroundColor Green
    }
    Write-Host ("Prefix    : /{0}" -f $a.PrefixLength)
    Write-Host ""
}

Write-Host "راهنما:" -ForegroundColor Cyan
Write-Host "- IP اینترفیس متصل به شبکه شرکت (LAN/Wi-Fi شرکت) را انتخاب کنید." -ForegroundColor Gray
Write-Host "- معمولا شبیه 192.168.x.x یا 10.x.x.x است." -ForegroundColor Gray
Write-Host "- این IP را در deploy/lan/.env.lan در LAN_HOST_IP, VITE_SUPABASE_URL," -ForegroundColor Gray
Write-Host "  SITE_URL, API_EXTERNAL_URL و ADDITIONAL_REDIRECT_URLS جایگزین کنید." -ForegroundColor Gray
Write-Host "- بهتر است IP لپ‌تاپ روی روتر شرکت رزرو (static lease) شود." -ForegroundColor Gray

if (-not $found) {
    Write-Host ""
    Write-Host ("توجه: IP پیش‌فرض {0} روی این لپ‌تاپ پیدا نشد." -f $targetIp) -ForegroundColor Yellow
    Write-Host "می‌توانید IP فعلی بالا را استفاده کنید، یا روی روتر آن را به این مقدار تغییر دهید." -ForegroundColor Yellow
}
