SELECT convert_from(decode('db8cd8a7d8afd8a2d988d8b120d981d8b9d8a7d984db8cd8aa','hex'),'UTF8') AS t1;
SELECT convert_from(decode('d985d988d8b9d8af20d981d8b9d8a7d984db8cd8aa20d981d8b1d8a720d8b1d8b3db8cd8afd98720d8a7d8b3d8aa','hex'),'UTF8') AS t2;
SELECT module, role_name, can_view FROM role_permissions WHERE module='sales-activities' ORDER BY 2;
SELECT count(*) FROM information_schema.columns WHERE table_name='sales_interactions' AND column_name IN ('reminder_enabled','reminder_fired_at');
SELECT proname FROM pg_proc WHERE proname IN ('count_open_activities_due_today_or_overdue','materialize_due_activity_reminders');
