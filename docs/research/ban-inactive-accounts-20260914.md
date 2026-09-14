# Run record — banning inactive accounts that could still sign in — 2026-09-14

Host: production laptop `192.168.170.10`, database `postgres`, GoTrue `supabase/gotrue:v2.158.1`,
Kong on `localhost:8000`. Operator: Claude Code, with owner approval given at the stop.
No migration applied, no deploy, no row deleted, no auth user deleted, no key or token printed.

## Outcome

**12 of 12 non-active accounts banned. Each ban was proven to block sign-in, not assumed.
All live refresh tokens belonging to them were revoked (1 existed).** No account was left alone.

## 1. Measurement (read-only, 2026-09-14 10:03 UTC)

The dump-based finding said 7 accounts, 5 of them admin. Live: **12** profiles with
`status <> 'active'`, **none banned**. The difference is not drift. Exactly 7 have a confirmed
email, 5 of those hold `admin`, and that matches the dump. The other 5 were never confirmed
(`GOTRUE_MAILER_AUTOCONFIRM=false`), so a password login is already refused with
"Email not confirmed". They were banned too, on the owner's instruction.

No candidate had signed in within 30 days. The latest sign-in across all 12 was 2026-06-06.
No candidate was an actor in `public.audit_logs` within 30 days. GoTrue's audit log showed no
activity by any of them in 90 days.

Several candidates carry the names of current employees. **The owner confirmed that every such
person already signs in through a different, active account, so nobody lost access.**

## 2. What was banned

Method: `PUT /auth/v1/admin/users/<id>` with `{"ban_duration":"876600h"}`, service_role key,
`Invoke-RestMethod`/`Invoke-WebRequest`. Every account got `banned_until = 2126-09-15`.

| # | user id | email | status | roles | why banned | banned_until (UTC) | proof |
|---|---|---|---|---|---|---|---|
| A1 | 48f7c9d5-096e-437e-af9b-9cb0be5deb8c | afra-admin@local.test | inactive | admin | break-glass account, not a person; unrevoked 2026-06-06 session | 2126-09-15 10:14:55 | 403 user_banned + refresh refused |
| A2 | 255f1870-55fc-400a-9a0a-e3c1da7d0ce8 | chistasaadat@gmail.com | inactive | — | duplicate of an active account of the same person | 2126-09-15 10:16:19 | 403 user_banned |
| A3 | 77a22620-26f0-4a34-8a8e-2b2b26045dd8 | trbimelika82+old-restore@gmail.com | inactive | — | restore artefact | 2126-09-15 10:17:02 | 403 user_banned |
| A4 | 6aeeb222-c74b-4ccd-8cbc-c9170c808f41 | afrakaladidar400@gmail.con | inactive | admin | typo duplicate of an active account | 2126-09-15 10:19:01 | 403 user_banned |
| A5 | 76fac9df-e48a-457f-ab98-0971825f3e2e | mohammadrezaafra666@gmail.com | rejected | admin | not the owner's (owner confirmed); never signed in | 2126-09-15 10:19:01 | 403 user_banned |
| A6 | 1a3e4277-32c8-4efc-9cf3-b5a3d380a247 | trbimelika82@gmail.com | rejected | admin | person signs in via another active account | 2126-09-15 10:19:01 | 403 user_banned |
| A7 | fb4ec894-0ea6-4955-8efc-7882279164a8 | afrakaladidar410@gmail.com | inactive | admin | never signed in | 2126-09-15 10:19:01 | 403 user_banned |
| B1 | 97eb29a9-4113-4cc9-a421-946735465183 | 1@gmail.com | rejected | — | test junk, unconfirmed | 2126-09-15 10:27:34 | 403 user_banned |
| B2 | c33a9813-aebf-4fc8-96e9-c8ea3d2099c6 | alihajrasouli@gmail.com | rejected | — | duplicate of an active account, unconfirmed | 2126-09-15 10:27:52 | 403 user_banned |
| B3 | 86204a7a-6435-409d-babf-2f1145f1c718 | afrakalatest@gmail.com | rejected | — | test junk, unconfirmed | 2126-09-15 10:27:52 | 403 user_banned |
| B4 | 6bac65a4-140f-4de3-af82-78534c2626d3 | 12@gmail.com | rejected | — | test junk, unconfirmed | 2126-09-15 10:27:52 | 403 user_banned |
| B5 | 262e6a90-a432-4bf9-b917-6630ce8e31f8 | chista@gmail.com | rejected | — | test junk, unconfirmed | 2126-09-15 10:27:52 | 403 user_banned |

Roles were **not** removed. `user_roles` is untouched; the owner did not ask for that.

## 3. How "blocks sign-in" was proven

Checked against the v2.158.1 source before acting:

- **The password grant cannot prove a ban.** `IsBanned()` runs *before* the password check and
  returns the generic `Invalid login credentials`, the same response as a wrong password.
  Without the user's password it distinguishes nothing. It was not used as proof.
- **`/verify` does prove it.** `IsBanned()` returns `403 user_banned "User is banned"` before
  the transaction that would log the user in.
- **The refresh grant does too.** `IsBanned()` returns `Invalid Refresh Token: User Banned`
  before any rotation.

Per account: `POST /auth/v1/admin/generate_link {type:magiclink}` (no email is sent; the token
hash was held in memory only), then `POST /auth/v1/verify {type, token_hash}` with the anon key.
**All 12 returned `403 user_banned`, with no access token in the body.** Afterwards: user count
still 36, no user created, `last_sign_in_at` unchanged, and table B still unconfirmed.

afra-admin was banned and proven first, alone, before any other account was touched.

Side effects, accepted by the owner: one `user_recovery_requested` event in
`auth.audit_log_entries` and one one-time-token hash on each user's auth row.

**Probe hazard found on this host:** 33 of 36 auth users have `aud = ''`. Only
`trbimelika82+old-restore@gmail.com`, `mohammadrezaafra666@gmail.com` and
`mohammadrezaafra66+old-restore@gmail.com` have `aud = 'authenticated'`. For A3, the first
`generate_link` failed with HTTP 500 `Database error saving new user`
(`users_email_partial_key`): GoTrue looked the user up under the empty audience, did not find
it, and tried to create a new user. The transaction rolled back, and no user was created (count
re-checked: 36). Repeating the call with the `X-JWT-AUD: authenticated` header succeeded.

## 4. Refresh-token revocation

The ban did **not** revoke refresh tokens: afra-admin still had 1 live token after its ban.
GoTrue v2.158.1 has no admin endpoint that revokes another user's tokens, so this was done by
SQL in one transaction (`--single-transaction`, `ON_ERROR_STOP`). `auth.refresh_tokens` has no
triggers.

```sql
UPDATE auth.refresh_tokens SET revoked = true, updated_at = now()
 WHERE user_id IN (<the 7 table-A ids>) AND NOT coalesce(revoked,false);
```

| account | tokens total | revoked by this run | live after |
|---|---|---|---|
| afra-admin@local.test | 3 | **1** | 0 |
| the other 6 in table A | 0 | 0 | 0 |
| the 5 in table B (checked, not in the UPDATE) | 0 | 0 | 0 |

Proof for afra-admin's 2026-06-06 tokens: all 3 were refused (`400 invalid_grant`,
"Invalid Refresh Token: User Banned", no access token) both **before and after** revocation.
The ban check runs ahead of the revoked check, so the API response after revocation is
attributable to the ban. Revocation itself is proven at the database level (`rt_live = 0`,
`revoked_at 10:28:33`). It is the second lock, not independently observable while the ban stands.

Its `auth.sessions` row (2026-06-06) remains, because deleting rows was forbidden. With no live
refresh token and a 1-hour JWT, that row cannot produce access.

## 5. Audit trail of this run

- `auth.audit_log_entries`: one `user_modified` (the ban) per account, actor `service_role`.
- `public.audit_logs`: **no rows written.** The bans and the SQL token revocation have no row in
  the application's audit log. This record is the audit trail for them.

## 6. Findings recorded, NOT acted on

1. **`mohammadtest@afrakala.local` is gone from `auth.users`.** It was banned on 2026-09-12
   because `audit_logs_actor_id_fkey` (then NO ACTION) blocked deletion. GoTrue's audit log shows
   `user_deleted` at **2026-09-13 13:45:48 UTC by `service_role`**. The deletion was possible
   because migration 531 had switched that FK to `ON DELETE SET NULL`. Consequence: its two
   `user_registered` rows in `public.audit_logs` (ids 113712, 113713) now have
   **`actor_id = NULL`**, so the deletion rewrote the audit trail. Who ran it is not recorded
   beyond `service_role`.
2. **On 2026-08-15, `pourchista.saadat.mobaraki@gmail.con` assigned roles to
   `trbimelika82@gmail.com` (rejected) and `afrakaladidar410@gmail.com` (inactive).**
   Both are now banned; the role rows were not changed.
3. **Unexplained privileged write:** `mohammadrezaafra666@gmail.com` was granted `admin` on
   2026-06-05 11:16:44 UTC with **no actor** in `audit_logs`, meaning a direct database write
   rather than the app. It had been rejected on 2026-05-30 by
   `mohammadrezaafra66+old-restore@gmail.com`. Not investigated.
4. **Migration 542 divergence.** Production's ledger holds `20260914130000` (542), inserted
   **2026-09-14 09:51:21 UTC**, and its `has_role(uuid,text)` body is live. The file exists only
   on the unmerged branch `origin/feature/security-fix-542`: not on `main`, not on `staging`, and
   not on disk in `C:\afrakala`, whose newest migration is 539. Production's schema is ahead of
   the branch it tracks. The test host was not checked (out of bounds for this run).
5. **`mohammadrezaafra66+old-restore@gmail.com`: active, admin, not banned.** Left alone; the
   owner decides.
   - Last sign-in 2026-06-03 11:24 UTC. 0 logins and 0 token refreshes in 30 days.
   - 0 sessions, 0 live refresh tokens. Latest GoTrue event 2026-06-03.
   - 7,593 `audit_logs` rows as actor (2026-05-24 .. 2026-09-05), mostly `product_created`
     (7,326, the last on 2026-08-11). Many fall **after** its last sign-in, so something other
     than an interactive session (a job, script or import) writes with its id.
   - The 2026-09-05 row (id 105265) is `auto_created` on a `penalty`
     (`no_response_primary`, "عدم پاسخ مسئول اول طی ۱۰ دقیقه"): a system-generated penalty
     attributed to this account, not a sign-in.
