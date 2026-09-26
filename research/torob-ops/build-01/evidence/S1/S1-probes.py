"""Notify + sales PATCH/DELETE probes. Writes statuses only. No tokens."""

from __future__ import annotations

import json
import os
import pathlib
import urllib.error
import urllib.request

ENV = pathlib.Path(r"D:\AfraKalaTest\app\deploy\lan\.env.lan")
OUT = pathlib.Path(r"D:\AfraKalaTest\research\torob-ops\build-01\evidence\S1\S1-probes.out.txt")

vals = {}
for line in ENV.read_text(encoding="utf-8").splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        vals[k.strip()] = v.strip().strip('"')

anon = vals.get("ANON_KEY") or vals.get("SUPABASE_ANON_KEY") or vals.get("VITE_SUPABASE_PUBLISHABLE_KEY")
kong = "http://192.168.170.8:9000"
lines = []


def req(method: str, url: str, headers: dict, body=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    r = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


# login sales
status, raw = req(
    "POST",
    kong + "/auth/v1/token?grant_type=password",
    {"apikey": anon, "Content-Type": "application/json"},
    {"email": "test.sales@afrakala.local", "password": "AfraTest!1404"},
)
lines.append(f"sales_login_http={status}")
token = None
if status == 200:
    token = json.loads(raw.decode("utf-8")).get("access_token")
    lines.append("sales_login=ok")
else:
    lines.append("sales_login=fail")

if token:
    h = {
        "apikey": anon,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    st, body = req(
        "PATCH",
        kong + "/rest/v1/torob_ops_findings?id=eq.00000000-0000-0000-0000-000000000001",
        h,
        {"status": "reported"},
    )
    lines.append(f"sales_patch_findings={st}")
    snippet = body.decode("utf-8", "replace")[:180]
    lines.append(f"sales_patch_body={snippet}")
    st, body = req(
        "DELETE",
        kong + "/rest/v1/torob_ops_sessions?id=eq.00000000-0000-0000-0000-000000000001",
        h,
    )
    lines.append(f"sales_delete_sessions={st}")
    st, body = req(
        "DELETE",
        kong + "/rest/v1/torob_ops_report_logs?id=eq.00000000-0000-0000-0000-000000000001",
        h,
    )
    lines.append(f"sales_delete_report_logs={st}")

OUT.write_text("\n".join(lines) + "\n", encoding="ascii")
print("WROTE", OUT)
print("\n".join(lines))
