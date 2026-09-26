# Downloads STT models onto D:\afrakala-stt\models. No secrets.
$ErrorActionPreference = "Stop"
python D:\AfraKalaTest\wt-call-transcription\docs\missions\call-transcription\download-r3.py
if ($LASTEXITCODE -ne 0) { throw "R3_DOWNLOAD_FAILED exit=$LASTEXITCODE" }
