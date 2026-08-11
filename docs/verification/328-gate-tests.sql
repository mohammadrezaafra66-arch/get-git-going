SET client_encoding='UTF8';
\set ON_ERROR_STOP off

\echo ''
\echo '################ TEST 1 — adding an UNREGISTERED FK to persons must abort ################'
BEGIN;
\i /tmp/mig328.sql
-- Exactly what migrations 270, 285 and 319 did: add a persons FK, register nothing.
CREATE TABLE public.zz_gate_probe (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid REFERENCES public.persons(id)
);
\echo '^^^ if no error appeared above, THE GATE FAILED'
ROLLBACK;

\echo ''
\echo '################ TEST 2 — ALTER TABLE ADD CONSTRAINT must abort too ################'
BEGIN;
\i /tmp/mig328.sql
CREATE TABLE public.zz_gate_probe2 (id uuid PRIMARY KEY, person_id uuid);
ALTER TABLE public.zz_gate_probe2
  ADD CONSTRAINT zz_gate_probe2_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.persons(id);
\echo '^^^ if no error appeared above, THE GATE FAILED'
ROLLBACK;

\echo ''
\echo '################ TEST 3 — the STALE direction (the invoices scenario) must abort ################'
BEGIN;
\i /tmp/mig328.sql
-- Renaming invoices makes its registered key point at a table that no longer exists,
-- which is exactly the state a DROP would leave behind.
ALTER TABLE public.invoices RENAME TO zz_invoices_gone;
\echo '^^^ if no error appeared above, THE GATE FAILED'
ROLLBACK;

\echo ''
\echo '################ TEST 4 — a table with NO persons FK must still be allowed ################'
BEGIN;
\i /tmp/mig328.sql
CREATE TABLE public.zz_gate_probe3 (id uuid PRIMARY KEY, note text);
ALTER TABLE public.zz_gate_probe3 ADD COLUMN extra text;
\echo '^^^ expected: no error — the gate must not block unrelated DDL'
SELECT count(*) AS still_balanced_rows_with_problems
  FROM public.person_fk_registry_report() WHERE verdict <> 'ok';
ROLLBACK;

\echo ''
\echo '################ AFTER: nothing persisted ################'
SELECT to_regclass('public.zz_gate_probe')  AS probe1_should_be_null,
       to_regclass('public.zz_gate_probe2') AS probe2_should_be_null,
       to_regclass('public.zz_gate_probe3') AS probe3_should_be_null,
       to_regclass('public.invoices')       AS invoices_should_exist,
       (SELECT count(*) FROM pg_event_trigger WHERE evtname='trg_person_fk_registry_gate') AS gate_should_be_0_until_applied;
