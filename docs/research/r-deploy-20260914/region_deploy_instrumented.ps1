& {   # deploy -- paste from this line to the matching closing brace
if ($global:AFRAKALA_FAILED_GATES -is [hashtable] -and $global:AFRAKALA_FAILED_GATES.Count -gt 0) {
  $failedNow = @($global:AFRAKALA_FAILED_GATES.GetEnumerator() | ForEach-Object { "GATE $($_.Key) FAIL $($_.Value)" }) -join ' | '
  Write-Host "NOT RUN: gate(s) FAILED earlier in this shell and have not printed PASS since: $failedNow"
  throw "NOT RUN -- nothing in this region ran. Failed earlier in this shell: $failedNow"
}
$env:GIT_SHA = (git rev-parse --short HEAD)
$env:BUILD_TIME = (Get-Date -Format o)
docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml `
  up -d --no-deps --no-build web
$composeExit = $LASTEXITCODE
Write-Host "COMPOSE EXIT = $composeExit"
if ($composeExit -ne 0) { throw "STOPPED: docker compose up exited $composeExit -- afrakala-lan-rest NOT restarted" }
docker restart afrakala-lan-rest
$restartExit = $LASTEXITCODE
Write-Host "RESTART EXIT = $restartExit"
if ($restartExit -ne 0) { throw "STOPPED: docker restart afrakala-lan-rest exited $restartExit" }
}   # end deploy
