CREATE OR REPLACE FUNCTION public.normalize_identifier(_kind text, _raw text, _strict boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  _t      text;
  _d      text;
  _v      text;
  _core   text;
  _sum    int := 0;
  _rem    int;
  _chk    int;
  _i      int;
  _ch     text;
  _acc    text := '';
  _part   text;
BEGIN
  IF _raw IS NULL THEN
    IF _strict THEN RAISE EXCEPTION 'مقدار شناسه نامعتبر است' USING ERRCODE='22023'; END IF;
    RETURN NULL;
  END IF;

  -- toAsciiDigits() then trim — applied to every kind, exactly as the TS does.
  _t := btrim(translate(_raw,
          '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩',
          '01234567890123456789'));

  IF length(_t) = 0 THEN
    IF _strict THEN RAISE EXCEPTION 'مقدار شناسه نمی‌تواند خالی باشد' USING ERRCODE='22023'; END IF;
    RETURN NULL;
  END IF;

  -- digitsOnly()
  _d := regexp_replace(_t, '[^0-9]', '', 'g');

  ---------------------------------------------------------------------------
  IF _kind = 'mobile_e164' THEN
    IF    _d ~ '^00989[0-9]{9}$' THEN _core := substr(_d, 5);
    ELSIF _d ~ '^989[0-9]{9}$'   THEN _core := substr(_d, 3);
    ELSIF _d ~ '^09[0-9]{9}$'    THEN _core := substr(_d, 2);
    ELSIF _d ~ '^9[0-9]{9}$'     THEN _core := _d;
    ELSE
      IF _strict THEN
        RAISE EXCEPTION 'شماره موبایل ایران معتبر نیست (مثال: 09121234567)' USING ERRCODE='22023';
      END IF;
      RETURN NULL;
    END IF;
    RETURN '+98' || _core;

  ---------------------------------------------------------------------------
  ELSIF _kind = 'landline' THEN
    IF    _d ~ '^0098[0-9]{8,12}$' THEN _d := '0' || substr(_d, 5);
    ELSIF _d ~ '^98[0-9]{8,12}$'   THEN _d := '0' || substr(_d, 3);
    END IF;
    IF _d !~ '^0[0-9]{9,11}$' THEN
      IF _strict THEN RAISE EXCEPTION 'شماره ثابت معتبر نیست' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    RETURN _d;

  ---------------------------------------------------------------------------
  ELSIF _kind = 'national_id_ir' THEN
    _d := lpad(_d, 10, '0');
    IF _d !~ '^[0-9]{10}$' THEN
      IF _strict THEN RAISE EXCEPTION 'کد ملی باید ۱۰ رقم باشد' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    -- all-identical digits are structurally invalid
    IF _d ~ '^([0-9])\1{9}$' THEN
      IF _strict THEN RAISE EXCEPTION 'کد ملی معتبر نیست' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    _sum := 0;
    FOR _i IN 1..9 LOOP
      _sum := _sum + substr(_d, _i, 1)::int * (11 - _i);
    END LOOP;
    _rem := _sum % 11;
    _chk := substr(_d, 10, 1)::int;
    IF NOT ((_rem < 2 AND _chk = _rem) OR (_rem >= 2 AND _chk = 11 - _rem)) THEN
      IF _strict THEN RAISE EXCEPTION 'کد ملی معتبر نیست' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    RETURN _d;

  ---------------------------------------------------------------------------
  ELSIF _kind = 'tax_id_ir' THEN
    IF _d !~ '^[0-9]{10,12}$' THEN
      IF _strict THEN RAISE EXCEPTION 'شناسه مالیاتی نامعتبر است' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    RETURN _d;

  ---------------------------------------------------------------------------
  ELSIF _kind = 'company_reg_id_ir' THEN
    IF _d !~ '^[0-9]{3,15}$' THEN
      IF _strict THEN RAISE EXCEPTION 'شماره ثبت شرکت نامعتبر است' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    RETURN _d;

  ---------------------------------------------------------------------------
  ELSIF _kind = 'email' THEN
    _v := lower(_t);
    IF _v !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(_v) > 254 THEN
      IF _strict THEN RAISE EXCEPTION 'ایمیل معتبر نیست' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    RETURN _v;

  ---------------------------------------------------------------------------
  ELSIF _kind = 'iban' THEN
    _v := regexp_replace(upper(_t), '[[:space:]]', '', 'g');
    IF _v ~ '^[0-9]{24}$' THEN _v := 'IR' || _v; END IF;
    IF _v !~ '^IR[0-9]{24}$' THEN
      IF _strict THEN
        RAISE EXCEPTION 'شماره شبا باید با IR شروع و ۲۴ رقم داشته باشد' USING ERRCODE='22023';
      END IF;
      RETURN NULL;
    END IF;
    -- mod-97 checksum: move first 4 chars to the end, letters -> A=10..Z=35
    _part := substr(_v, 5) || substr(_v, 1, 4);
    _acc := '';
    FOR _i IN 1..length(_part) LOOP
      _ch := substr(_part, _i, 1);
      IF _ch ~ '^[0-9]$' THEN
        _acc := _acc || _ch;
      ELSE
        _acc := _acc || (ascii(_ch) - 55)::text;
      END IF;
    END LOOP;
    _rem := 0;
    _i := 1;
    WHILE _i <= length(_acc) LOOP
      _rem := (_rem::text || substr(_acc, _i, 7))::bigint % 97;
      _i := _i + 7;
    END LOOP;
    IF _rem <> 1 THEN
      IF _strict THEN RAISE EXCEPTION 'چک‌سام شماره شبا معتبر نیست' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    RETURN _v;

  ---------------------------------------------------------------------------
  ELSIF _kind = 'custom' THEN
    _v := btrim(regexp_replace(_t, '[[:space:]]+', ' ', 'g'));
    IF length(_v) = 0 THEN
      IF _strict THEN RAISE EXCEPTION 'مقدار شناسه نمی‌تواند خالی باشد' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    IF length(_v) > 255 THEN
      IF _strict THEN RAISE EXCEPTION 'طول شناسه بیش از حد مجاز است' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    RETURN _v;

  ---------------------------------------------------------------------------
  ELSE
    IF _strict THEN RAISE EXCEPTION 'نوع شناسه پشتیبانی نمی‌شود' USING ERRCODE='22023'; END IF;
    RETURN NULL;
  END IF;
END;
$function$

