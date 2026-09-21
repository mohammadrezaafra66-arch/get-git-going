# Wave 4 migration ledger — allocated 2026-09-22 BEFORE dispatch [B-4]
# Do not overlap; do not renumber after dispatch without notifying all agents.

| NNN | version timestamp | concern | row | owner agent |
|-----|-------------------|---------|-----|-------------|
| 572 | 20260922050000 | sales_activity_types seed Didar 17 + یادداشت ساده | D2 | W4-DE-D2 |
| 573 | 20260922050100 | sales_interactions activity cols + map call/note | D1 | W4-DE-D1 |
| 574 | 20260922050200 | role_permissions activities page module | D4 | W4-DE-D4 |
| 575 | 20260922050300 | activity reminder fields (if needed; else SKIP) | D6 | W4-DE-D6 |

Next free after this wave: 576
CONTRACTS next free was stale at 565; live highest applied before W4 = 571.
D2 applied 572 (`20260922050000`) on LAN copy — see `d2-apply.txt` / `d2-hex-verify.txt`.
D1 applied 573 (`20260922050100`) on LAN copy — see `d1-apply.txt` / `d1-verify.txt` / `d1-revert-probe.txt` (round-trip).
