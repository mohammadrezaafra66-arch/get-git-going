# Issabel live caller-ID — AMI listener setup

## Why two paths?

| Path | Needs | Latency |
|------|--------|---------|
| **CEL poller** (`issabel-cel-ring-poller.mjs`) | Existing `ISSABEL_CDR_*` MySQL RO user | ~1s after queue **or** direct IVR→ext ring |
| **AMI listener** (`issabel-ami-listener.mjs`) | AMI user + secret + `permit=` for app host | Sub-second push |

CEL is measured working on this PBX today:
- queue: `CHAN_START` `from-trunk` then `Local/EXT@from-queue`
- direct (IVR→ext): `CHAN_START` `from-trunk` then `SIP|PJSIP/EXT-…` in `from-internal` with the same `linkedid`

AMI is the preferred end-state once credentials exist. Both POST to the same hook: `POST /api/public/hooks/issabel-ami-ring`.

## Create a read-only AMI user on Issabel

1. SSH to the PBX (`192.168.170.252`) or use Asterisk Manager settings in the Issabel UI.
2. Add to `/etc/asterisk/manager.conf` (or FreePBX *Settings → Asterisk Manager Users*):

```ini
[afrakala_ami]
secret = <generate-a-long-random-secret>
deny = 0.0.0.0/0.0.0.0
permit = 192.168.170.8/255.255.255.255
read = system,call,log,verbose,agent,user,dtmf,reporting,cdr,dialplan
write =
```

3. Reload: `asterisk -rx "manager reload"` (or Apply Config in FreePBX).
4. On the app host, set in `deploy/lan/.env.lan` (never commit):

```env
ISSABEL_AMI_HOST=192.168.170.252
ISSABEL_AMI_PORT=5038
ISSABEL_AMI_USER=afrakala_ami
ISSABEL_AMI_SECRET=<same-secret>
```

5. Register the listener:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\register-issabel-ami-listener-task.ps1
```

## CEL poller (works without AMI) — hidden, low resource

Register once as Administrator (no visible console):

```powershell
powershell -ExecutionPolicy Bypass -File "D:\AfraKalaTest\app\deploy\lan\scripts\register-issabel-cel-ring-task.ps1"
```

- Task name: `AfraKala-IssabelCelRing` (Hidden)
- Runs `node` directly; lock file prevents duplicate instances
- Poll interval 2s; only mapped extensions (`403`, `412`, …) are posted
- Supports **inbound** (queue ring + direct IVR→extension) and **outbound** (extension dials out)
- Offline proof: `node deploy/lan/scripts/issabel-cel-ring-replay-test.mjs`
- Logs only: `deploy/lan/logs/issabel-cel-ring.log` — no user-facing terminal

## Mapping

Only extensions present in `/admin/call-extensions` (`call_log_extensions`) produce popup rows. Queue members that are not mapped are ignored at ingest.
