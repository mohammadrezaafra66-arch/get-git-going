SET client_encoding='UTF8';

-- 513 · بازمحاسبهٔ امتیاز برای اجرای بدون‌ناظر (C-6)
--
-- مسئله‌ای که این مهاجرت حل می‌کند، اندازه‌گیری‌شده است:
-- `recompute_employee_scores_from_calls` که C-1 ساخت با
-- `gamification_assert_manager()` شروع می‌شود و آن تابع به `auth.uid()` نگاه
-- می‌کند. یعنی وقتی importer را یک ادمین از مرورگر صدا می‌زند کار می‌کند، ولی
-- وقتی cron صدایش می‌زند `auth.uid()` تهی است و خطای 42501 می‌گیرد.
--
-- بدنهٔ تابع C-1 دست نمی‌خورد. به‌جایش یک تابع جداگانه فقط برای worker اضافه
-- می‌شود که همان کار را می‌کند، همان primitive
-- (`public.calculate_employee_score`) را صدا می‌زند و همان ردیف‌های
-- `employee_score_events` را می‌نویسد، ولی assert مدیر ندارد — چون فراخوانندهٔ
-- آن اصلاً کاربر نیست.
--
-- امنیت: این تابع **فقط** به `service_role` داده می‌شود. هیچ کاربر
-- authenticated ای نمی‌تواند آن را صدا بزند، پس مسیر دور زدنِ assert مدیر
-- برای کاربران باز نمی‌شود. `proacl` بعد از اجرا اثبات می‌شود، نه فرض.

BEGIN;

CREATE OR REPLACE FUNCTION public.recompute_employee_scores_from_calls_worker(
  _since timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _emp      uuid;
  _ok       integer := 0;
  _seen     integer := 0;
  _failures jsonb := '[]'::jsonb;
BEGIN
  -- بدون assert مدیر: این تابع فقط به service_role داده شده و کاربر
  -- authenticated اصلاً به آن نمی‌رسد.
  FOR _emp IN
    SELECT DISTINCT cl.employee_id
      FROM public.call_logs cl
     WHERE cl.employee_id IS NOT NULL
       AND (_since IS NULL OR cl.created_at >= _since)
     ORDER BY 1
  LOOP
    _seen := _seen + 1;
    BEGIN
      PERFORM public.calculate_employee_score(_emp);
      _ok := _ok + 1;

      INSERT INTO public.employee_score_events
        (employee_id, event_type, source_table, source_id, payload)
      VALUES
        (_emp, 'call_batch_recompute', 'call_logs', NULL,
         jsonb_build_object('since', _since, 'actor', NULL, 'via', 'cron_worker'));
    EXCEPTION WHEN OTHERS THEN
      _failures := _failures || jsonb_build_object(
        'employee_id', _emp,
        'sqlstate',    SQLSTATE,
        'message',     SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'employees_seen',       _seen,
    'employees_recomputed', _ok,
    'failure_count',        jsonb_array_length(_failures),
    'failures',             _failures,
    'since',                _since,
    'via',                  'cron_worker'
  );
END;
$function$;

COMMENT ON FUNCTION public.recompute_employee_scores_from_calls_worker(timestamp with time zone) IS
  'C-6 · همان کار recompute_employee_scores_from_calls ولی برای اجرای بدون‌ناظر. '
  'assert مدیر ندارد چون cron کاربر نیست؛ در عوض فقط به service_role داده شده '
  'و از مرورگر قابل دسترسی نیست.';

REVOKE ALL ON FUNCTION public.recompute_employee_scores_from_calls_worker(timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_employee_scores_from_calls_worker(timestamp with time zone) FROM anon;
REVOKE ALL ON FUNCTION public.recompute_employee_scores_from_calls_worker(timestamp with time zone) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_employee_scores_from_calls_worker(timestamp with time zone) TO service_role;

COMMIT;
