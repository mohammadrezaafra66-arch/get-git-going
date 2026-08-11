"""Rebuild normalize_identifier() from its LIVE definition, adding one branch.

Rule 2.3: build from live text, never from a file and never from memory. The only change is
a new `asan_person_code` branch inserted immediately before the ELSE that rejects unknown
kinds; every other byte is carried over.
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
ROOT = r"D:\AfraKalaTest\app"

live = open(f"{ROOT}/docs/verification/pre-283/normalize_identifier.sql",
            encoding="utf-8-sig").read().replace("\r\n", "\n").strip()

ANCHOR = """  ---------------------------------------------------------------------------
  ELSE
    IF _strict THEN RAISE EXCEPTION 'نوع شناسه پشتیبانی نمی‌شود' USING ERRCODE='22023'; END IF;"""
assert live.count(ANCHOR) == 1, live.count(ANCHOR)

NEW_BRANCH = """  ---------------------------------------------------------------------------
  -- Asan person code (کد حساب). Migration 283. Digits only: every one of the 488 codes in
  -- docs/asan/reference/اشخاص.xlsx is numeric, 3-7 digits, range 127-1739003 (research R5.3).
  -- _t has already had Persian/Arabic-Indic digits folded to ASCII and been trimmed above,
  -- so a paste from the Asan UI normalises correctly without extra handling here.
  ELSIF _kind = 'asan_person_code' THEN
    _v := regexp_replace(_t, '[[:space:]]+', '', 'g');
    IF _v !~ '^[0-9]+$' THEN
      IF _strict THEN RAISE EXCEPTION 'کد حساب آسان باید فقط رقم باشد' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    -- Leading zeros are stripped so '0102012' and '102012' cannot become two codes for two
    -- different people; ltrim of an all-zero value would empty it, hence the guard.
    _v := ltrim(_v, '0');
    IF length(_v) = 0 THEN
      IF _strict THEN RAISE EXCEPTION 'کد حساب آسان نامعتبر است' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    IF length(_v) > 20 THEN
      IF _strict THEN RAISE EXCEPTION 'طول کد حساب آسان بیش از حد مجاز است' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    RETURN _v;

"""

fixed = live.replace(ANCHOR, NEW_BRANCH + ANCHOR)
assert "asan_person_code" in fixed
assert fixed != live
open(f"{ROOT}/docs/verification/pre-283/normalize_identifier.fixed.sql", "w",
     encoding="utf-8", newline="\n").write(fixed + ";\n")
print("written, delta lines:", len(fixed.split("\n")) - len(live.split("\n")))
