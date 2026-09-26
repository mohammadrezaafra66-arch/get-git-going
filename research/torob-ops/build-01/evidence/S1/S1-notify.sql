SET client_encoding TO 'UTF8';

SELECT public.notify_torob_eye(
  (SELECT eye_owner_user_id FROM public.torob_ops_settings WHERE id = 1),
  'آزمایش چشم ترب',
  'رساندن اعلان به مالک روی ۳۱۰۰.',
  NULL,
  'torob_eye_probe_s1'
) AS notify_id;

SELECT count(*) AS owner_system_24h
  FROM public.notification_queue nq
  JOIN public.torob_ops_settings s ON s.id = 1
 WHERE nq.user_id = s.eye_owner_user_id
   AND nq.type = 'system'
   AND nq.created_at >= now() - interval '24 hours';
