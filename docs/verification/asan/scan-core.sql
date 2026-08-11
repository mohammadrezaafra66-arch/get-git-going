-- ASAN M1.1 step 1: discover corrupted Persian text across schema public.
-- ASCII-only by construction. Safe: read-only apart from a TEMP table.
SET client_encoding='UTF8';

CREATE TEMP TABLE asan_scan (
    table_name   text,
    column_name  text,
    pk_value     text,
    current_value text,
    row_context  text
);

DO $do$
DECLARE
    tbl_rec      record;
    col_rec      record;
    pk_expr      text;
    ctx_expr     text;
    ctx_cols     text[];
    stmt         text;
BEGIN
    FOR tbl_rec IN
        SELECT cl.oid AS reloid, cl.relname AS relname
        FROM pg_class cl
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE n.nspname = 'public' AND cl.relkind = 'r'
        ORDER BY cl.relname
    LOOP
        -- primary key expression (fall back to ctid when the table has no PK)
        SELECT 'concat_ws(''/'', ' || string_agg(format('%I::text', a.attname), ', ' ORDER BY k.ord) || ')'
          INTO pk_expr
          FROM pg_constraint con
          CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
         WHERE con.conrelid = tbl_rec.reloid AND con.contype = 'p';
        IF pk_expr IS NULL THEN
            pk_expr := 'ctid::text';
        END IF;

        -- up to two human-identifying neighbour columns
        SELECT array_agg(x.attname ORDER BY x.pref)
          INTO ctx_cols
          FROM (
            SELECT a.attname,
                   array_position(ARRAY['code','key','slug','module','entity_type','name',
                                        'title','type','category','table_name','event_type',
                                        'setting_key','label'], a.attname::text) AS pref
              FROM pg_attribute a
             WHERE a.attrelid = tbl_rec.reloid AND a.attnum > 0 AND NOT a.attisdropped
               AND a.attname::text = ANY (ARRAY['code','key','slug','module','entity_type','name',
                                          'title','type','category','table_name','event_type',
                                          'setting_key','label'])
             ORDER BY pref
             LIMIT 2
          ) x;

        IF ctx_cols IS NULL THEN
            ctx_expr := '''''';
        ELSE
            SELECT 'concat_ws('' | '', ' ||
                   string_agg(format('%L || ''='' || COALESCE(%I::text, ''<null>'')', cc, cc), ', ')
                   || ')'
              INTO ctx_expr
              FROM unnest(ctx_cols) AS cc;
        END IF;

        FOR col_rec IN
            SELECT a.attname AS attname
              FROM pg_attribute a
              JOIN pg_type ty ON ty.oid = a.atttypid
             WHERE a.attrelid = tbl_rec.reloid AND a.attnum > 0 AND NOT a.attisdropped
               AND ty.typname IN ('text','varchar','bpchar')
             ORDER BY a.attnum
        LOOP
            stmt := format(
              'INSERT INTO asan_scan
               SELECT %L, %L, %s, %I::text, %s
                 FROM public.%I
                WHERE %I IS NOT NULL
                  AND ( %I ~ ''[?]{2,}''
                     OR ( %I ~ ''[?]'' AND %I ~ ''^[[:punct:][:space:]]+$'' )
                     OR position(U&''\FFFD'' in %I) > 0 )',
              tbl_rec.relname, col_rec.attname, pk_expr, col_rec.attname, ctx_expr,
              tbl_rec.relname, col_rec.attname, col_rec.attname, col_rec.attname,
              col_rec.attname, col_rec.attname);
            EXECUTE stmt;
        END LOOP;
    END LOOP;
END
$do$;

