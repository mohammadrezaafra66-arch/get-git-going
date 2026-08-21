# Unknowns

- **Production DB `192.168.170.10`:** never probed (forbidden). All live schema claims are LAN `afrakala-lan-db` only. If production missed migration 332/335, conclusions invert.
- **tick_inquiries runtime:** auto_submit_penalty is patched on LAN; RPC was not executed (mutating). 42P10 may or may not still fire from another statement.
- **RLS completeness:** policies not enumerated table-by-table. Attendance `/presence`, bot keys, messenger — UNKNOWN_AFTER_INVESTIGATION.
- **Signup/email confirm:** not exercised.
- **`afrakala-local-db` vs LAN:** local also running; not compared (drift possible).
- **`.from("product"|"purchase"|"messenger"|"delivery")` inventory hits:** likely false fragments or non-table strings; not fully classified. See `orm-tables-not-in-types.txt`.
- **Component orphan graph:** knip/ts-prune/madge not installed; did not mark unused components. Barrel files exist.
- **Playwright truth:** suite not run (mutation risk). e2e files are intent+historical.
- **Secrets in env files:** `.env.lan` not opened to avoid printing secrets. `/api/healthz` body not fetched.
- **Hardcoded API keys in source:** no `sk-`/`eyJ` assignments found in a shallow grep; not a full secret scan.
- **N+1 queries:** not profiled.
- **useEffect cleanup:** not globally audited; InquiryBoard does cleanup its interval.
- **`.env.example` vs used keys:** not fully diffed.
- **openapi/ and automation/ directories:** stale by git date; contents not fully read.
- **Whether `price_lists` has rows:** table exists; data not counted (SELECT * avoided; a COUNT would be allowed but skipped).
