# Platform Branding Audit — myafrakala.ir

**Date:** 2026-08-06  
**Branch:** `feature/navigation-modernization`  
**Root:** `D:\AfraKalaTest\app`  
**Canonical brand:** `myafrakala.ir`

---

## Summary

| Item | Value |
|------|-------|
| Prior canonical names | `افراکالا`, `دستیار هوشمند افراکالا`, `AfraKala` |
| `myafrakala.ir` before | **0** |
| `src/config/` before | **missing** |
| Runtime literals to change | ~35–48 (chrome/SEO/PWA/PDF) |
| Domain “our system vs Asan” copy | update via config where user-visible |
| Must **not** change | DB/API ids, cache keys, migrations, repo/Docker names, feature module «دستیار» |

---

## Old brand variants found

| Variant | Typical surface |
|---------|-----------------|
| افراکالا | Sidebar, footer, short titles, PWA short_name |
| دستیار هوشمند افراکالا | Login H1, default document title, PWA name |
| AfraKala | AI drawer, AI prompt, version API |
| get-git-going.lovable.app | Stale og/canonical URLs |
| afrakala-* (internal) | SW cache, localStorage, observatory slug — **keep** |

---

## Config opportunity

Create `src/config/branding.ts` as the single source of truth.  
Static duplicate required: `public/manifest.webmanifest` (cannot import TS).

---

## Classification (selected)

| Path | Literal | Change? | Why |
|------|---------|---------|-----|
| `__root.tsx` titles/meta/PWA meta | دستیار هوشمند افراکالا / افراکالا | **yes** | Platform chrome |
| `public/manifest.webmanifest` | name/short_name/description | **yes** | PWA (static dup) |
| `login.tsx` H1 + titles | دستیار هوشمند افراکالا | **yes** | Login brand |
| `AppSidebar.tsx` | افراکالا | **yes** | Sidebar |
| `sale-list-header` / public footer | افراکالا | **yes** | Public brand |
| Invoice/PDF chrome | دستیار هوشمند افراکالا | **yes** | Print brand |
| Asan import «در افراکالا» | افراکالا | **yes** | User-visible system name |
| `primary-modules` «دستیار» | دستیار | **no** | Feature module |
| Purchase advisor title | دستیار هوشمند خرید | **no** | Feature name |
| `afrakala_product_id` / observatory slug | afrakala_* | **no** | API/DB |
| `sw.js` cache prefix | afrakala-static-* | **no** | Internal |
| Migrations / UAT docs | — | **no** | Historical |

---

## Unavoidable static duplicates

1. `public/manifest.webmanifest` — documented; kept in sync with `BRANDING`.
2. `public/robots.txt` / sitemap base URL if updated separately from TS.

---

## Risky false positives

- Product catalog `brands` / `brand_name`
- Feature «دستیار» / «دستیار هوشمند خرید»
- Schema columns and RPC names containing `afrakala`
- Comments `// AfraKala:`
- Company legal name vs domain (mission: platform display = myafrakala.ir)
