/**
 * Compose a product name from a category-defined template.
 * Tokens supported: {category} {brand} {primary_spec} {model} {capacity} {color} {sku}
 * Empty tokens are removed and adjacent whitespace is collapsed.
 * Templates are treated as plain text — no HTML interpretation.
 */

export const DEFAULT_NAMING_TEMPLATE = "{category} {brand} {primary_spec} مدل {model}";

export const NAMING_TOKENS = [
  "category",
  "brand",
  "primary_spec",
  "model",
  "capacity",
  "color",
  "sku",
] as const;

export type NamingToken = (typeof NAMING_TOKENS)[number];

export interface ComposeNameInput {
  template?: string | null;
  category?: string | null;
  brand?: string | null;
  primary_spec?: string | null;
  model?: string | null;
  capacity?: string | null;
  color?: string | null;
  sku?: string | null;
}

function clean(v: string | null | undefined): string {
  if (v == null) return "";
  // Plain text only: strip angle brackets and control chars
  return String(v).replace(/[<>]/g, "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

export function composeProductName(input: ComposeNameInput): string {
  const tpl = (input.template && input.template.trim()) || DEFAULT_NAMING_TEMPLATE;
  const values: Record<NamingToken, string> = {
    category: clean(input.category),
    brand: clean(input.brand),
    primary_spec: clean(input.primary_spec),
    model: clean(input.model),
    capacity: clean(input.capacity),
    color: clean(input.color),
    sku: clean(input.sku),
  };

  const replaced = tpl.replace(/\{(\w+)\}/g, (_m, key: string) => {
    if ((NAMING_TOKENS as readonly string[]).includes(key)) {
      return values[key as NamingToken] ?? "";
    }
    return "";
  });

  // Collapse whitespace and trim
  return replaced.replace(/\s+/g, " ").trim();
}