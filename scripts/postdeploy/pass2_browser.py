# Pass 2: headless Chromium with the minted session. READ-ONLY GUARD:
#  - every request that is not GET/HEAD is aborted before it leaves the browser
#  - every request to a host other than 192.168.170.10:3000/:8000 is aborted
#  - navigator.sendBeacon is disabled; service workers blocked
# Aborted requests are logged (method + host + path, never headers or bodies).
import asyncio, json, os, re, sys, time
def red(t):
    t = re.sub(r"eyJ[\w-]+\.[\w-]+\.[\w-]+", "<jwt-redacted>", t)
    t = re.sub(r"(apikey=)[^&\s'\"]+", r"<redacted>", t)
    t = re.sub(r"(id|product_id)=in\.[^&\s'\"]{120,}", r"=in.(<long uuid list>)", t)
    return t if len(t) < 700 else t[:350] + " ... " + t[-300:]
from urllib.parse import urlsplit
from playwright.async_api import async_playwright
from common import *

STATE = r"C:\Users\AFRAKA~1\AppData\Local\Temp\afrakala-postdeploy-session.json"
ALLOWED_HOSTS = {"192.168.170.10:3000", "192.168.170.10:8000"}
# /public/sale-lists/$listId: with a session its loader calls refresh_sale_list_prices (a writer).
SKIP_BROWSER = {"/public/sale-lists/$listId"}
BROWSER_A = ["/", "/login", "/register", "/reset-password", "/pending-approval", "/unauthorized", "/.lovable/oauth/consent"]
CONC = int(os.environ.get("CONC", "3"))

only = sys.argv[1:]  # optional subset
routes = only or (BROWSER_A + load("B.txt"))
done = set()
outp = os.path.join(SP, os.environ.get("OUT","pass2.jsonl"))
if os.path.exists(outp) and not only:
    for l in open(outp, encoding="utf-8"):
        done.add(json.loads(l)["route"])
out = open(outp, "a", encoding="utf-8")
os.makedirs(os.path.join(SP, "text"), exist_ok=True)

EXTRACT = """() => {
  const main = document.querySelector('main');
  const banner = document.querySelector('[role=alert][data-environment]');
  const body = document.body ? document.body.innerText : '';
  return {
    title: document.title,
    main: main ? main.innerText : null,
    body,
    banner: banner ? {cls: banner.className, env: banner.getAttribute('data-environment'), text: banner.innerText} : null,
    amberAny: !!document.querySelector('.bg-amber-100[role=alert]'),
    redAny: !!document.querySelector('.bg-red-600[role=alert]'),
    rcType: typeof window.__APP_RUNTIME_CONFIG__,
    rcUrl: window.__APP_RUNTIME_CONFIG__ ? window.__APP_RUNTIME_CONFIG__.supabaseUrl : null,
    rcScripts: [...document.scripts].filter(s => (s.textContent||'').includes('__APP_RUNTIME_CONFIG__')).length,
    tables: [...document.querySelectorAll('table')].length,
    ths: [...document.querySelectorAll('th')].map(t => t.innerText.trim()).filter(Boolean).slice(0, 60),
    rows: document.querySelectorAll('tbody tr').length,
  };
}"""

async def sweep_one(ctx, route):
    page = await ctx.new_page()
    rec = {"route": route, "url": concrete(route)}
    blocked, hosts, console, pageerrors, failed = [], {}, [], [], []

    async def guard(r):
        req = r.request
        u = urlsplit(req.url)
        host = u.netloc
        if u.scheme in ("data", "blob"):
            return await r.continue_()
        if req.method not in ("GET", "HEAD") or host not in ALLOWED_HOSTS:
            blocked.append(f"{req.method} {host}{u.path}")
            return await r.abort()
        return await r.continue_()

    await page.route("**/*", guard)
    page.on("request", lambda q: hosts.__setitem__(urlsplit(q.url).netloc, hosts.get(urlsplit(q.url).netloc, 0) + 1))
    page.on("console", lambda m: console.append(red(f"[{m.type}] {m.text}")) if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: pageerrors.append(red(str(e))))
    bodies = []
    async def on_resp(r):
        if r.status >= 400:
            failed.append(f"{r.status} {r.request.method} {urlsplit(r.url).netloc}{urlsplit(r.url).path}")
            if os.environ.get("BODIES") and r.request.method == "GET":
                try: b = (await r.text())[:600]
                except Exception as e: b = f"<no body: {e}>"
                bodies.append(red(f"{r.status} GET {r.url} -> {b}"))
    page.on("response", lambda r: asyncio.ensure_future(on_resp(r)))
    t0 = time.time()
    try:
        resp = await page.goto(ORIGIN + rec["url"], wait_until="domcontentloaded", timeout=30000)
        rec["status"] = resp.status if resp else None
        rec["bytes"] = len(await resp.body()) if resp else None
        try:
            await page.wait_for_function("() => !document.body.innerText.includes('در حال بررسی جلسه کاربری')", timeout=15000)
        except Exception:
            rec["stuck_auth_screen"] = True
        try:
            await page.wait_for_load_state("networkidle", timeout=12000)
        except Exception:
            rec["networkidle_timeout"] = True
        await page.wait_for_timeout(1500)
        info = await page.evaluate(EXTRACT)
    except Exception as e:
        rec["exception"] = str(e)[:300]
        info = None
    rec["ms"] = int((time.time() - t0) * 1000)
    rec["final_path"] = urlsplit(page.url).path
    if info:
        txt = info["main"] if info["main"] is not None else info["body"]
        rec.update(
            title=info["title"], main_chars=len(info["main"] or ""), body_chars=len(info["body"]),
            banner=info["banner"], amberAny=info["amberAny"], redAny=info["redAny"],
            rcType=info["rcType"], rcUrl=info["rcUrl"], rcScripts=info["rcScripts"],
            tables=info["tables"], rows=info["rows"], ths=info["ths"],
            latin=len(LATIN.findall(txt)), persian=len(PERSIAN.findall(txt)), arabic=len(ARABIC.findall(txt)),
            errors=[p for p in ERROR_PATTERNS if p in info["body"]],
            text=txt[:600],
        )
        fn = route.strip("/").replace("/", "__").replace("$", "") or "root"
        open(os.path.join(SP, "text", fn + ".txt"), "w", encoding="utf-8").write(info["body"])
    rec.update(bodies=bodies, blocked=blocked, hosts=hosts, console=list(dict.fromkeys(console))[:40], pageerrors=pageerrors[:20], http_errors=failed[:40])
    await page.close()
    return rec

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path=os.path.expandvars(r"%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1217\chrome-headless-shell-win64\chrome-headless-shell.exe"))
        ctx = await browser.new_context(storage_state=STATE, service_workers="block", locale="fa-IR",
                                        viewport={"width": 1440, "height": 900})
        await ctx.add_init_script("try{Object.defineProperty(navigator,'sendBeacon',{value:()=>false})}catch(e){}")
        q = asyncio.Queue()
        for r in routes:
            if r in SKIP_BROWSER or r in done:
                continue
            q.put_nowait(r)
        async def worker():
            while not q.empty():
                r = q.get_nowait()
                rec = await sweep_one(ctx, r)
                out.write(json.dumps(rec, ensure_ascii=False) + "\n"); out.flush()
                print(f"{rec.get('status')} {rec['ms']}ms {r} -> {rec.get('final_path')} blocked={len(rec['blocked'])} err={len(rec.get('errors', []))}", flush=True)
        await asyncio.gather(*[worker() for _ in range(CONC)])
        await browser.close()

asyncio.run(main())
print("pass2 done")
