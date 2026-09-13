<#
.SYNOPSIS
AfraKala Manual & Auto Backup
.DESCRIPTION
Backup دستی و اتوماتیک (شبانه و هفتگی) روی سرور لوکال.
پاکسازی فایل‌های قدیمی‌تر از 90 روز.
Sync بکاپ اتوماتیک از C به D قبل از بکاپ دستی.
اجرای Bot بعد از بکاپ.
#>

# Paths
$NightlyPath       = "C:\AfraKalaServer\AfraKalaNightlyBackups"
$WeeklyPath        = "C:\AfraKalaServer\AfraKalaWeeklyHeavyBackups"
$ManualNightlyPath = "D:\AfraKalaNightlyBackups"
$ManualWeeklyPath  = "D:\AfraKalaWeeklyBackups"
$ProjectPath       = "C:\AfraKalaServer\get-git-going01lan"
$BotFilePath       = "$ProjectPath\Start_Bot_FullBackup.bat"

# Cleanup old backups (>90 days)
function Cleanup-OldBackups($Path) {
    if (Test-Path $Path) {
        Get-ChildItem $Path -File |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-90) } |
        Remove-Item -Force
    }
}
Cleanup-OldBackups $NightlyPath
Cleanup-OldBackups $WeeklyPath
Cleanup-OldBackups $ManualNightlyPath
Cleanup-OldBackups $ManualWeeklyPath

# Backup function
function Backup-All($Destination, $Type, $Mode) {
    $Date = Get-Date -Format "yyyyMMdd"
    $FileName = "$Type`_$Date`_$Mode.zip"
    $DestFile = Join-Path $Destination $FileName

    # Backup PostgreSQL DB
    docker exec afrakala-lan-db pg_dump -U postgres -d postgres -Fc -f /tmp/afrakala-db-canonical.dump
    docker cp afrakala-lan-db:/tmp/afrakala-db-canonical.dump "$Destination\afrakala-db-$Date-$Mode.dump"

    # Backup Project Files
    Compress-Archive -Path "$ProjectPath\src","$ProjectPath\deploy" -DestinationPath $DestFile -Force
}

# -------------------------
# Nightly Auto Backup (C:\)
Backup-All $NightlyPath "NightlyBackup" "Auto"

# Weekly Auto Backup (جمعه روی C:\)
if ((Get-Date).DayOfWeek -eq "Friday") {
    Backup-All $WeeklyPath "WeeklyBackup" "Auto"
}

# -------------------------
# Sync Auto backups C: -> D: (Manual)
if (Test-Path $ManualNightlyPath) {
    Get-ChildItem $NightlyPath -File | ForEach-Object {
        $Dest = Join-Path $ManualNightlyPath $_.Name
        if (!(Test-Path $Dest)) { Copy-Item $_.FullName $Dest -Force }
    }
}
if (Test-Path $ManualWeeklyPath) {
    Get-ChildItem $WeeklyPath -File | ForEach-Object {
        $Dest = Join-Path $ManualWeeklyPath $_.Name
        if (!(Test-Path $Dest)) { Copy-Item $_.FullName $Dest -Force }
    }
}

# -------------------------
# Manual Backup (D:\) – check if hdd connected
if (Test-Path $ManualNightlyPath) {
    Backup-All $ManualNightlyPath "NightlyBackup" "Manual"
} else {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        "hard shabane vasl nist. lotfan hards ra vasl konid va dobare backup ro ejra konid.",
        "Warning Backup",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Warning
    )
}

if ((Get-Date).DayOfWeek -eq "Friday") {
    if (Test-Path $ManualWeeklyPath) {
        Backup-All $ManualWeeklyPath "WeeklyBackup" "Manual"
    } else {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show(
            "hard haftegi vasl nist. lotfan hards ra vasl konid va dobare backup ro ejra konid.",
            "Warning Backup",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        )
    }
}

# -------------------------
# Start Bot automatically after backup
if (Test-Path $BotFilePath) {
    Write-Host "Starting AfraKala Bot..."
    Start-Process $BotFilePath
    Write-Host "Bot started successfully."
} else {
    Write-Host "Bot file not found: $BotFilePath"
}

Write-Host "All backups completed successfully."