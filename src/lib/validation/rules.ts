import { supabase } from "@/integrations/supabase/client";

export type ValidationScope = "receipt" | "journal_entry" | "invoice" | "purchase";
export type ValidationRuleType = "required" | "accounting_code_valid";
export type ValidationSeverity = "warning" | "blocking";

export interface ValidationRule {
  id: string;
  scope: ValidationScope;
  field_key: string;
  rule_type: ValidationRuleType;
  enabled: boolean;
  severity: ValidationSeverity;
  message: string;
}

export interface RuleViolation {
  rule: ValidationRule;
}

export async function fetchValidationRules(scope: ValidationScope): Promise<ValidationRule[]> {
  const { data, error } = await supabase
    .from("validation_rules" as never)
    .select("id, scope, field_key, rule_type, enabled, severity, message")
    .eq("scope", scope as never);
  if (error) throw error;
  return (data ?? []) as unknown as ValidationRule[];
}

/**
 * Evaluate validation rules against a field-value map.
 * `validCodes` is a set of accounting codes that exist in the system.
 */
export function evaluateRules(
  rules: ValidationRule[],
  values: Record<string, unknown>,
  validCodes?: Set<string>,
): RuleViolation[] {
  const out: RuleViolation[] = [];
  for (const r of rules) {
    if (!r.enabled) continue;
    const raw = values[r.field_key];
    const v = typeof raw === "string" ? raw.trim() : raw;

    if (r.rule_type === "required") {
      if (v === undefined || v === null || v === "") {
        out.push({ rule: r });
      }
    } else if (r.rule_type === "accounting_code_valid") {
      if (typeof v === "string" && v.length > 0 && validCodes && !validCodes.has(v)) {
        out.push({ rule: r });
      }
    }
  }
  return out;
}

export function splitViolations(violations: RuleViolation[]) {
  return {
    blocking: violations.filter((v) => v.rule.severity === "blocking"),
    warnings: violations.filter((v) => v.rule.severity === "warning"),
  };
}
