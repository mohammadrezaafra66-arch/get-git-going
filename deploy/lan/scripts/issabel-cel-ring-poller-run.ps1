# Hidden CEL poller runner — no console window for the user.
$ErrorActionPreference = "Stop"
$repoRoot = "D:\AfraKalaTest\app"
$poller = "D:\AfraKalaTest\app\deploy\lan\scripts\issabel-cel-ring-poller.mjs"
Set-Location $repoRoot

# Hide this PowerShell window if somehow shown.
Add-Type -Name Win -Namespace Native -MemberDefinition @"
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
"@ -ErrorAction SilentlyContinue
try {
  $hwnd = [Native.Win]::GetConsoleWindow()
  if ($hwnd -ne [IntPtr]::Zero) { [Native.Win]::ShowWindow($hwnd, 0) | Out-Null }
} catch {}

while ($true) {
  try {
    & node $poller 2>&1 | Out-Null
  } catch {}
  Start-Sleep -Seconds 5
}
