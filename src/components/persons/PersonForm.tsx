import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PERSON_KINDS,
  PERSON_VISIBILITY_SCOPES,
  type PersonKind,
  type PersonVisibilityScope,
} from "@/lib/persons/schemas";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import {
  PersonIdentifiersForm,
  type DraftIdentifier,
} from "@/components/persons/PersonIdentifiersForm";

export interface PersonFormValues {
  kind: PersonKind;
  display_name: string;
  legal_name: string;
  visibility_scope: PersonVisibilityScope;
  is_active: boolean;
  notes: string;
  /**
   * Phase 6.4 — identifiers collected on the CREATE page, so a person can be
   * created with a mobile/national-id in one flow instead of create-then-edit.
   * Empty on the edit page, where identifiers are managed against a saved row.
   */
  identifiers: DraftIdentifier[];
}

const KIND_LABEL: Record<PersonKind, string> = {
  individual: "حقیقی",
  organization: "حقوقی",
};
const SCOPE_LABEL: Record<PersonVisibilityScope, string> = {
  internal_general: "داخلی - عمومی",
  restricted_finance: "محدود - مالی",
  restricted_executive: "محدود - مدیریتی",
};

export function PersonForm({
  initial,
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
  allowIdentifiers = false,
}: {
  initial?: Partial<PersonFormValues>;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (values: PersonFormValues) => void;
  onCancel?: () => void;
  /**
   * Phase 6.4 — render the identifiers section inline. Only the create page
   * sets this: on the edit page identifiers are managed separately against a
   * persisted person, and showing a draft list there would be two sources of
   * truth for the same data.
   */
  allowIdentifiers?: boolean;
}) {
  const [values, setValues] = useState<PersonFormValues>({
    kind: initial?.kind ?? "individual",
    display_name: initial?.display_name ?? "",
    legal_name: initial?.legal_name ?? "",
    visibility_scope: initial?.visibility_scope ?? "internal_general",
    is_active: initial?.is_active ?? true,
    notes: initial?.notes ?? "",
    identifiers: initial?.identifiers ?? [],
  });
  const [error, setError] = useState<string | null>(null);

  /**
   * Blocker B1 — visibility_scope must not be freely selectable.
   *
   * RLS (`persons_insert_identity_authors`, migration 226) lets sales and
   * accountant create persons ONLY at visibility_scope='internal_general'.
   * Offering them the full three-way picker guarantees a 42501 the moment they
   * choose anything else — an error the user cannot act on.
   *
   * Note this reads the CURRENT value rather than forcing 'internal_general':
   * an accountant can legitimately SEE a restricted_finance person, and blindly
   * overwriting the field would silently DOWNGRADE that person's visibility.
   * (persons UPDATE is admin/manager-only anyway, so the edit path is not
   * reachable for them — this is defence in depth, not decoration.)
   */
  const { roles } = useAuth();
  const canSetVisibilityScope = hasAnyRole(roles, ["admin", "manager"]);

  function set<K extends keyof PersonFormValues>(k: K, v: PersonFormValues[K]) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!values.display_name.trim()) {
      setError("نام نمایشی الزامی است");
      return;
    }
    onSubmit(values);
  }

  return (
    <form dir="rtl" onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          {/* Phase 6.5 — labels wired to their controls (htmlFor/id), matching
              the convention PersonModal already used. Radix Select needs the id
              on the trigger, which is the element exposed to assistive tech. */}
          <Label htmlFor="pf-kind">نوع شخص</Label>
          <Select value={values.kind} onValueChange={(v) => set("kind", v as PersonKind)}>
            <SelectTrigger id="pf-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERSON_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pf-scope">سطح دسترسی</Label>
          {canSetVisibilityScope ? (
            <Select
              value={values.visibility_scope}
              onValueChange={(v) => set("visibility_scope", v as PersonVisibilityScope)}
            >
              <SelectTrigger id="pf-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERSON_VISIBILITY_SCOPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SCOPE_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <>
              <div
                className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground"
                aria-readonly="true"
              >
                {SCOPE_LABEL[values.visibility_scope]}
              </div>
              <p className="text-xs text-muted-foreground">
                تغییر سطح دسترسی فقط توسط مدیر سیستم انجام می‌شود.
              </p>
            </>
          )}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="pf-display-name">نام نمایشی *</Label>
          <Input
            id="pf-display-name"
            value={values.display_name}
            onChange={(e) => set("display_name", e.target.value)}
            maxLength={255}
            required
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="pf-legal-name">نام رسمی / قانونی</Label>
          <Input
            id="pf-legal-name"
            value={values.legal_name}
            onChange={(e) => set("legal_name", e.target.value)}
            maxLength={255}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="pf-notes">یادداشت</Label>
          <Textarea
            id="pf-notes"
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Switch
            checked={values.is_active}
            onCheckedChange={(v) => set("is_active", v)}
            id="is_active"
          />
          <Label htmlFor="is_active">فعال</Label>
        </div>
      </div>

      {allowIdentifiers && (
        <div className="space-y-3 rounded-md border p-4">
          <div>
            <h3 className="text-sm font-medium">شناسه‌ها</h3>
            <p className="text-xs text-muted-foreground">
              شناسه‌ها همراه با ثبت شخص ذخیره و روی سرور نرمال‌سازی می‌شوند.
            </p>
          </div>
          <PersonIdentifiersForm
            identifiers={[]}
            canManage
            draft={{
              items: values.identifiers,
              onAdd: (item) => set("identifiers", [...values.identifiers, item]),
              onRemove: (index) =>
                set(
                  "identifiers",
                  values.identifiers.filter((_, i) => i !== index),
                ),
            }}
          />
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            انصراف
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
