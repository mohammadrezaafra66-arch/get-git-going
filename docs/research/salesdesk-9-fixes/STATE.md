# STATE — salesdesk-9-fixes research

- Cursor mode: Agent
- Auto-run: Smart Mode (read-only DB + G3 probes approved as needed)
- Workspace: `D:\AfraKalaTest\app`
- Prompt: `docs/research/salesdesk-9-fixes/RESEARCH-PROMPT.md`
- Updated UTC: 2026-09-21T16:45:00Z

## Stage status

| Stage | Status | UTC |
|-------|--------|-----|
| R0 Setup and ground truth | DONE | 2026-09-21T14:56Z |
| R1 Domain inventory | DONE | 2026-09-21T15:30Z |
| R2 W1 calls N1–N6, G1 | DONE | 2026-09-21T16:00Z |
| R3 W2 deals N7–N15, G2, X2, X3 | DONE | 2026-09-21T16:40Z |
| R4 W3 activities N16–N21, X1 | DONE | 2026-09-21T16:40Z |
| R5 W4 tickets N22–N24 | DONE | 2026-09-21T16:40Z |
| R6 W5 purchases N25–N27, G4 | DONE | 2026-09-21T16:05Z |
| R7 W6 pricing N28–N31, G3 | DONE | 2026-09-21T16:12Z |
| R8 Cross-cutting X4–X7, duplicates, map | DONE | 2026-09-21T16:42Z |
| R9 Self-check | DONE | 2026-09-21T16:45Z |

## Result

`FINDINGS.md` → **STATUS: COMPLETE**

## Notes

- First session: folder did not exist; prompt was copied from `sales-desk-9-needs/RESEARCH-PROMPT.md`.
- `docker cp` avoided; stdin / one-line read-only psql used.
- Owner questions: 3 (AMI sender; pricing host scheduler; meaning of «میز کار»).
