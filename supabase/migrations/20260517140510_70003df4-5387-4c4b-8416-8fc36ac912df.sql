-- Repair corrupted default pricing rule name caused by non-UTF8 psql client encoding
-- during a previous self-host/LAN migration run. Idempotent and safe:
--   * Only updates the known default row id, AND
--   * Only when rule_name/name is corrupted (contains only '?' characters or is null/empty)
-- Healthy rows are untouched.
update public.pricing_rules
set
  rule_name = 'قانون عمومی پیش‌فرض',
  name      = 'قانون عمومی پیش‌فرض'
where id = '730a4c42-27b2-4adc-943f-eb192353bd85'
  and (
       rule_name is null
    or rule_name = ''
    or rule_name ~ '^[?\s]+$'
    or name is null
    or name = ''
    or name ~ '^[?\s]+$'
  );

-- Generic safety net: repair any other pricing_rules row whose rule_name is
-- entirely question marks (clearly corrupted) by falling back to a healthy 'name'
-- if available. Does NOT touch rows where either column already holds real text.
update public.pricing_rules
set rule_name = name
where rule_name ~ '^[?\s]+$'
  and name is not null
  and name !~ '^[?\s]+$';

update public.pricing_rules
set name = rule_name
where name ~ '^[?\s]+$'
  and rule_name is not null
  and rule_name !~ '^[?\s]+$';
