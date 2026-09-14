& {   # GATE TAR -- paste from this line to the matching closing brace
if ($global:AFRAKALA_FAILED_GATES -is [hashtable] -and $global:AFRAKALA_FAILED_GATES.Count -gt 0) {
  $failedNow = @($global:AFRAKALA_FAILED_GATES.GetEnumerator() | ForEach-Object { "GATE $($_.Key) FAIL $($_.Value)" }) -join ' | '
  Write-Host "NOT RUN: gate(s) FAILED earlier in this shell and have not printed PASS since: $failedNow"
  throw "NOT RUN -- nothing in this region ran. Failed earlier in this shell: $failedNow"
}
if ($global:AFRAKALA_FAILED_GATES -isnot [hashtable]) { $global:AFRAKALA_FAILED_GATES = @{} }
$share  = '\\192.168.170.8\dumps\release-20260914'
$local  = 'C:\afrakala-release\20260914'
$file   = 'afrakala-app-a935be0b.tar.gz'
$expect = 'f9e6af1eaa61f4062249f220a49f848f8e6d517fef39201067f63ac64d4a7d73'
try {
      Write-Host 'NOTE TAR: copy step SKIPPED -- the tarball and .sha256 were hand-copied to C:\afrakala-release\20260914 by the operator (share copy threw Invalid Signature); .sha256 read LOCALLY'
  $side = ((Get-Content -LiteralPath (Join-Path $local ($file + '.sha256')) -Raw -ErrorAction Stop).Trim() -split '\s+')[0].ToLower()
  $got = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $local $file) -ErrorAction Stop).Hash.ToLower()
} catch {
  $gateWhy = "could not copy or hash the tarball: $($_.Exception.Message)"
  Write-Host "GATE TAR FAIL $gateWhy"
  $global:AFRAKALA_FAILED_GATES['TAR'] = $gateWhy; throw "STOPPED at gate TAR: $gateWhy -- nothing after it in this region ran; this shell is still open"
}
if ($side -cne $expect) {
  $gateWhy = "the .sha256 on the share says $side, this document says $expect"
  Write-Host "GATE TAR FAIL $gateWhy"
  $global:AFRAKALA_FAILED_GATES['TAR'] = $gateWhy; throw "STOPPED at gate TAR: $gateWhy -- nothing after it in this region ran; this shell is still open"
}
if ($got -cne $expect) {
  $gateWhy = "the copied tarball hashes to $got, expected $expect"
  Write-Host "GATE TAR FAIL $gateWhy"
  $global:AFRAKALA_FAILED_GATES['TAR'] = $gateWhy; throw "STOPPED at gate TAR: $gateWhy -- nothing after it in this region ran; this shell is still open"
}
Write-Host "OK TAR: $local\$file sha256 $got"
$global:AFRAKALA_FAILED_GATES.Remove('TAR')
Write-Host "GATE TAR PASS"
}   # end GATE TAR
