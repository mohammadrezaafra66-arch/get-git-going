# show-ip.ps1
# Show active IPv4 addresses for LAN_HOST_IP configuration.
# ASCII-only. Compatible with Windows PowerShell 5.1.

$ErrorActionPreference = "Continue"
$defaultIp = "192.168.170.10"

Write-Host "Active IPv4 addresses:"
Write-Host ""

$all = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue
$addrs = @()
foreach ($a in $all) {
    if ($a.IPAddress -like "127.*") { continue }
    if ($a.IPAddress -like "169.254.*") { continue }
    if ($a.PrefixOrigin -eq "WellKnown") { continue }
    $addrs += $a
}

if ($addrs.Count -eq 0) {
    Write-Host "No active IPv4 address found. Check LAN cable or Wi-Fi."
    exit 1
}

$found = $false
foreach ($a in $addrs) {
    $marker = ""
    if ($a.IPAddress -eq $defaultIp) {
        $marker = " [DEFAULT LAN IP]"
        $found = $true
    }
    Write-Host ("Interface: {0}" -f $a.InterfaceAlias)
    Write-Host ("IP       : {0}{1}" -f $a.IPAddress, $marker)
    Write-Host ("Prefix   : /{0}" -f $a.PrefixLength)
    Write-Host ""
}

Write-Host "Hints:"
Write-Host "- Pick the IP connected to the company LAN or Wi-Fi (usually 192.168.x.x or 10.x.x.x)."
Write-Host "- Put this IP into deploy/lan/.env.lan as LAN_HOST_IP, VITE_SUPABASE_URL,"
Write-Host "  SITE_URL, API_EXTERNAL_URL and ADDITIONAL_REDIRECT_URLS."
Write-Host "- It is recommended to reserve this IP as a static lease on the router."
Write-Host ""
Write-Host ("Default suggested IP: {0}" -f $defaultIp)
if (-not $found) {
    Write-Host ("Note: default IP {0} not found on this laptop. You can use one of the IPs above, or set this IP on the router." -f $defaultIp)
}
