$ErrorActionPreference = "Stop"

$ProjectRoot = "C:\AfraKalaServer\get-git-going01lan"
$ComposeDir = "$ProjectRoot\deploy\lan"
$BackupRoot = "D:\AfraKalaWeeklyHeavyBackups"

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupDir = Join-Path $BackupRoot "afrakala-heavy-backup-$Stamp"

$DbDir = Join-Path $BackupDir "db"
$StorageDir = Join-Path $BackupDir "storage"
$ConfigDir = Join-Path $BackupDir "config"
$SourceDir = Join-Path $BackupDir "source-snapshot"
$ImagesDir = Join-Path $BackupDir "images"
$LogsDir = Join-Path $BackupDir "logs"

New-Item -ItemType Directory -Force $DbDir,$StorageDir,$ConfigDir,$SourceDir,$ImagesDir,$LogsDir | Out-Null

$Report = Join-Path $BackupDir "HEAVY-BACKUP-REPORT.txt"

function Log($Text) {
  $Text | Add-Content $Report -Encoding UTF8
}

"=== AFRAKALA WEEKLY HEAVY BACKUP ===" | Set-Content $Report -Encoding UTF8
Log "Generated: $(Get-Date)"
Log "Computer: $env:COMPUTERNAME"
Log "User: $env:USERNAME"
Log "BackupDir: $BackupDir"

cd $ComposeDir

Log "`n=== DOCKER STATUS ==="
docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" | Add-Content $Report

Log "`n=== HEALTH CHECKS ==="
curl.exe --max-time 10 -i http://localhost:3000/api/healthz | Add-Content $Report 2>&1
curl.exe --max-time 10 -i http://localhost:8000/auth/v1/settings | Add-Content $Report 2>&1

Log "`n=== COPY CONFIG FILES ==="
$ConfigFiles = @(
  "$ComposeDir\.env.lan",
  "$ComposeDir\docker-compose.yml",
  "$ProjectRoot\AFRAKALA-LAN-FINAL-STATUS-5khordad.txt",
  "$ProjectRoot\start-afrakala-lan.ps1",
  "$ProjectRoot\backup-afrakala-lan.ps1",
  "$ProjectRoot\backup-afrakala-heavy-weekly.ps1",
  "$ProjectRoot\deploy\supabase\volumes\api\kong.yml"
)

foreach ($f in $ConfigFiles) {
  if (Test-Path $f) {
    Copy-Item $f $ConfigDir -Force
    Log "COPIED: $f"
  } else {
    Log "MISSING: $f"
  }
}

Log "`n=== DATABASE BACKUP ==="
docker exec afrakala-lan-db sh -lc "pg_dump -U postgres -d postgres -Fc -f /tmp/afrakala-postgres.dump && pg_dumpall -U postgres --globals-only > /tmp/afrakala-globals.sql && ls -lh /tmp/afrakala-postgres.dump /tmp/afrakala-globals.sql" | Add-Content $Report 2>&1
if ($LASTEXITCODE -ne 0) { throw "Database dump failed" }

docker cp "afrakala-lan-db:/tmp/afrakala-postgres.dump" "$DbDir\afrakala-postgres.dump" | Add-Content $Report 2>&1
if ($LASTEXITCODE -ne 0) { throw "Copy database dump failed" }

docker cp "afrakala-lan-db:/tmp/afrakala-globals.sql" "$DbDir\afrakala-globals.sql" | Add-Content $Report 2>&1
if ($LASTEXITCODE -ne 0) { throw "Copy globals failed" }

docker exec afrakala-lan-db sh -lc "rm -f /tmp/afrakala-postgres.dump /tmp/afrakala-globals.sql" | Out-Null

Log "`n=== DATABASE QUICK COUNTS ==="
docker exec afrakala-lan-db psql -U postgres -d postgres -c "select 'sale_lists' as table_name, count(*) from public.sale_lists union all select 'sale_list_items', count(*) from public.sale_list_items union all select 'sale_list_versions', count(*) from public.sale_list_versions union all select 'products', count(*) from public.products union all select 'categories', count(*) from public.categories union all select 'brands', count(*) from public.brands;" | Add-Content $Report 2>&1

Log "`n=== STORAGE BACKUP ==="
$TempContainer = "afra-heavy-storage-backup"

$ExistingTemp = docker ps -a --format "{{.Names}}" | Where-Object { $_ -eq $TempContainer }
if ($ExistingTemp) {
  docker rm -f $TempContainer | Add-Content $Report 2>&1
}

docker create --name $TempContainer -v afrakala-lan_lan-storage-data:/data:ro supabase/postgres:15.6.1.139 bash -lc "tar czf /tmp/afrakala-storage.tgz -C /data . && ls -lh /tmp/afrakala-storage.tgz" | Add-Content $Report 2>&1
if ($LASTEXITCODE -ne 0) { throw "Create temp storage container failed" }

docker start -a $TempContainer | Add-Content $Report 2>&1
if ($LASTEXITCODE -ne 0) { throw "Start temp storage container failed" }

docker cp "${TempContainer}:/tmp/afrakala-storage.tgz" "$StorageDir\afrakala-storage.tgz" | Add-Content $Report 2>&1
if ($LASTEXITCODE -ne 0) { throw "Copy storage backup failed" }

docker rm -f $TempContainer | Add-Content $Report 2>&1

Log "`n=== DOCKER IMAGES SAVE ==="
$ImagesTar = "$ImagesDir\afrakala-lan-images.tar"

$ImageList = @(
  "afrakala-app:lan",
  "kong:2.8.1",
  "supabase/postgres:15.6.1.139",
  "supabase/storage-api:v1.11.13",
  "supabase/gotrue:v2.158.1",
  "supabase/postgres-meta:v0.84.2",
  "postgrest/postgrest:v12.2.0"
)

foreach ($img in $ImageList) {
  docker image inspect $img | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Missing Docker image: $img"
  }
  Log "IMAGE OK: $img"
}

docker save -o $ImagesTar $ImageList | Add-Content $Report 2>&1
if ($LASTEXITCODE -ne 0) { throw "Docker image save failed" }

Get-Item $ImagesTar | Select-Object FullName,Length,LastWriteTime | Format-List | Out-String | Add-Content $Report

Log "`n=== SOURCE SNAPSHOT ==="
robocopy $ProjectRoot $SourceDir /MIR /XD node_modules dist .output .vinxi .git _runtime-backup-5khordad /XF *.log | Add-Content $Report 2>&1
$RoboCode = $LASTEXITCODE
if ($RoboCode -le 7) {
  Log "ROBOCOPY OK WITH CODE: $RoboCode"
  $global:LASTEXITCODE = 0
} else {
  throw "Robocopy failed with code $RoboCode"
}

Log "`n=== DOCKER INSPECT ==="
docker inspect afrakala-lan-web afrakala-lan-kong afrakala-lan-auth afrakala-lan-rest afrakala-lan-storage afrakala-lan-meta afrakala-lan-db | Out-File "$LogsDir\docker-inspect.json" -Encoding UTF8

Log "`n=== DOCKER IMAGES LIST ==="
docker images | Out-File "$LogsDir\docker-images.txt" -Encoding UTF8

Log "`n=== FILE HASHES ==="
$HashFile = "$BackupDir\SHA256SUMS.csv"
$TempHashFile = "$BackupDir\SHA256SUMS.tmp.csv"

if (Test-Path $HashFile) {
  Remove-Item $HashFile -Force
}
if (Test-Path $TempHashFile) {
  Remove-Item $TempHashFile -Force
}

Get-ChildItem $BackupDir -Recurse -File |
  Where-Object {
    $_.FullName -ne $HashFile -and
    $_.FullName -ne $TempHashFile
  } |
  Get-FileHash -Algorithm SHA256 |
  Select-Object Path,Hash |
  Export-Csv $TempHashFile -NoTypeInformation -Encoding UTF8

Move-Item $TempHashFile $HashFile -Force

Log "`n=== BACKUP SIZE ==="
$Size = (Get-ChildItem $BackupDir -Recurse -Force | Measure-Object Length -Sum).Sum
Log "SizeGB: $([math]::Round($Size / 1GB, 3))"
Log "SizeMB: $([math]::Round($Size / 1MB, 2))"

Log "`n=== VALIDATION ==="
$RequiredFiles = @(
  "$DbDir\afrakala-postgres.dump",
  "$DbDir\afrakala-globals.sql",
  "$StorageDir\afrakala-storage.tgz",
  "$ImagesDir\afrakala-lan-images.tar",
  "$ConfigDir\.env.lan",
  "$ConfigDir\docker-compose.yml",
  "$LogsDir\docker-inspect.json",
  "$LogsDir\docker-images.txt",
  "$BackupDir\SHA256SUMS.csv"
)

foreach ($rf in $RequiredFiles) {
  if (!(Test-Path $rf)) {
    throw "Missing required heavy backup file: $rf"
  }
  $item = Get-Item $rf
  if ($item.Length -eq 0) {
    throw "Heavy backup file is empty: $rf"
  }
  Log "OK: $rf ($($item.Length) bytes)"
}

Log "`n=== RETENTION CLEANUP ==="
$RetentionDays = 90
Get-ChildItem $BackupRoot -Directory -Filter "afrakala-heavy-backup-*" |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
  ForEach-Object {
    Log "Deleting old heavy backup: $($_.FullName)"
    Remove-Item $_.FullName -Recurse -Force
  }

Log "`n=== HEAVY BACKUP DONE ==="

Write-Host "HEAVY BACKUP DONE:"
Write-Host $BackupDir

