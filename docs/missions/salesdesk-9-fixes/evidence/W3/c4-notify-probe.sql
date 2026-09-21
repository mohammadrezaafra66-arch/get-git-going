SELECT encode(convert_to(
  (regexp_match(
    pg_get_functiondef('public.notify_sales_interaction_assigned()'::regprocedure),
    U&'v_title := ''([^'']+)'''
  ))[1],
  'UTF8'
), 'hex') AS title_hex_from_def;

SELECT position(
  U&'\0645\0646\0020\0645\0633\0626\0648\0644\0020\0634\062F\0645'
  IN pg_get_functiondef('public.notify_sales_interaction_assigned()'::regprocedure)
) AS title_pos;

SELECT encode(convert_to(U&'\0645\0646\0020\0645\0633\0626\0648\0644\0020\0634\062F\0645', 'UTF8'), 'hex') AS expected_title_hex;
