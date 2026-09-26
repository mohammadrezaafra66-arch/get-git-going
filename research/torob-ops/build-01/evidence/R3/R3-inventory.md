# R3 — D:\TorobBot port inventory (read-only, not run)

Python: no pin. Implied 3.10+. Install: `pip install -r requirements.txt` then `python -m playwright install chromium`. Host Python 3.12 exists (`C:\Program Files\Python312\pythonw.exe` in Task Scheduler for a *different* tree, `D:\TorobBot-integration`).

Deps: playwright>=1.44, fastapi, uvicorn, sqlalchemy, pydantic, requests, httpx, openpyxl, PyYAML, jdatetime, google-genai, pytest.

**`api.torob.com/v4/base-product/sellers/?prk=` is not used.** `prk` is parsed from DOM `href`s. **`trb_clearance` is not present.**

| Piece | File:line | Deps | Tests | Own DB? |
|---|---|---|---|---|
| Product page fetch | `worker.py:79-87` goto + `scraper.collect_prices` | Playwright, antidetect, scraper | offline parser only | no (caller writes) |
| Seller list | `scraper.py:18-20, 212-256` DOM `SellerRow` / `/redirect/` / `prk=` | Playwright, utils | `tests/unit/test_scraper_parser.py` | no |
| Search | `search.py:6-8, 62-80` `https://torob.com/search/?query=` | Playwright | title helpers only | no |
| Cookie / clearance | none | persistent `chrome_profile/` for reporter only | none | no |
| 490 / CAPTCHA | 490 documented (`search.py:6-8`) not branched; `antidetect.looks_blocked` `antidetect.py:14-18, 73-79` | antidetect | phase01 fetch_errors (403/429) | no |
| Rate limit | `config.py:124-125` 20–40s; search 3–7s; backoff `antidetect.py:93-98` | config | hybrid 429 | memory only |
| Playwright | `browser_manager.py:93-116` headless Chromium, fa-IR, Asia/Tehran, stealth | playwright | fake Playwright unit | no |
| Login / OTP | `setup_login.py:14-36` manual persistent profile; **no OTP** | Playwright | none | no |
| Report submit | `reporter.py:82-133` form fill; default dry-run / disabled | Playwright + optional Gemini | flag tests only | yes `report_logs` |

Smallest copy set: `scraper.py`, `search.py`, `antidetect.py`, `browser.py`, `browser_manager.py`, `resource_policy.py`, `runtime_settings.py`, `fetch_errors.py`, stripped `config.py`, `utils.py`. Tests: `tests/unit/test_scraper_parser.py` + fixture HTML, `tests/phase01/test_browser_manager.py`, `tests/phase01/test_fetch_errors.py`.

Leave behind: `reporter.py`, `setup_login.py`, `worker.py`, `backend.py`, `db.py`, FastAPI UI, Gemini, observatory/pricing packages.

Optional: `owned_stores/redirect_meta.py` (stdlib urllib peek of `/v4/product-page/redirect/`).
