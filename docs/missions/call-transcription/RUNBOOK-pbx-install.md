# نصب عامل capture روی Issabel (Rocky 8)

فقط مالک این دستورها را روی `192.168.170.252` اجرا می‌کند. عامل به PBX وصل نمی‌شود.

توکن را در این فایل ننویسید. مقدار `STT_INGEST_TOKEN` روی ماشین تست در این مسیر است (فقط نام متغیر اینجا آمده):

`D:\afrakala-stt\.env`

خط `STT_INGEST_TOKEN=` را آنجا بخوانید و روی PBX در `EnvironmentFile` بگذارید. مقدار را در گیت، لاگ، یا خط فرمان نگذارید.

## پیش‌نیاز

- Python ۳.۶ / `platform-python` (پیش‌فرض G1)
- سرویس STT روی ماشین تست باید **ready** باشد

## ۰) پیش‌پرواز سلامت STT — روی PBX

قبل از `systemctl start` این باید کلمهٔ `ready` را برگرداند:

```bash
curl -s http://192.168.170.8:8090/health
```

اگر خروجی `not-ready` است، مدل‌ها هنوز load نشده‌اند. صبر کنید و دوباره بزنید. تا `status` برابر `ready` نشود سرویس capture را روشن نکنید.

وضعیت آزمون: آزموده نشده — به PBX وصل نشدیم؛ همان `curl` از ماشین تست (`192.168.170.8`) `ready` را بعد از preload برگرداند.

## ۱) فایروال ویندوز روی ماشین تست — اقدام مالک

عامل این دستور را اجرا نمی‌کند. فقط از `192.168.170.252` و خود ماشین تست به پورت 8090 اجازه بدهید:

```powershell
New-NetFirewallRule -DisplayName "AfraKala-STT-8090-from-PBX" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8090 -RemoteAddress @("192.168.170.252","192.168.170.8")
```

بررسی: `Get-NetFirewallRule -DisplayName "AfraKala-STT-8090-from-PBX"`

وضعیت آزمون: آزموده نشده — اقدام مالک؛ عامل اجرا نکرد.

## ۲) کپی فایل از ماشین تست به PBX

روی **ماشین تست** (PowerShell)، از worktree:

```powershell
scp D:\AfraKalaTest\wt-call-transcription\deploy\stt\capture-agent\capture_agent.py root@192.168.170.252:/tmp/capture_agent.py
```

روی **PBX**:

```bash
sudo mkdir -p /usr/local/lib/afrakala-stt /etc/afrakala-stt /var/lib/afrakala-stt /var/lib/afrakala-stt/spool
sudo cp /tmp/capture_agent.py /usr/local/lib/afrakala-stt/capture_agent.py
sudo chmod 755 /usr/local/lib/afrakala-stt/capture_agent.py
sudo chown -R asterisk:asterisk /var/lib/afrakala-stt
```

`chown` برای دایرکتوری افست/اسپول اجباری است. بدون آن کاربر `asterisk` نمی‌تواند `offsets.json` بنویسد.

وضعیت آزمون: `chown` + نوشتن افست در `rockylinux:8` آزموده شد. `scp` به `.252` آزموده نشده — به PBX وصل نشدیم.

## ۳) پیکربندی

`/etc/afrakala-stt/capture.env` (این فایل را در گیت نگذارید):

```
STT_URL=http://192.168.170.8:8090
STT_INGEST_TOKEN=
STT_STATE=/var/lib/afrakala-stt/offsets.json
STT_SPOOL=/var/lib/afrakala-stt/spool
```

مقدار توکن را از `D:\afrakala-stt\.env` روی ماشین تست کپی کنید. در `ExecStart` نگذارید.

## ۴) systemd — توکن روی خط فرمان نیست

`/etc/systemd/system/afrakala-stt-capture.service`:

```
[Unit]
Description=AfraKala STT capture agent
After=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/afrakala-stt/capture.env
ExecStart=/usr/libexec/platform-python /usr/local/lib/afrakala-stt/capture_agent.py --watch /var/spool/asterisk/monitor --url ${STT_URL}
Restart=always
RestartSec=3
User=asterisk
Group=asterisk

[Install]
WantedBy=multi-user.target
```

`ExecStart` عمداً `--token` ندارد. عامل `STT_INGEST_TOKEN` را از محیط می‌خواند تا در `ps` دیده نشود.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now afrakala-stt-capture.service
sudo systemctl status afrakala-stt-capture.service
tr '\0' ' ' < /proc/$(pidof -s platform-python)/cmdline ; echo
ps -o pid,pcpu,rss,cmd -C platform-python
```

در خروجی `ps` / `cmdline` نباید مقدار توکن دیده شود.

وضعیت آزمون: اجرای مستقیم عامل با `STT_INGEST_TOKEN` در محیط و بدون `--token` داخل `rockylinux:8` آزموده شد؛ `cmdline` توکن نداشت. `systemctl` روی PBX واقعی آزموده نشده — به PBX وصل نشدیم.

## ۵) یک تماس واقعی — اقدام مالک

1. یک تماس خارجی کوتاه از داخلی mapped (مثلاً `403`) بگیرید و قطع کنید.
2. روی ماشین تست:

```powershell
curl.exe -s http://192.168.170.8:8090/health
```

باید `ready` باشد.

3. در Postgres تست، ردیف `call_transcript_sessions` با `recording_uniqueid` همان فایل باید ظاهر شود؛ قطعهٔ زنده در حین تماس و `kind=final` بعد از بستن فایل.

وضعیت آزمون: آزموده نشده — تماس واقعی روی Issabel خارج از دامنهٔ این مأموریت است (به `.252` وصل نشدیم). مسیر معادل با شبیه‌ساز WAV روی ماشین تست آزموده شد.

## ۶) CPU زیر ۲٪ یک هسته

روی PBX:

```bash
ps -o pid,pcpu,rss,cmd -C platform-python
# یا:
top -b -n 2 | grep capture_agent
```

هدف: `%CPU` کمتر از ۲ و RSS کمتر از ۵۰ MB با ۸ فایل در حال tail.

وضعیت آزمون: در `rockylinux:8` با ۸ فایل اندازه‌گیری شد (اعداد در `REPORT.md` / evidence A9). روی PBX واقعی آزموده نشده.

## ۷) توقف، حذف، بازگشت

توقف موقت:

```bash
sudo systemctl stop afrakala-stt-capture.service
```

حذف کامل (rollback):

```bash
sudo systemctl disable --now afrakala-stt-capture.service
sudo rm -f /etc/systemd/system/afrakala-stt-capture.service
sudo rm -f /usr/local/lib/afrakala-stt/capture_agent.py /tmp/capture_agent.py
sudo rm -rf /etc/afrakala-stt /var/lib/afrakala-stt /usr/local/lib/afrakala-stt
sudo systemctl daemon-reload
```

بعد از rollback:

- فایل‌های WAV ایزابل دست‌نخورده می‌مانند (عامل فقط می‌خواند).
- جداول `call_transcript_*` روی DB تست می‌مانند تا مالک تصمیم بگیرد.
- سرویس STT روی `192.168.170.8:8090` جدا است؛ برای خاموش کردنش روی ماشین تست: `docker stop afrakala-stt`.

وضعیت آزمون: دستورهای `rm`/`stop` معادل در کانتینر Rocky روی فایل عامل آزموده شد. `systemctl disable` روی PBX آزموده نشده — به PBX وصل نشدیم.

## وضعیت آزمون دستورها

| دستور | وضعیت |
|---|---|
| `platform-python --version` داخل `rockylinux:8` | آزموده |
| اجرای `capture_agent.py` بدون `--token` (فقط env) | آزموده |
| `tr '\\0' ' ' < /proc/$PID/cmdline` بدون مقدار توکن | آزموده |
| `chown -R asterisk:asterisk /var/lib/afrakala-stt` و نوشتن `offsets.json` | آزموده |
| ۸ فایل در حال tail؛ `%CPU` و RSS عددی | آزموده |
| `curl -s http://192.168.170.8:8090/health` از ماشین تست | آزموده |
| `scp` از worktree به `.252` | آزموده نشده — به PBX وصل نشدیم |
| `systemctl` روی PBX واقعی | آزموده نشده — به PBX وصل نشدیم |
| قاعده فایروال ویندوز | آزموده نشده — اقدام مالک؛ عامل اجرا نکرد |
| یک تماس واقعی Issabel | آزموده نشده — به PBX وصل نشدیم |
