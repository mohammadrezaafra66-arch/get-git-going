-- AFRA-20260517-PERSONS-U01-S09
-- person_context_links: link a unified person to business contexts without
-- duplicating identity. No existing business table is touched.
-- Patterns reused from S04/S05/S06:
--   * has_any_role(uuid, app_role[])
--   * set_updated_at()
--   * audit_logs (action, entity_type, entity_id, actor_id, diff)
-- Reversible: DROP TRIGGER / DROP FUNCTION / DROP TABLE person_context_links.

-- ============================================================
-- 1. Table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.person_context_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  context_kind  text NOT NULL,
  ref_table     text NULL,
  ref_id        uuid NULL,
  note          text NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz NULL,
  created_by    uuid NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT person_context_links_context_kind_check
    CHECK (context_kind IN (
      'customer','supplier','driver','sender','receiver','referrer','marketer',
      'representative','complainant','returner','staff_link','credit_party',
      'accounting_party','delivery_party','purchase_owner','sales_expert',
      'warehouse_owner','other'
    )),
  CONSTRAINT person_context_links_ref_pair_check
    CHECK (
      (ref_table IS NULL AND ref_id IS NULL)
      OR (ref_table IS NOT NULL AND ref_id IS NOT NULL)
    ),
  CONSTRAINT person_context_links_time_range_check
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

COMMENT ON TABLE  public.person_context_links IS
  'Links a unified person to business contexts (AFRA-Persons S09). Identity stays in persons; this table only records role/context.';
COMMENT ON COLUMN public.person_context_links.context_kind IS
  'Approved enum (text): customer, supplier, driver, sender, receiver, referrer, marketer, representative, complainant, returner, staff_link, credit_party, accounting_party, delivery_party, purchase_owner, sales_expert, warehouse_owner, other.';
COMMENT ON COLUMN public.person_context_links.ref_table IS
  'Optional pointer to a concrete business table (e.g. customers, suppliers). NULL = general context tagging only.';
COMMENT ON COLUMN public.person_context_links.ref_id IS
  'Optional row id in ref_table. Must be set together with ref_table or both NULL.';
COMMENT ON COLUMN public.person_context_links.ended_at IS
  'Soft end-of-context. DELETE is not exposed; closures happen by setting ended_at.';

-- ============================================================
-- 2. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_pcl_person_id      ON public.person_context_links (person_id);
CREATE INDEX IF NOT EXISTS idx_pcl_context_kind   ON public.person_context_links (context_kind);
CREATE INDEX IF NOT EXISTS idx_pcl_ref            ON public.person_context_links (ref_table, ref_id);
CREATE INDEX IF NOT EXISTS idx_pcl_ended_at       ON public.person_context_links (ended_at);

-- Prevent duplicate active links to the same concrete business row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pcl_active_ref
  ON public.person_context_links (person_id, context_kind, ref_table, ref_id)
  WHERE ended_at IS NULL AND ref_table IS NOT NULL AND ref_id IS NOT NULL;

-- ============================================================
-- 3. updated_at trigger
-- ============================================================
DROP TRIGGER IF EXISTS trg_pcl_set_updated_at ON public.person_context_links;
CREATE TRIGGER trg_pcl_set_updated_at
  BEFORE UPDATE ON public.person_context_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 4. Audit triggers (same pattern as audit_persons_*)
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_person_context_links_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES (
    'person.context_link.add', 'person_context_link', NEW.id::text, auth.uid(),
    jsonb_build_object(
      'person_id',    NEW.person_id,
      'context_kind', NEW.context_kind,
      'ref_table',    NEW.ref_table,
      'ref_id',       NEW.ref_id,
      'started_at',   NEW.started_at
    )
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.audit_person_context_links_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_diff jsonb := '{}'::jsonb;
BEGIN
  -- Dedicated remove event when ended_at transitions from NULL to a value.
  IF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES (
      'person.context_link.remove', 'person_context_link', NEW.id::text, auth.uid(),
      jsonb_build_object(
        'person_id',    NEW.person_id,
        'context_kind', NEW.context_kind,
        'ref_table',    NEW.ref_table,
        'ref_id',       NEW.ref_id,
        'ended_at',     NEW.ended_at
      )
    );
  END IF;

  IF NEW.context_kind IS DISTINCT FROM OLD.context_kind THEN v_diff := v_diff || jsonb_build_object('context_kind', jsonb_build_object('old', OLD.context_kind, 'new', NEW.context_kind)); END IF;
  IF NEW.ref_table    IS DISTINCT FROM OLD.ref_table    THEN v_diff := v_diff || jsonb_build_object('ref_table',    jsonb_build_object('old', OLD.ref_table,    'new', NEW.ref_table));    END IF;
  IF NEW.ref_id       IS DISTINCT FROM OLD.ref_id       THEN v_diff := v_diff || jsonb_build_object('ref_id',       jsonb_build_object('old', OLD.ref_id,       'new', NEW.ref_id));       END IF;
  IF NEW.note         IS DISTINCT FROM OLD.note         THEN v_diff := v_diff || jsonb_build_object('note',         jsonb_build_object('old', OLD.note,         'new', NEW.note));         END IF;
  IF NEW.started_at   IS DISTINCT FROM OLD.started_at   THEN v_diff := v_diff || jsonb_build_object('started_at',   jsonb_build_object('old', OLD.started_at,   'new', NEW.started_at));   END IF;
  IF NEW.ended_at     IS DISTINCT FROM OLD.ended_at     THEN v_diff := v_diff || jsonb_build_object('ended_at',     jsonb_build_object('old', OLD.ended_at,     'new', NEW.ended_at));     END IF;

  IF v_diff <> '{}'::jsonb THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES ('person.context_link.update', 'person_context_link', NEW.id::text, auth.uid(), v_diff);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pcl_audit_insert ON public.person_context_links;
CREATE TRIGGER trg_pcl_audit_insert
  AFTER INSERT ON public.person_context_links
  FOR EACH ROW EXECUTE FUNCTION public.audit_person_context_links_insert();

DROP TRIGGER IF EXISTS trg_pcl_audit_update ON public.person_context_links;
CREATE TRIGGER trg_pcl_audit_update
  AFTER UPDATE ON public.person_context_links
  FOR EACH ROW EXECUTE FUNCTION public.audit_person_context_links_update();

-- ============================================================
-- 5. RLS
-- ============================================================
ALTER TABLE public.person_context_links ENABLE ROW LEVEL SECURITY;

-- SELECT — gated by parent-person visibility. Persons RLS is applied to the
-- EXISTS subquery, so a user can see a link only if they can see the person.
DROP POLICY IF EXISTS person_context_links_select_via_person ON public.person_context_links;
CREATE POLICY person_context_links_select_via_person
  ON public.person_context_links
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_context_links.person_id
    )
  );

-- INSERT — admin/manager only.
DROP POLICY IF EXISTS person_context_links_insert_admin_manager ON public.person_context_links;
CREATE POLICY person_context_links_insert_admin_manager
  ON public.person_context_links
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])
  );

-- UPDATE — admin/manager only.
DROP POLICY IF EXISTS person_context_links_update_admin_manager ON public.person_context_links;
CREATE POLICY person_context_links_update_admin_manager
  ON public.person_context_links
  FOR UPDATE
  TO authenticated
  USING (
    has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])
  )
  WITH CHECK (
    has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])
  );

-- NOTE: No DELETE policy. Ending a context is modeled by setting ended_at.