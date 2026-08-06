# Phone-collision detection — defect report

**Read-only investigation. Nothing was changed.** Phase P0.6 of the UNIFY program explicitly
says: identify the defect, do not fix it.

Discovered live against `afrakala` as `supabase_admin` on 2026-08-07.
Live definition snapshotted to `docs/verification/pre-P0.6/detect_phone_collisions.live.sql`.

---

## Summary

The question P0.6 poses is *"does the function miss collisions the manual scan catches?"*
The answer is **yes, but that is the smaller half of the problem.**

`public.detect_phone_collisions()` is blind to the identity model — it never reads `persons`
or `person_identifiers`. That is the **miss**.

The more serious defect is the opposite one: **the function does not resolve its members to a
person before declaring a collision.** It groups rows that share a phone number, when the
question it is meant to answer is which *people* share a phone number. Two of the three
collisions sitting in the queue right now are already false positives — one person appearing
in two of their own mirror tables.

This matters immediately, because **P1's entire purpose is to make one person hold both a
`customers` row and a `suppliers` row.** Under the current logic every dual-role person P1
creates is, by construction, a new phone collision.

---

## The function, as it runs today

```sql
CREATE OR REPLACE FUNCTION public.detect_phone_collisions() RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _inserted integer := 0;
BEGIN
  WITH all_phones AS (
    SELECT 'customers' AS tbl, c.id::text AS ref, c.name AS label,
           public.normalize_phone_local(c.phone) AS ph
      FROM public.customers c WHERE coalesce(btrim(c.phone), '') <> ''
    UNION ALL SELECT 'suppliers',        s.id::text, s.name,      … FROM public.suppliers s …
    UNION ALL SELECT 'external_parties', e.id::text, e.full_name, … FROM public.external_parties e …
    UNION ALL SELECT 'profiles',         p.id::text, p.full_name, … FROM public.profiles p …
    UNION ALL SELECT 'visitors',         v.id::text, v.full_name, … FROM public.visitors v …
  ),
  grouped AS (
    SELECT ph, jsonb_agg(…) AS refs, count(*) AS n
      FROM all_phones
     WHERE ph ~ '^09[0-9]{9}$'
     GROUP BY ph HAVING count(*) > 1
  )
  INSERT INTO public.phone_collisions (normalized_phone, entity_refs)
  SELECT g.ph, g.refs FROM grouped g
   WHERE NOT EXISTS (SELECT 1 FROM public.phone_collisions pc
                      WHERE pc.normalized_phone = g.ph AND pc.status = 'pending');
  GET DIAGNOSTICS _inserted = ROW_COUNT;
  RETURN _inserted;
END;
$function$
```

Five source tables. `persons` and `person_identifiers` are not among them.

---

## Evidence

### The queue is not stale — the function's own finds *are* queued

`phone_collisions` holds exactly 3 rows, all `pending`, all detected 2026-08-04, and they are
exactly the 3 groups a read-only replay of the function's body produces today:

| normalized_phone | n | members |
|---|--:|---|
| `09122270261` | 3 | suppliers:محمدرضا افرا · suppliers:تست دستی من · visitors:شرکت |
| `09026009898` | 2 | customers:محمدزین الدین · profiles:حانیه ماهرو |
| `09903858654` | 2 | profiles:پورچیستا سعادت مبارکی · suppliers:12 |

So P0.6's step-5 alternative — *"the function finds everything and the pairs were simply never
queued"* — **is not what is happening.** Queuing works. The function's *scope* is wrong.

### Defect 1 — two of the three queued collisions are false positives

Resolving each member row to its `person_id`:

| normalized_phone | rows | distinct persons | resolution | verdict |
|---|--:|--:|---|---|
| `09026009898` | 2 | **1** | customers→`f144680e` · profiles→`f144680e` | **false positive** |
| `09903858654` | 2 | **1** | profiles→`dc76b4a6` · suppliers→`dc76b4a6` | **false positive** |
| `09122270261` | 3 | 2 | suppliers→`46f4be38` · suppliers→`6358926a` · visitors→`NULL` | genuine |

Two of the three rows an operator is being asked to review are one person correctly mirrored
into two of their own role tables. The function reports *row* collisions and labels them
*phone* collisions.

### Defect 2 — `persons` / `person_identifiers` are invisible

A manual scan with `person_identifiers` (kinds `mobile_e164`, `landline`, `status <> 'revoked'`)
added to the union finds **28** groups where the function finds **3**.

But adding that source naively would make things worse, not better:

| | count |
|---|--:|
| groups found with `person_identifiers` in the union | 28 |
| of those, **one person mirrored** (false positive) | **27** |
| genuine multi-person or unresolvable | 1 |

`person_identifiers` is where a person's canonical phone lives, and `customers.phone` /
`profiles.phone` are copies of it. Unioning them without a person-level `GROUP BY` turns every
correctly-stored phone into a collision. **Defect 2 cannot be fixed without fixing defect 1
first.**

### Defect 3 — dual-role persons become permanent false positives

This is defect 1 aimed at the future rather than the present. P1.1 adds a trigger so a
`context_kind='supplier'` link creates the `suppliers` mirror, and P1.2 makes the creation
forms attach a second role to an existing person instead of minting a new one. Both mirrors
carry the same phone.

Result: **every person who becomes dual-role raises a phone collision.** The `09903858654`
row above is exactly this shape already (`profiles` + `suppliers`, one person) — it is a
preview of what P1 produces at scale.

### Defect 4 — a resolved collision can never re-raise

The insert guard is:

```sql
WHERE NOT EXISTS (SELECT 1 FROM public.phone_collisions pc
                   WHERE pc.normalized_phone = g.ph AND pc.status = 'pending')
```

Keyed on `normalized_phone` + `status = 'pending'` only. Once a collision is moved out of
`pending` (resolved or dismissed), a **new** entity joining that same phone group produces no
new row — the group is not re-examined, and `entity_refs` on the old row is never refreshed.
The queue silently stops tracking that phone number forever.

### Defect 5 — the `^09[0-9]{9}$` filter discards landlines (latent)

`grouped` keeps only Iranian mobile shape. `normalize_phone_local` deliberately preserves
landlines (`normalize_identifier('landline', …)`, area code retained) and returns the raw
string when neither shape matches — and all of that is then filtered away.

**Currently harmless:** zero stored phones fail the filter today (query C returned 0 rows).
It is a latent defect, not an active one — it activates the first time a landline or an
unparseable number is stored.

---

## What a correct version would do

Not implemented here — P0.6 is diagnosis only. Recorded so the fix phase does not re-derive it:

1. Resolve every member row to a `person_id` **before** grouping, and only raise a collision
   when `count(DISTINCT person_id) > 1`. This alone removes 2 of 3 current rows and 27 of 28
   under an expanded union.
2. Rows that cannot resolve to a person (`visitors` has no `person_id` column at all) need a
   deliberate rule — today they are silently treated as distinct parties, which is why
   `09122270261` counts 3 members but only 2 persons.
3. Only after 1 and 2, add `person_identifiers` as a source.
4. Re-key the insert guard on the group's *membership*, not on `normalized_phone` + `pending`,
   so a changed group re-raises.
5. Decide the landline rule before the filter starts discarding real data.

## Verification queries used

All read-only. Full transcripts in the session scratchpad; the two that carry the argument:

```sql
-- false-positive check on what the function currently queues
WITH all_phones AS (
  SELECT 'customers' AS tbl, c.person_id, public.normalize_phone_local(c.phone) AS ph
    FROM public.customers c WHERE coalesce(btrim(c.phone),'')<>''
  UNION ALL SELECT 'suppliers', s.person_id, public.normalize_phone_local(s.phone) FROM public.suppliers s …
  UNION ALL SELECT 'external_parties', e.person_id, … UNION ALL SELECT 'profiles', p.person_id, …
  UNION ALL SELECT 'visitors', NULL::uuid, …
)
SELECT ph, count(*) rows_in_group, count(DISTINCT person_id) distinct_persons,
       count(*) FILTER (WHERE person_id IS NULL) null_person
  FROM all_phones WHERE ph ~ '^09[0-9]{9}$' GROUP BY ph HAVING count(*)>1;
```

```sql
-- what happens if person_identifiers is added naively (27 of 28 false)
… UNION ALL SELECT 'person_identifiers', i.person_id, public.normalize_phone_local(i.value_normalized)
    FROM public.person_identifiers i
   WHERE i.kind in ('mobile_e164','landline') AND i.status<>'revoked' …
```
