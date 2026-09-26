# نصب عامل capture روی Issabel (Rocky 8)

فقط مالک این دستورها را روی `192.168.170.252` اجرا می‌کند. عامل به PBX وصل نمی‌شود.

## پیش‌نیاز

- Python ۳.۶ / `platform-python` (پیش‌فرض G1)
- سرویس STT روی `http://192.168.170.8:8090` سالم باشد
- توکن `STT_INGEST_TOKEN` (مقدار را اینجا ننویسید)

## ۱) فایروال ویندوز روی ماشین تست — اقدام مالک

عامل این دستور را اجرا نمی‌کند. فقط از `192.168.170.252` و خود ماشین تست به پورت 8090 اجازه بدهید:

```powershell
New-NetFirewallRule -DisplayName "AfraKala-STT-8090-from-PBX" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8090 -RemoteAddress @("192.168.170.252","192.168.170.8")
```

بررسی: `Get-NetFirewallRule -DisplayName "AfraKala-STT-8090-from-PBX"`

## ۲) کپی یک فایل

روی PBX:

```bash
sudo mkdir -p /usr/local/lib/afrakala-stt /etc/afrakala-stt /var/lib/afrakala-stt
sudo cp capture_agent.py /usr/local/lib/afrakala-stt/capture_agent.py
sudo chmod 755 /usr/local/lib/afrakala-stt/capture_agent.py
```

## ۳) پیکربندی

`/etc/afrakala-stt/capture.env`:

```
STT_URL=http://192.168.170.8:8090
STT_INGEST_TOKEN=
```

مقدار توکن را پر کنید. این فایل را در گیت نگذارید.

## ۴) systemd

`/etc/systemd/system/afrakala-stt-capture.service`:

```
[Unit]
Description=AfraKala STT capture agent
After=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/afrakala-stt/capture.env
ExecStart=/usr/libexec/platform-python /usr/local/lib/afrakala-stt/capture_agent.py --watch /var/spool/asterisk/monitor --url ${STT_URL} --token ${STT_INGEST_TOKEN}
Restart=always
RestartSec=3
User=asterisk
Group=asterisk

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now afrakala-stt-capture.service
sudo systemctl status afrakala-stt-capture.service
```

## ۵) توقف و حذف

```bash
sudo systemctl disable --now afrakala-stt-capture.service
sudo rm -f /etc/systemd/system/afrakala-stt-capture.service /usr/local/lib/afrakala-stt/capture_agent.py
sudo systemctl daemon-reload
```

## ۶) CPU زیر ۲٪ یک هسته

آزموده در کانتینر `rockylinux:8` با ۸ فایل در حال tail (G4). روی PBX:

```bash
ps -o pid,pcpu,rss,cmd -C platform-python
# یا:
top -b -n 2 | grep capture_agent
```

هدف: `%CPU` کمتر از ۲ و RSS کمتر از ۵۰ MB.

## وضعیت آزمون دستورها

| دستور | وضعیت |
|---|---|
| اجرای `capture_agent.py` با `platform-python` داخل `rockylinux:8` | در G4 |
| `systemctl` روی PBX واقعی | آزموده نشده — به PBX وصل نشدیم |
| قاعده فایروال ویندوز | آزموده نشده — اقدام مالک؛ عامل اجرا نکرد |
