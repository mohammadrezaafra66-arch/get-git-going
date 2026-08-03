# AfraKala — Research prompt for Codex
## AI / RAG / API-key infrastructure discovery

READ-ONLY. Change nothing. Create nothing. Commit nothing. Push nothing.
This is a discovery pass whose only output is a written report.

Repo: `D:\AfraKalaTest\app`
Branch: `feature/navigation-modernization`

Output in **English only** — this terminal reverses Persian text when copied.
Refer to Persian UI strings by English meaning plus Latin transliteration.

The goal is to avoid building anything that already exists. Report what IS
there, not what should be. If something does not exist, say so plainly — do not
soften it, and do not propose designs. A later prompt will handle the build.

---

## 1. Existing AI surface

Find every place this codebase already talks to a language model.

Search `src/` and `supabase/` for: `ollama`, `OLLAMA`, `ai-chat`, `embedding`,
`vector`, `pgvector`, `openai`, `anthropic`, `gemini`, `deepseek`, `llm`,
`completion`, `chat`, `prompt`.

For each hit report: file path, what it does, which model or provider, whether
it is reachable from the UI and by which route, and whether it currently works.

Known starting point: `src/routes/api/messenger/ai-chat.ts` uses self-hosted
Ollama. Confirm and go beyond it.

## 2. Embedding capability

- Does the `vector` extension exist in the database? Check `pg_extension`.
- Does a `message_embeddings` table exist? If so: full column list, the exact
  vector dimension, the index type and distance operator, and its row count.
- Is any embedding model configured anywhere? Report env var NAMES only —
  never print values.
- Is there existing chunking, similarity search, or retrieval code anywhere?

## 3. API key management — the central question

Is there ANY existing place where an admin can enter, store, or manage a
third-party API key or provider credential from the UI?

Look for: a settings/integrations page, an `api_keys` / `integrations` /
`settings` / `app_config` table, encrypted credential storage, per-provider
configuration rows, and anything under an admin route that handles secrets.

Report exactly one of:
- **EXISTS** — with the table, the route, how secrets are stored (encrypted?
  plaintext? RLS?), and who can access it
- **PARTIAL** — something related exists but does not cover API keys; describe
  precisely what it does cover
- **NONE** — no such surface exists

Also check `bot_api_keys` (it appeared in a type union earlier) — what is it
for, is it related, could it be extended, or is it unrelated?

## 4. Provider fallback and quota

Does anything in this codebase already:
- fall back from one AI provider to another when the first is unavailable?
- detect quota exhaustion, rate limits, insufficient balance, or HTTP 429?
- list available models from a provider's API?
- select a model by cost or capability?

Report what exists. If nothing does, say NONE for each.

## 5. Knowledge base current state

- `knowledge_documents`: current row count (it was emptied — confirm), full
  column list, whether `is_published` and any `access_level` concept exist.
- Routes: `/knowledge` and `/knowledge/manage` — what each renders, how search
  currently works (plain text matching or something else), and the permission
  gate on each.
- Is there any admin action for reindexing, embedding, or bulk processing of
  documents?

## 6. Payments / receipts training material

Is there any in-app training, help page, guide, or tutorial for the payments
and receipts area (receipt entry, debt payment, prepayment, positive credit)?

Compare against `/sales/customers/credit-training`, which is a known existing
training page — is there an equivalent for payments, or is that pattern used
only once?

## 7. Reusable pieces

If a RAG feature were built later, what already exists that it should reuse
rather than duplicate? Auth helpers for API routes, the Ollama client, error
handling patterns, admin action patterns, toast conventions, the settings
table used by the gamification sales-source switch (migration 146).

Be specific with file paths.

---

## REPORT FORMAT

Answer each of the 7 sections in order. For every finding give the file path or
table name. For every absence write "NONE — does not exist."

End with a single table:

| Capability | Status | Where | Notes |
|---|---|---|---|
| Ollama chat | | | |
| Embeddings | | | |
| pgvector | | | |
| API key storage UI | | | |
| Provider fallback | | | |
| Quota detection | | | |
| Model discovery | | | |
| Knowledge search | | | |
| Reindex action | | | |
| Payments training page | | | |

Do not propose a design. Do not write code. Report only.