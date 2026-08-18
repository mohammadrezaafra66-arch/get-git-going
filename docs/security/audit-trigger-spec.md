# Audit and immutability specification

Two rules, one mechanism. **A posted journal entry can never be changed**, and **every document
creation leaves an audit row in the same transaction that created it**.

Both matter more here than in a normal system, because approval was removed (T1). Without a second
pair of eyes, the audit trail is the only record of who moved a balance, and immutability is the
only guarantee that what was exported to Asan is what is still in the ledger.

---

## 1. Immutability

### Rule
Once `journal_entries.status = 'posted'`, neither that row nor any of its `journal_lines` may be
updated or deleted. Correction is by **reversal**, never by edit.

### Mechanism
A `BEFORE UPDATE OR DELETE ... FOR EACH ROW` trigger on both tables. On `journal_lines` the check
reads the parent entry's status.

```
IF (posted) THEN
  RAISE EXCEPTION 'سند ثبت‌شده قابل تغییر نیست؛ برای اصلاح، سند برگشتی بزنید'
    USING ERRCODE = 'P0001';
END IF;
```

### Deliberately excluded
`reverse_document` creates a **new** entry; it never edits the original. So it needs no exemption,
and there is no bypass path to audit.

### Why a trigger and not RLS
RLS on UPDATE silently filters rather than failing: an update matching no rows returns success with
zero rows changed, and the caller reads that as "done". The same failure mode already exists on this
database — `payment_receipts` has no DELETE policy, so the create page's rollback deletes nothing and
returns 204. A trigger raises, so the caller cannot misread it.

---

## 2. Mandatory audit

### Rule
Every call to `create_receipt`, `create_payment`, `create_dual_document` and `reverse_document`
writes exactly one `audit_logs` row **inside the same transaction**. If the audit write fails, the
document is not created.

### Why inside the transaction
The current create page writes its audit row *after* the link insert. When the link insert fails, no
audit row is written at all — so the orphan receipt it leaves behind is invisible. Putting the audit
write in the same transaction makes "created but unaudited" impossible.

### Required fields

| Field | Value |
|---|---|
| `action` | `receipt_created`, `payment_created`, `dual_document_created`, `document_reversed` |
| `actor_id` | `auth.uid()` — never a parameter, so a caller cannot claim to be someone else |
| `entity_type` / `entity_id` | the source document |
| `journal_entry_id` | the posted entry |
| `document_number` | the human-readable number |
| `amount` | Toman |
| `counterparty_id` / `counterparty_kind` | who the balance moved for |
| `created_at` | `now()` |

**Never record** the party's Asan code, phone number or national ID in the audit payload. The audit
answers *who did what to which document*, not who the person is. Ids are enough.

---

## 3. Role enforcement

Inside SQL, use `public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role,
'manager'::app_role])`.

Three traps, all previously encountered:

1. **Never call the role check through PostgREST.** `has_role` and `has_any_role` each have two
   overloads (`app_role` and `text`), neither of which can be dropped, so `supabase.rpc(...)` throws
   `PGRST203`. From the front end, read `user_roles` directly with `supabaseAdmin`.
2. **`user_roles.role` is TEXT** while many policies still compare against the `app_role` enum.
   Comparing without a cast throws `operator does not exist: text = app_role`.
3. **Refuse loudly.** An unauthorised caller must get `42501`, never an empty result. RLS returning
   zero rows is read upstream as "there is no data", which is how a permission bug becomes a
   data-loss bug.

---

## 4. RLS on the new tables

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `document_numbers` | admin, accountant | **none** | **none** | **none** |
| `document_attachments` | admin, accountant, manager | admin, accountant, manager | **none** | admin |
| `journal_entries` | admin, accountant, manager | **none** | **none** | **none** |
| `journal_lines` | same as parent | **none** | **none** | **none** |

"**none**" means no policy at all, so a direct PostgREST write is impossible by construction. The
only way in is a `SECURITY DEFINER` function. This is the same pattern `asan_export_numbers` already
uses successfully.

**Every new table must have RLS enabled.** A table in `public` with RLS off is an open door; the
phase gate asserts `SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace
AND relkind='r' AND NOT relrowsecurity;` returns `0`.

---

## 5. Module permissions

Any new module string must be seeded into `role_permissions` for **every** role, because
`has_dynamic_permission` grants access to all roles when a module has no row at all. An unseeded
module is open, not closed.

Give `can_view` and `can_create` to `admin` and `accountant`; insert explicit all-false rows for
every other role. Never rely on absence.

---

## 6. Acceptance tests

```sql
-- Immutability
UPDATE journal_entries SET description = 'x' WHERE status = 'posted';
-- expect: P0001

-- No direct insert
INSERT INTO journal_entries (source_type, source_id, entry_date, status, doc_kind)
VALUES ('x', gen_random_uuid(), current_date, 'posted', 'receipt');
-- expect: RLS refusal for a non-definer caller

-- RLS everywhere
SELECT count(*) FROM pg_class
 WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND NOT relrowsecurity;
-- expect: 0

-- Module seeded for every role
SELECT count(DISTINCT role_name) FROM role_permissions WHERE module = '<new module>';
-- expect: equal to SELECT count(DISTINCT role_name) FROM role_permissions
```

Audit coverage: after creating one document of each type, `audit_logs` holds exactly three new rows
with the correct actions and a non-null `journal_entry_id` on each.
