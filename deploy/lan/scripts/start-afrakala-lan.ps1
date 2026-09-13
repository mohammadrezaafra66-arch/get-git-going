Start-Sleep -Seconds 45
cd "C:\AfraKalaServer\get-git-going01lan\deploy\lan"
docker compose --env-file .env.lan up -d
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | Out-File "C:\AfraKalaServer\get-git-going01lan\last-autostart-status.txt" -Encoding UTF8
