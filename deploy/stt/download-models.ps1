# Downloads STT models onto D:\afrakala-stt\models. No secrets.
$ErrorActionPreference = "Stop"
$models = "D:\afrakala-stt\models"
New-Item -ItemType Directory -Force -Path $models | Out-Null

$voskZip = Join-Path $models "vosk-model-fa-0.42.zip"
$voskDir = Join-Path $models "vosk-model-fa-0.42"
$voskUrl = "https://alphacephei.com/vosk/models/vosk-model-fa-0.42.zip"

if (-not (Test-Path (Join-Path $voskDir "am"))) {
  Write-Host "DOWNLOAD $voskUrl"
  curl.exe -L --fail --retry 3 -o $voskZip $voskUrl
  if ($LASTEXITCODE -ne 0) { throw "VOSK_DOWNLOAD_FAILED $voskUrl exit=$LASTEXITCODE" }
  Write-Host "UNZIP vosk-model-fa-0.42"
  Expand-Archive -Path $voskZip -DestinationPath $models -Force
}

Write-Host "VOSK_OK"

# Whisper CTranslate2 snapshot (after Vosk — do not run two large downloads at once)
$whisperDir = Join-Path $models "farsi-faster-whisper-large-v3"
$whisperCfg = Join-Path $whisperDir "config.json"
if (-not (Test-Path $whisperCfg)) {
  New-Item -ItemType Directory -Force -Path $whisperDir | Out-Null
  Write-Host "DOWNLOAD whisper snapshot index"
  curl.exe -L --fail --retry 3 -o (Join-Path $whisperDir "config.json") "https://huggingface.co/oi-uae/farsi-faster-whisper-large-v3/resolve/main/config.json"
  if ($LASTEXITCODE -ne 0) { throw "WHISPER_CONFIG_FAILED" }
}
Write-Host "WHISPER_CONFIG_OK"
