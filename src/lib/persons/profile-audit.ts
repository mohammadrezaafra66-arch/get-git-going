/**
 * Phase 5 — redact person-related audit rows for dossier display.
 * Never surfaces identifier/alias values from diff JSON.
 */

export type AuditSummaryRow = {
  id: string;
  action: string;
  entity_type: string;
  actor_id: string | null;
  created_at: string;
  label: string;
};

const ACTION_LABEL: Record<string, string> = {
  "person.create": "ایجاد شخص",
  "person.update": "به‌روزرسانی شخص",
  "person.identifier.add": "افزودن شناسه",
  "person.identifier.update": "تغییر شناسه",
  "person.identifier.revoke": "ابطال شناسه",
  "person.context_link.add": "افزودن ارتباط",
  "person.context_link.end": "پایان ارتباط",
  "person.context_link.update": "به‌روزرسانی ارتباط",
  "person_alias.create": "افزودن نام دیگر",
  "person_alias.update": "ویرایش نام دیگر",
  "person_alias.delete": "حذف نام دیگر",
  "person_merge": "ادغام اشخاص",
  "person_merge.dismiss": "رد نامزد ادغام",
};

export function summarizePersonAuditAction(
  action: string,
  entityType: string,
  diff: unknown,
): string {
  if (ACTION_LABEL[action]) return ACTION_LABEL[action];

  if (entityType === "person_alias" || action.startsWith("person_alias.")) {
    if (action.includes("delete")) return "حذف نام دیگر";
    if (action.includes("update")) return "ویرایش نام دیگر";
    return "رویداد نام دیگر";
  }
  if (entityType === "person_identifier" || action.includes("identifier")) {
    return "رویداد شناسه";
  }
  if (entityType === "person_context_link" || action.includes("context_link")) {
    return "رویداد ارتباط";
  }
  if (entityType === "person" || entityType === "persons") {
    if (diff && typeof diff === "object" && !Array.isArray(diff)) {
      const keys = Object.keys(diff as Record<string, unknown>).filter(
        (k) => k !== "person_id" && k !== "before",
      );
      if (keys.length) return `به‌روزرسانی فیلدها: ${keys.slice(0, 4).join("، ")}`;
    }
    return "رویداد پرونده شخص";
  }
  return action || "رویداد";
}
