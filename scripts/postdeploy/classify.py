import json, re, collections
from common import load, NOT_EXERCISED
P1 = {r["route"]: r for r in map(json.loads, open("pass1.jsonl", encoding="utf-8"))}
P2 = {r["route"]: r for r in map(json.loads, open("pass2.jsonl", encoding="utf-8"))}
GEN_B = {"POST 192.168.170.10:8000/rest/v1/rpc/is_user_online", "PATCH 192.168.170.10:8000/rest/v1/profiles"}
GEN_H = ("503 GET 192.168.170.10:8000/rest/v1/products", "414 OPTIONS", "503 GET 192.168.170.10:8000/rest/v1/product_owner_assignments",
         "500 GET 192.168.170.10:8000/rest/v1/v_pricing_recompute_queue_summary", "503 HEAD 192.168.170.10:8000/rest/v1/profiles")
ERRTXT = re.compile(r"Something went wrong|با خطا مواجه|خطا در بارگذاری|خطا:|TypeError|Missing authorization_id")
NOGET = {"/api/admin/automation/torob/enqueue", "/api/admin/calls/import-issabel", "/api/messenger/ai-chat",
         "/api/public/bot/dynamic-tables/$tableId/rows/$rowId", "/api/public/bot/dynamic-tables/$tableId/rows/upsert",
         "/api/public/bot/market-matches/candidates/upsert", "/api/public/bot/market-matches/resolve",
         "/api/public/hooks/generate-marketing-tasks", "/api/public/hooks/import-issabel-calls",
         "/api/public/hooks/ingest-market-rates", "/api/public/hooks/process-pricing-queue"}
SENT = {"/academy/$courseId", "/academy/$courseId/$lessonId", "/academy/$courseId/$lessonId/quiz", "/knowledge/$documentId"}
BROKEN_NOTE = {
  "/accounting/receipts/$receiptId": "PGRST200 payment_receipt_links↔invoices",
  "/pricing/amin-hozoor-board": "PGRST200 pricing_board_access_requests↔profiles",
  "/admin/audit": "57014 statement timeout on audit_logs; stuck on «در حال بارگذاری…»",
  "/audit-logs": "57014 statement timeout on audit_logs; stuck on «در حال بارگذاری...»",
  "/bot-api-keys/usage": "57014 statement timeout on bot_api_usage_logs",
  "/.lovable/oauth/consent": "«Missing authorization_id» — expected with no OAuth request id",
}
rows = []
for route in load("fullpaths.txt"):
    p1, p2 = P1.get(route, {}), P2.get(route)
    v, note = None, ""
    if route in NOT_EXERCISED:
        v, note = "NOT EXERCISED", NOT_EXERCISED[route]
    elif route in NOGET:
        v, note = "NOT EXERCISED", f"no GET handler; GET returned SPA fallback {p1.get('status')}, handler not run"
    elif p2 is None:
        s = p1.get("status")
        if route == "/public/sale-lists/$listId":
            v, note = "AUTH", "anon 404 by design: «این لیست برای بازدیدکنندگان در دسترس نیست»; browser pass skipped (loader calls writer refresh_sale_list_prices)"
        elif s == 200:
            v, note = "OK", (p1.get("text") or "")[:90]
        else:
            v, note = "ERROR", f"status {s}"
    else:
        pb = sorted(set(b.split(" ")[0] + " " + b.split("/")[-1][:40] for b in p2["blocked"] if b not in GEN_B))
        ph = sorted(set(h for h in p2["http_errors"] if not h.startswith(GEN_H)))
        txt = p2.get("text", "")
        if p2.get("exception") or (p2.get("status") or 0) >= 400:
            v, note = "ERROR", p2.get("exception") or f"status {p2.get('status')}"
        elif p2["final_path"] in ("/unauthorized", "/login") and p2["final_path"] != p2["url"]:
            v, note = "AUTH", f"redirected to {p2['final_path']}: «دسترسی غیرمجاز»"
        elif route in BROKEN_NOTE:
            v, note = "BROKEN", BROKEN_NOTE[route]
        elif ph:
            v, note = "BROKEN", "; ".join(ph)
        elif pb and ERRTXT.search(txt):
            v, note = "GUARD", "error text after guard aborted: " + ", ".join(pb[:3])
        elif ERRTXT.search(txt):
            v, note = "BROKEN", ERRTXT.search(txt).group(0)
        elif pb:
            v, note = "GUARD", "data path uses non-GET (aborted): " + ", ".join(pb[:3])
        elif route in SENT:
            v, note = "EMPTY", "no rows exist on production; sentinel id → not-found state"
        elif (p2.get("main_chars") or 0) == 0 and route not in ("/pending-approval", "/unauthorized"):
            v, note = "EMPTY", "no <main> content"
        else:
            v, note = "OK", ""
        if p2["final_path"].rstrip("/") != p2["url"].rstrip("/") and v not in ("AUTH",):
            note = (note + "; " if note else "") + f"redirects to {p2['final_path']}"
    grp = "C" if route.startswith("/api/") else ("A" if route in open("A.txt", encoding="utf-8").read().split("\n") else "B")
    rows.append(dict(route=route, grp=grp, s1=p1.get("status"), ms1=p1.get("ms"), b1=p1.get("bytes"),
                     s2=(p2 or {}).get("status"), ms2=(p2 or {}).get("ms"), m2=(p2 or {}).get("main_chars"),
                     rc=(p1.get("rc_count_any"), (p2 or {}).get("rcScripts")), L=(p2 or {}).get("latin"), Pd=(p2 or {}).get("persian"),
                     verdict=v, note=note))
CHROME = {"/accounting/receivables": "50 rows, header «کارشناس فروش»", "/accounting/allocation-workbench": "overdue receivables/payables totals + 50 receivable rows",
  "/accounting/treasury": "2 accounts, totals", "/accounting/dynamic-capital": "17 snapshot rows", "/accounting/payables": "9 rows",
  "/accounting/mutual-settlement": "7 rows",
  "/accounting/customer-capital-allocations": "redirect target /accounting/dynamic-capital verified", "/accounting/daily-capital": "redirect target /accounting/dynamic-capital verified",
  "/accounting/salesperson-capital-allocations": "redirect target /accounting/dynamic-capital verified"}
for r in rows:
    if r["route"] in CHROME and r["verdict"] == "GUARD":
        r["verdict"] = "OK"; r["note"] = "headless: data RPC aborted by guard; Chrome (operator session): " + CHROME[r["route"]]
json.dump(rows, open("verdicts.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
c = collections.Counter(r["verdict"] for r in rows); print(len(rows), dict(c))
for g in "ABC": print(g, dict(collections.Counter(r["verdict"] for r in rows if r["grp"] == g)))
for r in rows:
    if r["verdict"] in ("BROKEN", "ERROR", "EMPTY", "AUTH"): print(r["verdict"], r["route"], "|", r["note"][:140])
print("GUARD:", [r["route"] for r in rows if r["verdict"] == "GUARD"])
