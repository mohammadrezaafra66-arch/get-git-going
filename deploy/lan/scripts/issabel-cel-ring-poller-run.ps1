# Hidden CEL poller runner — no console window for the user.
# Starts node with CreateNoWindow so child process never flashes a terminal.
# Paths are repo-relative via this script's location (portable across machines).
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..\..")).Path
$poller = Join-Path $scriptDir "issabel-cel-ring-poller.mjs"
$logDir = Join-Path $scriptDir "..\logs"
Set-Location $repoRoot
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Hide this PowerShell window if somehow shown.
Add-Type -Name Win -Namespace Native -MemberDefinition @"
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
"@ -ErrorAction SilentlyContinue
try {
  $hwnd = [Native.Win]::GetConsoleWindow()
  if ($hwnd -ne [IntPtr]::Zero) { [Native.Win]::ShowWindow($hwnd, 0) | Out-Null }
} catch {}

function Start-NodeHidden([string]$scriptPath) {
  $node = (Get-Command node -ErrorAction Stop).Source
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $node
  $psi.Arguments = "`"$scriptPath`""
  $psi.WorkingDirectory = $repoRoot
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  $null = $p.BeginOutputReadLine()
  $null = $p.BeginErrorReadLine()
  $p.WaitForExit()
  return $p.ExitCode
}

while ($true) {
  try {
    $null = Start-NodeHidden $poller
  } catch {}
  Start-Sleep -Seconds 5
}
