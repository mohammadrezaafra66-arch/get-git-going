/**
 * Phase 2 — Persons Core (S07)
 *
 * Pure normalization + validation helpers for person_identifiers.
 * Client-safe (no Supabase / no process.env). Used by the server-side
 * write path in `identifiers.functions.ts` and may later be reused by UI
 * for inline feedback. The DB partial unique index in S06 is the source
 * of truth for duplicate prevention; this module only normalizes the
 * value so equal inputs become equal `value_normalized` strings.
 *
 * Supported kinds match the CHECK constraint created in S06:
 *   mobile_e164 | landline | national_id_ir | tax_id_ir |
 *   company_reg_id_ir | email | iban | custom | asan_person_code
 */

export type IdentifierKind =
  | "mobile_e164"
  | "landline"
  | "national_id_ir"
  | "tax_id_ir"
  | "company_reg_id_ir"
  | "email"
  | "iban"
  | "custom"
  | "asan_person_code";

export const IDENTIFIER_KINDS: readonly IdentifierKind[] = [
  "mobile_e164",
  "landline",
  "national_id_ir",
  "tax_id_ir",
  "company_reg_id_ir",
  "email",
  "iban",
  "custom",
  "asan_person_code",
] as const;

export type NormalizeOk = { ok: true; value_normalized: string };
export type NormalizeErr = { ok: false; error_code: string; message_fa: string };
export type NormalizeResult = NormalizeOk | NormalizeErr;

/** Convert Persian/Arabic-Indic digits to ASCII. Idempotent. */
export function toAsciiDigits(input: string): string {
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  const ar = "٠١٢٣٤٥٦٧٨٩";
  return input.replace(/[۰-۹٠-٩]/g, (d) => {
    const i = fa.indexOf(d);
    if (i !== -1) return String(i);
    return String(ar.indexOf(d));
  });
}

function digitsOnly(input: string): string {
  return toAsciiDigits(input).replace(/\D+/g, "");
}

function err(code: string, message_fa: string): NormalizeErr {
  return { ok: false, error_code: code, message_fa };
}

/** Iranian national ID checksum (10 digits). */
function isValidIranianNationalId(d: string): boolean {
  if (!/^\d{10}$/.test(d)) return false;
  if (/^(\d)\1{9}$/.test(d)) return false; // all same digit
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(d[i], 10) * (10 - i);
  const r = s % 11;
  const c = parseInt(d[9], 10);
  return (r < 2 && c === r) || (r >= 2 && c === 11 - r);
}

/** IBAN mod-97 checksum (works for any country including IR). */
function isValidIbanChecksum(iban: string): boolean {
  // Move first 4 chars to end, replace letters with digits (A=10..Z=35)
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let acc = "";
  for (const ch of rearranged) {
    if (ch >= "0" && ch <= "9") {
      acc += ch;
    } else if (ch >= "A" && ch <= "Z") {
      acc += String(ch.charCodeAt(0) - 55);
    } else {
      return false;
    }
  }
  // mod 97 over big string (chunked)
  let remainder = 0;
  for (let i = 0; i < acc.length; i += 7) {
    const part = String(remainder) + acc.slice(i, i + 7);
    remainder = Number(part) % 97;
  }
  return remainder === 1;
}

/**
 * Normalize an identifier value for a given kind.
 * Never throws — returns a discriminated result.
 */
export function normalizeIdentifier(kind: IdentifierKind, raw: string): NormalizeResult {
  if (typeof raw !== "string") return err("blank", "مقدار شناسه نامعتبر است");
  const trimmed = toAsciiDigits(raw).trim();
  if (trimmed.length === 0) return err("blank", "مقدار شناسه نمی‌تواند خالی باشد");

  switch (kind) {
    case "mobile_e164": {
      // Iran mobile only — stable E.164 form +98 9XXXXXXXXX.
      const d = digitsOnly(trimmed);
      // Accept 09XXXXXXXXX | 9XXXXXXXXX | 989XXXXXXXXX | 00989XXXXXXXXX
      let core: string | null = null;
      if (/^00989\d{9}$/.test(d)) core = d.slice(4);
      else if (/^989\d{9}$/.test(d)) core = d.slice(2);
      else if (/^09\d{9}$/.test(d)) core = d.slice(1);
      else if (/^9\d{9}$/.test(d)) core = d;
      if (!core) {
        return err("invalid_format", "شماره موبایل ایران معتبر نیست (مثال: 09121234567)");
      }
      return { ok: true, value_normalized: "+98" + core };
    }
    case "landline": {
      // Iran landline — digits-only with leading 0 (area code). Keep 10–11 digits.
      let d = digitsOnly(trimmed);
      if (/^0098\d{8,12}$/.test(d)) d = "0" + d.slice(4);
      else if (/^98\d{8,12}$/.test(d)) d = "0" + d.slice(2);
      if (!/^0\d{9,11}$/.test(d)) {
        return err("invalid_format", "شماره ثابت معتبر نیست");
      }
      return { ok: true, value_normalized: d };
    }
    case "national_id_ir": {
      const d = digitsOnly(trimmed).padStart(10, "0");
      if (!/^\d{10}$/.test(d)) {
        return err("invalid_format", "کد ملی باید ۱۰ رقم باشد");
      }
      if (!isValidIranianNationalId(d)) {
        return err("invalid_checksum", "کد ملی معتبر نیست");
      }
      return { ok: true, value_normalized: d };
    }
    case "tax_id_ir": {
      const d = digitsOnly(trimmed);
      if (!/^\d{10,12}$/.test(d)) {
        return err("invalid_format", "شناسه مالیاتی نامعتبر است");
      }
      return { ok: true, value_normalized: d };
    }
    case "company_reg_id_ir": {
      const d = digitsOnly(trimmed);
      if (!/^\d{3,15}$/.test(d)) {
        return err("invalid_format", "شماره ثبت شرکت نامعتبر است");
      }
      return { ok: true, value_normalized: d };
    }
    case "email": {
      const v = trimmed.toLowerCase();
      // Basic, conservative email pattern. Server is the only validator.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 254) {
        return err("invalid_format", "ایمیل معتبر نیست");
      }
      return { ok: true, value_normalized: v };
    }
    case "iban": {
      // Accept with/without spaces, with/without IR prefix (if 24 digits provided).
      let v = trimmed.toUpperCase().replace(/\s+/g, "");
      if (/^\d{24}$/.test(v)) v = "IR" + v;
      if (!/^IR\d{24}$/.test(v)) {
        return err("invalid_format", "شماره شبا باید با IR شروع و ۲۴ رقم داشته باشد");
      }
      if (!isValidIbanChecksum(v)) {
        return err("invalid_checksum", "چک‌سام شماره شبا معتبر نیست");
      }
      return { ok: true, value_normalized: v };
    }
    case "asan_person_code": {
      // Asan person code (کد حساب). Migration 283. Every one of the 488 codes in
      // docs/asan/reference/اشخاص.xlsx is numeric, 3–7 digits, range 127–1739003 (research
      // R5.3). `trimmed` has already had Persian/Arabic-Indic digits folded to ASCII, so a
      // paste straight out of the Asan UI normalises correctly.
      const v = trimmed.replace(/\s+/g, "");
      if (!/^\d+$/.test(v)) {
        return err("invalid_format", "کد حساب آسان باید فقط رقم باشد");
      }
      // Leading zeros are stripped so '0102012' and '102012' cannot become two codes for two
      // different people. An all-zero value would empty the string, hence the guard.
      const stripped = v.replace(/^0+/, "");
      if (stripped.length === 0) {
        return err("invalid_format", "کد حساب آسان نامعتبر است");
      }
      if (stripped.length > 20) {
        return err("invalid_format", "طول کد حساب آسان بیش از حد مجاز است");
      }
      return { ok: true, value_normalized: stripped };
    }
    case "custom": {
      // Trim + collapse internal whitespace; reject blank.
      const v = trimmed.replace(/\s+/g, " ");
      if (v.length === 0) return err("blank", "مقدار شناسه نمی‌تواند خالی باشد");
      if (v.length > 255) return err("too_long", "طول شناسه بیش از حد مجاز است");
      return { ok: true, value_normalized: v };
    }
    default: {
      // Exhaustiveness guard — should be unreachable while IdentifierKind is exact.
      const _exhaustive: never = kind;
      void _exhaustive;
      return err("unsupported_kind", "نوع شناسه پشتیبانی نمی‌شود");
    }
  }
}
