# Pass 1: raw GET of every route, no session (the server never reads one).
import json, os, re, time, urllib.request, urllib.error, html as H
from common import *

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None
opener = urllib.request.build_opener(NoRedirect)

out = open(os.path.join(SP, "pass1.jsonl"), "w", encoding="utf-8")
for route in load("fullpaths.txt"):
    rec = {"route": route}
    if route in NOT_EXERCISED:
        rec.update(verdict="NOT EXERCISED", reason=NOT_EXERCISED[route])
        out.write(json.dumps(rec, ensure_ascii=False) + "\n"); continue
    url = ORIGIN + concrete(route)
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "afrakala-postdeploy-sweep/ro"})
    t0 = time.time()
    try:
        r = opener.open(req, timeout=30); status = r.status; body = r.read(); hdr = dict(r.headers)
    except urllib.error.HTTPError as e:
        status = e.code; body = e.read(); hdr = dict(e.headers)
    except Exception as e:
        status = 0; body = str(e).encode(); hdr = {}
    ms = int((time.time() - t0) * 1000)
    text = body.decode("utf-8", "replace")
    rc = [m for m in re.finditer(r"__APP_RUNTIME_CONFIG__\s*=\s*(\{.*?\})\s*;?\s*</script>", text)]
    cfg_url = None
    if rc:
        try: cfg_url = json.loads(rc[0].group(1)).get("supabaseUrl")
        except Exception: cfg_url = "unparseable"
    visible = re.sub(r"<script.*?</script>|<style.*?</style>", " ", text, flags=re.S)
    visible = H.unescape(re.sub(r"<[^>]+>", " ", visible))
    visible = re.sub(r"\s+", " ", visible).strip()
    rec.update(
        url=concrete(route), status=status, ms=ms, bytes=len(body),
        ctype=hdr.get("Content-Type") or hdr.get("content-type"), location=hdr.get("Location") or hdr.get("location"),
        rc_count=text.count("__APP_RUNTIME_CONFIG__ ="), rc_count_any=len(re.findall(r"__APP_RUNTIME_CONFIG__", text)),
        rc_supabase=cfg_url,
        amber=("محیط تست" in text) or ("bg-amber-100" in text and "data-environment" in text),
        red=("هشدار ایمنی" in text) or ("bg-red-600" in text and "data-environment" in text),
        errors=[p for p in ERROR_PATTERNS if p in visible],
        latin=len(LATIN.findall(visible)), persian=len(PERSIAN.findall(visible)),
        text=visible[:400],
    )
    out.write(json.dumps(rec, ensure_ascii=False) + "\n"); out.flush()
out.close()
print("pass1 done")
