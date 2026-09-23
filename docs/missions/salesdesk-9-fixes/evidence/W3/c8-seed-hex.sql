-- C8 seed hex for «سایر»
SELECT id,
       title,
       encode(convert_to(title, 'UTF8'), 'hex') AS title_hex
FROM public.deal_lost_reasons
ORDER BY sort_order, created_at;
