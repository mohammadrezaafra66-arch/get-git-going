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
  /**
   * Category-specific dynamic attributes keyed by `attribute_key`.
   * Used for `{attr:<key>}` tokens. Attributes flagged with
   * `use_in_product_name` are appended at the end if not already
   * referenced in the template.
   */
  dynamic_attrs?: Record<string, string>;
  /** Ordered list of attribute_keys flagged use_in_product_name=true. */
  use_in_name_keys?: string[];
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

  const dyn = input.dynamic_attrs ?? {};
  const referencedAttrKeys = new Set<string>();

  // Replace {attr:key} tokens first so we can track which keys were used.
  let replaced = tpl.replace(/\{attr:([A-Za-z0-9_]+)\}/g, (_m, key: string) => {
    referencedAttrKeys.add(key);
    return clean(dyn[key]);
  });

  // Replace simple tokens
  replaced = replaced.replace(/\{(\w+)\}/g, (_m, key: string) => {
    if ((NAMING_TOKENS as readonly string[]).includes(key)) {
      return values[key as NamingToken] ?? "";
    }
    return "";
  });

  // Append values flagged use_in_product_name that were NOT referenced explicitly.
  const appendKeys = (input.use_in_name_keys ?? []).filter(
    (k) => !referencedAttrKeys.has(k),
  );
  const appended: string[] = [];
  for (const k of appendKeys) {
    const v = clean(dyn[k]);
    if (v) appended.push(v);
  }
  if (appended.length > 0) {
    replaced = `${replaced} ${appended.join(" ")}`;
  }

  // Collapse whitespace and trim
  return replaced.replace(/\s+/g, " ").trim();
}