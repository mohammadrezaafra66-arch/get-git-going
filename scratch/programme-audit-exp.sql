SELECT set_config('request.jwt.claims', '{"sub":"1a15e8c6-3a83-49c2-9531-db9046d30968","role":"authenticated"}', true);
SELECT 'SEED' AS s, blocked_reason IS NOT NULL AS blocked
  FROM asan_list_journal_export('2026-07-01','2026-08-31','receipt')
 WHERE doc_id='6d6b1896-d7ce-433e-9908-27bae8b6c003' LIMIT 1;
SELECT 'OG14' AS s, count(*) FROM asan_list_journal_export('2026-08-19','2026-08-19','all')
 WHERE doc_id IN ('2c972cd3-c440-4d76-9776-2c339b969f00','51e00e30-b55e-4851-ae00-036a6930d29d');
SELECT 'NEW54' AS s, count(*) FROM asan_list_journal_export('2026-08-19','2026-08-19','receipt')
 WHERE doc_id='d9f2eda4-a6e5-47ea-afeb-5db5eab5a1cb';
