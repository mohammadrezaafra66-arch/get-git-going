/**
 * Shared winner suggestion for /persons/merge (single + bulk).
 * person_merge stays human-confirmed; this only picks the default keep side.
 */

export type MergeSideEvidence = {
  id: string;
  display_name: string;
  legal_name: string | null;
  is_active: boolean;
  has_customer: boolean;
  has_supplier: boolean;
  has_external_party: boolean;
  reference_count: number;
  created_at: string;
  identifiers: {
    kind: string;
    status: string;
  }[];
};

export type SuggestedSide = "a" | "b";

export type SuggestWinnerReason =
  | "blocked"
  | "inactive"
  | "commercial_role"
  | "hard_identity"
  | "reference_count"
  | "external_party"
  | "confirmed_identifiers"
  | "older"
  | "fallback_a";

export type SuggestWinnerResult =
  | { side: SuggestedSide; reason: Exclude<SuggestWinnerReason, "blocked">; label: string }
  | { side: null; reason: "blocked"; label: string };

const HARD_KINDS = new Set(["mobile_e164", "asan_person_code"]);

const REASON_LABEL: Record<SuggestWinnerReason, string> = {
  blocked: "ادغام مسدود است",
  inactive: "طرف فعال",
  commercial_role: "مالک پروندهٔ مشتری/تأمین‌کننده",
  hard_identity: "دارای موبایل یا کد آسان",
  reference_count: "ارجاع کسب‌وکاری بیشتر",
  external_party: "طرف حساب خارجی",
  confirmed_identifiers: "شناسهٔ تأییدشده بیشتر",
  older: "سابقهٔ قدیمی‌تر",
  fallback_a: "پیش‌فرض سمت اول",
};

function hasHardId(side: MergeSideEvidence): boolean {
  return side.identifiers.some(
    (i) => HARD_KINDS.has(i.kind) && i.status !== "revoked",
  );
}

function confirmedIdCount(side: MergeSideEvidence): number {
  return side.identifiers.filter((i) => i.status === "confirmed").length;
}

function commercialScore(side: MergeSideEvidence): number {
  return (side.has_customer ? 1 : 0) + (side.has_supplier ? 1 : 0);
}

/**
 * Rank keep-side. Returns null side only when merge is blocked upstream.
 * Callers must pass blocked=true when person_merge would refuse the pair.
 */
export function suggestMergeWinner(
  a: MergeSideEvidence,
  b: MergeSideEvidence,
  blocked: boolean,
): SuggestWinnerResult {
  if (blocked) {
    return { side: null, reason: "blocked", label: REASON_LABEL.blocked };
  }

  if (a.is_active !== b.is_active) {
    const side: SuggestedSide = a.is_active ? "a" : "b";
    return { side, reason: "inactive", label: REASON_LABEL.inactive };
  }

  const ca = commercialScore(a);
  const cb = commercialScore(b);
  if (ca !== cb) {
    const side: SuggestedSide = ca > cb ? "a" : "b";
    return { side, reason: "commercial_role", label: REASON_LABEL.commercial_role };
  }

  const ha = hasHardId(a);
  const hb = hasHardId(b);
  if (ha !== hb) {
    const side: SuggestedSide = ha ? "a" : "b";
    return { side, reason: "hard_identity", label: REASON_LABEL.hard_identity };
  }

  if (a.reference_count !== b.reference_count) {
    const side: SuggestedSide = a.reference_count > b.reference_count ? "a" : "b";
    return { side, reason: "reference_count", label: REASON_LABEL.reference_count };
  }

  if (a.has_external_party !== b.has_external_party) {
    const side: SuggestedSide = a.has_external_party ? "a" : "b";
    return { side, reason: "external_party", label: REASON_LABEL.external_party };
  }

  const ia = confirmedIdCount(a);
  const ib = confirmedIdCount(b);
  if (ia !== ib) {
    const side: SuggestedSide = ia > ib ? "a" : "b";
    return {
      side,
      reason: "confirmed_identifiers",
      label: REASON_LABEL.confirmed_identifiers,
    };
  }

  const ta = Date.parse(a.created_at);
  const tb = Date.parse(b.created_at);
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) {
    const side: SuggestedSide = ta < tb ? "a" : "b";
    return { side, reason: "older", label: REASON_LABEL.older };
  }

  return { side: "a", reason: "fallback_a", label: REASON_LABEL.fallback_a };
}

/** Bulk-safe reasons only (v1). same_name alone stays manual. */
export const BULK_SAFE_REASONS = new Set(["shared_identifier", "same_name_incomplete"]);

export const BULK_MERGE_MAX = 25;
export const BULK_CONFIRM_PHRASE = "ادغام گروهی";

export function isBulkMergeEligible(input: {
  blocked_reason: string | null;
  reason: string;
  a: { is_active: boolean };
  b: { is_active: boolean };
}): boolean {
  if (input.blocked_reason) return false;
  if (!BULK_SAFE_REASONS.has(input.reason)) return false;
  if (!input.a.is_active || !input.b.is_active) return false;
  return true;
}

export function suggestWinnerLabel(result: SuggestWinnerResult): string {
  return result.label;
}
