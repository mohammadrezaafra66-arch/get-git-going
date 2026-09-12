SET client_encoding='UTF8';

-- 531 — deleting a user no longer blocks on their own audit history.
--
-- WHAT WAS WRONG. `audit_logs_actor_id_fkey` (audit_logs.actor_id -> auth.users.id) had
-- no ON DELETE action, i.e. NO ACTION (confdeltype = 'a'): deleting a user who had ever
-- performed an audited action raised a foreign-key violation and the delete failed.
--
-- WHY ON DELETE SET NULL IS SAFE HERE. `audit_logs.actor_id` IS NULLABLE — verified
-- directly against `information_schema.columns` on the restored production snapshot
-- (prod_rehearsal_e2, ledger 681 / 20260912150000): `is_nullable = 'YES'`. This
-- contradicts an earlier assumption that the column was NOT NULL; it is not. An audit
-- row exists to record that an action happened; it does not need to keep the actor's
-- row alive to remain meaningful. Setting `actor_id` to NULL on delete preserves the
-- row (entity_type, entity_id, action, diff, created_at all survive untouched) while
-- letting user deletion proceed.
--
-- WHAT CHANGES. Only the FK's delete action. No column, no trigger, no RLS policy,
-- no other constraint touched.

ALTER TABLE public.audit_logs
  DROP CONSTRAINT audit_logs_actor_id_fkey;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
