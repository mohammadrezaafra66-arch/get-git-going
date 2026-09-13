<#
.SYNOPSIS
AfraKala Manual and Auto Backup
.DESCRIPTION
Performs nightly and weekly backups (manual and auto), removes old backups (>90 days),
names files with type/date/manual-or-auto, and starts the bot automatically.
#>

# -------------------------
# Paths
$NightlyPath       = "C:\AfraKalaServer\AfraKalaNightlyBackups"
$WeeklyPath        = "C:\AfraKalaServer\AfraKalaWeeklyHeavyBackups"
$ManualNightlyPath = "D:\AfraKalaNightlyBackups"
$ManualWeeklyPath  = "D:\AfraKalaWeeklyBackups"
$ProjectPath       = "C:\AfraKalaServer\get-git-going01lan"
$BotFilePath       = "$ProjectPath\Start_Bot_FullBackup.bat"
# -------------------------
# Cleanup old backups (>90 days)
# -------------------------
function Cleanup-OldBackups($Path) {
    if (Test-Path $Path) {
        Get-ChildItem $Path -File | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-90) } | Remove-Item -Force
    }
}
Cleanup-OldBackups $NightlyPath
Cleanup-OldBackups $WeeklyPath
Cleanup-OldBackups $ManualNightlyPath
Cleanup-OldBackups $ManualWeeklyPath

# -------------------------
# Backup function
# -------------------------
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
# -------------------------
Backup-All $NightlyPath "NightlyBackup" "Auto"

# -------------------------
# Weekly Auto Backup (جمعه روی C:\)
# -------------------------
if ((Get-Date).DayOfWeek -eq "Friday") {
    Backup-All $WeeklyPath "WeeklyBackup" "Auto"
}

# -------------------------
# Manual Backup check (هارد باید وصل باشد)
# -------------------------
# چک کردن هارد شبانه دستی
if (!(Test-Path $ManualNightlyPath)) {
    Write-Host "hard shabane ra vasl konid, va dobare backup ro ejra konid."
    exit
}

# چک کردن هارد هفتگی دستی
if (!(Test-Path $ManualWeeklyPath)) {
    Write-Host "hard haftegi ra vasl konid, va dobare backup ro ejra konid."
    exit
}
# -------------------------
# Manual Backups
# -------------------------
Backup-All $ManualNightlyPath "NightlyBackup" "Manual"
if ((Get-Date).DayOfWeek -eq "Friday") {
    Backup-All $ManualWeeklyPath "WeeklyBackup" "Manual"
}

# -------------------------
# Start Bot after backup
# -------------------------
if (Test-Path $BotFilePath) {
    Write-Host "Starting AfraKala Bot..."
    Start-Process $BotFilePath
    Write-Host "Bot started successfully."
} else {
    Write-Host "Bot file not found: $BotFilePath"
}

Write-Host "All backups completed successfully."