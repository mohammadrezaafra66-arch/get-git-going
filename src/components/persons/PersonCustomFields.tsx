/**
 * Wave 6 B-4 — the custom-fields section of a person profile.
 *
 * Renders `person_field_values` against their `person_field_definitions`, and lets an
 * admin/manager fill them in. Before this component nothing in `src/*.tsx` mentioned
 * `person_field` at all, although the whole server side had been finished for months.
 *
 * Only ACTIVE definitions that apply to this person's kind are offered, so a field scoped to
 * organisations never appears on an individual. A value that was recorded and whose definition
 * has since been deactivated is still SHOWN — hiding recorded history because someone turned a
 * field off would silently lose information — but it is marked and cannot be edited.
 *
 * Writing is gated on `persons.update`, which matches the live policies
 * `pfv_update_admin_manager` and `pfv_insert_identity_authors`. The database is the enforcement;
 * hiding the inputs is only a courtesy, and a refusal comes back as the database's own message.
 *
 * Seven field types, and boolean is `'bool'` — see lib/persons/field-definitions.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermissionEx } from "@/lib/rbac/roles";
import {
  PERSON_FIELD_TYPE_FA,
  formatFieldValue,
  listPersonFieldDefinitions,
  listPersonFieldValues,
  type PersonFieldDefinition,
} from "@/lib/persons/field-definitions";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  personId: string;
  /** 'individual' | 'organization' — used to pick which definitions apply. */
  personKind?: string | null;
}

/** Upsert one value. `person_field_values` is unique on (person_id, field_definition_id). */
async function savePersonFieldValue(input: {
  personId: string;
  definitionId: string;
  value: unknown;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("person_field_values").upsert(
    {
      person_id: input.personId,
      field_definition_id: input.definitionId,
      value: input.value as never,
      updated_by: auth.user?.id ?? null,
    } as never,
    { onConflict: "person_id,field_definition_id" },
  );
  if (error) throw new Error(error.message);
}

export function PersonCustomFields({ personId, personKind }: Props) {
  const { roles, permissionsLoading } = useAuth();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const canEdit = hasPermissionEx(roles, "persons", "update");

  const defsQuery = useQuery({
    queryKey: ["person-field-definitions"],
    queryFn: listPersonFieldDefinitions,
  });
  const valuesQuery = useQuery({
    queryKey: ["person-field-values", personId],
    queryFn: () => listPersonFieldValues(personId),
    enabled: Boolean(personId),
  });

  const saveMutation = useMutation({
    mutationFn: savePersonFieldValue,
    onSuccess: () => {
      toast.success("مقدار ذخیره شد");
      void queryClient.invalidateQueries({ queryKey: ["person-field-values", personId] });
    },
    onError: (e: Error) => toast.error("ذخیره ناموفق بود", { description: e.message }),
  });

  const valueByDef = useMemo(() => {
    const m = new Map<string, unknown>();
    for (const v of valuesQuery.data ?? []) m.set(v.field_definition_id, v.value);
    return m;
  }, [valuesQuery.data]);

  const applicable = useMemo(() => {
    const all = defsQuery.data ?? [];
    return all.filter((d) => {
      // A recorded value keeps its row visible even if the definition was deactivated.
      if (!d.is_active) return valueByDef.has(d.id);
      if (d.applies_to_kind === "both") return true;
      if (!personKind) return true;
      return d.applies_to_kind === personKind;
    });
  }, [defsQuery.data, personKind, valueByDef]);

  if (permissionsLoading || defsQuery.isLoading || valuesQuery.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          در حال بارگذاری فیلدهای سفارشی…
        </CardContent>
      </Card>
    );
  }

  if (applicable.length === 0) return null;

  const renderInput = (d: PersonFieldDefinition) => {
    const current = valueByDef.get(d.id);
    const draftKey = d.id;
    const draft = drafts[draftKey];

    if (d.field_type === "bool") {
      return (
        <Switch
          checked={current === true || current === "true"}
          disabled={!canEdit || !d.is_active || saveMutation.isPending}
          onCheckedChange={(v) => saveMutation.mutate({ personId, definitionId: d.id, value: v })}
        />
      );
    }

    if (d.field_type === "select") {
      const opts = Array.isArray(d.options) ? (d.options as string[]) : [];
      return (
        <Select
          value={typeof current === "string" ? current : ""}
          disabled={!canEdit || !d.is_active}
          onValueChange={(v) => saveMutation.mutate({ personId, definitionId: d.id, value: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="انتخاب کنید" />
          </SelectTrigger>
          <SelectContent>
            {opts.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    // text / number / date / multiselect / jsonb all edit as text and are validated by the
    // table's own trigger, which is the authority on what each type accepts.
    return (
      <div className="flex gap-2">
        <Input
          type={d.field_type === "date" ? "date" : d.field_type === "number" ? "number" : "text"}
          value={draft ?? (current === null || current === undefined ? "" : String(current))}
          disabled={!canEdit || !d.is_active}
          placeholder={d.help_text ?? ""}
          onChange={(e) => setDrafts((s) => ({ ...s, [draftKey]: e.target.value }))}
        />
        {canEdit && d.is_active && draft !== undefined && (
          <Button
            size="sm"
            disabled={saveMutation.isPending}
            onClick={() => {
              const raw = draft;
              const value =
                d.field_type === "number"
                  ? Number(raw)
                  : d.field_type === "multiselect"
                    ? raw
                        .split(/[\n,،]/)
                        .map((s) => s.trim())
                        .filter(Boolean)
                    : raw;
              saveMutation.mutate({ personId, definitionId: d.id, value });
              setDrafts((s) => {
                const next = { ...s };
                delete next[draftKey];
                return next;
              });
            }}
          >
            ذخیره
          </Button>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <h2 className="text-base font-semibold">فیلدهای سفارشی</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {applicable.map((d) => (
            <div key={d.id} className="space-y-2">
              <Label className="flex flex-wrap items-center gap-2">
                {d.label}
                {d.is_required && <Badge variant="secondary">اجباری</Badge>}
                {!d.is_active && <Badge variant="outline">غیرفعال</Badge>}
                <span className="text-xs font-normal text-muted-foreground">
                  {PERSON_FIELD_TYPE_FA[d.field_type] ?? d.field_type}
                </span>
              </Label>
              {canEdit ? (
                renderInput(d)
              ) : (
                <p className="text-sm">{formatFieldValue(valueByDef.get(d.id), d.field_type)}</p>
              )}
              {d.help_text && <p className="text-xs text-muted-foreground">{d.help_text}</p>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
