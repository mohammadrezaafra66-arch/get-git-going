-- Cleanup for E2E-COLLAB-20260921-2352
-- DO NOT RUN automatically. Review then execute manually on TEST DB only (afrakala).
-- ASCII-only. Targets rows created by collab E2E prefix.

BEGIN;

-- Soft-deactivate groups created by this run
UPDATE public.messenger_groups
SET is_active = false
WHERE name LIKE 'E2E-COLLAB-20260921-2352%';

-- Optional hard cleanup (commented — prefer deactivate first):
-- DELETE FROM public.messenger_read_receipts
-- WHERE message_id IN (
--   SELECT m.id FROM public.messenger_messages m
--   JOIN public.messenger_groups g ON g.id = m.group_id
--   WHERE g.name LIKE 'E2E-COLLAB-20260921-2352%'
-- );
-- DELETE FROM public.messenger_attachments
-- WHERE message_id IN (
--   SELECT m.id FROM public.messenger_messages m
--   JOIN public.messenger_groups g ON g.id = m.group_id
--   WHERE g.name LIKE 'E2E-COLLAB-20260921-2352%'
-- );
-- DELETE FROM public.inquiry_replies
-- WHERE inquiry_id IN (
--   SELECT i.id FROM public.inquiries i
--   JOIN public.messenger_groups g ON g.id = i.group_id
--   WHERE g.name LIKE 'E2E-COLLAB-20260921-2352%'
-- );
-- DELETE FROM public.inquiry_status_history
-- WHERE inquiry_id IN (
--   SELECT i.id FROM public.inquiries i
--   JOIN public.messenger_groups g ON g.id = i.group_id
--   WHERE g.name LIKE 'E2E-COLLAB-20260921-2352%'
-- );
-- DELETE FROM public.inquiry_transfers
-- WHERE inquiry_id IN (
--   SELECT i.id FROM public.inquiries i
--   JOIN public.messenger_groups g ON g.id = i.group_id
--   WHERE g.name LIKE 'E2E-COLLAB-20260921-2352%'
-- );
-- DELETE FROM public.inquiries
-- WHERE group_id IN (
--   SELECT id FROM public.messenger_groups WHERE name LIKE 'E2E-COLLAB-20260921-2352%'
-- );
-- DELETE FROM public.messenger_messages
-- WHERE group_id IN (
--   SELECT id FROM public.messenger_groups WHERE name LIKE 'E2E-COLLAB-20260921-2352%'
-- );
-- DELETE FROM public.messenger_group_members
-- WHERE group_id IN (
--   SELECT id FROM public.messenger_groups WHERE name LIKE 'E2E-COLLAB-20260921-2352%'
-- );
-- DELETE FROM public.messenger_groups
-- WHERE name LIKE 'E2E-COLLAB-20260921-2352%';

COMMIT;
