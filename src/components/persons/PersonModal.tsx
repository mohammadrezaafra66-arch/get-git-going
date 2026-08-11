import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { ExistingPersonPrompt } from "@/components/persons/ExistingPersonPrompt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeIdentifier } from "@/lib/persons/identifiers-normalize";
import type { PersonKind } from "@/lib/persons/schemas";
import type { PersonContextKind } from "@/lib/persons/context-links.schemas";

/**
 * Inline person creation (item 229).
 *
 * Opens over a transaction form so a user who discovers the counterparty does
 * not exist can introduce it without navigating away and losing form state.
 *
 * Design decisions worth knowing before editing:
 *
 *  - display_name is the ONLY required field. A missing phone must never block
 *    introducing a person: that is exactly the mandatory precondition the
 *    unified-person model exists to remove. When no identifier is given the
 *    modal warns (duplicate detection gets weaker) but still submits.
 *
 *  - visibility_scope is never exposed. person_create_inline defaults to
 *    'internal_general', and RLS refuses anything else for sales/accountant.
 *    Showing the picker would offer a choice the database rejects.
 *
 *  - The whole write is one RPC call, so person + identifiers + the legacy
 *    suppliers/customers mirror row + the provenance link either all land or
 *    none do. A half-created supplier is worse than a failed create.
 */

export interface PersonInlineResult {
  person_id: string;
  /** 'suppliers' | 'customers' | null — the legacy mirror row, when one applies. */
  legacy_table: string | null;
  /** id of the legacy row; this is what a transaction FK should point at. */
  legacy_id: string | null;
  display_name: string;
}

const CONTEXT_COPY: Partial<
  Record<PersonContextKind, { title: string; description: string; defaultKind: PersonKind }>
> = {
  supplier: {
    title: "تأمین‌کنندهٔ جدید",
    description: "شخص جدید ثبت می‌شود و بلافاصله در همین فرم قابل انتخاب است.",
    defaultKind: "organization",
  },
  customer: {
    title: "مشتری جدید",
    description: "شخص جدید ثبت می‌شود و بلافاصله در همین فرم قابل انتخاب است.",
    defaultKind: "individual",
  },
};

function buildSchema() {
  return z.object({
    display_name: z.string().trim().min(2, "نام حداقل ۲ کاراکتر است").max(255),
    kind: z.enum(["individual", "organization"]),
    phone: z
      .string()
      .trim()
      .optional()
      .refine(
        (v) => !v || normalizeIdentifier("mobile_e164", v).ok,
        "شماره موبایل معتبر نیست (مثال: ۰۹۱۲۱۲۳۴۵۶۷)",
      ),
    gov_id: z.string().trim().optional(),
    city: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(500).optional(),
  });
}

type Values = z.infer<ReturnType<typeof buildSchema>>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Provenance — recorded on person_context_links. Never used for authorization. */
  context: PersonContextKind;
  onSuccess: (result: PersonInlineResult) => void;
  /** Prefills the name field, e.g. with whatever the user already typed. */
  initialName?: string;
}

export function PersonModal({ open, onOpenChange, context, onSuccess, initialName }: Props) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const copy = CONTEXT_COPY[context] ?? {
    title: "شخص جدید",
    description: "شخص جدید ثبت می‌شود و بلافاصله قابل انتخاب است.",
    defaultKind: "individual" as PersonKind,
  };

  const schema = useMemo(buildSchema, []);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      display_name: initialName ?? "",
      kind: copy.defaultKind,
      phone: "",
      gov_id: "",
      city: "",
      notes: "",
    },
    mode: "onBlur",
  });

  // Reopening must not show the previous attempt's data or error.
  useEffect(() => {
    if (open) {
      form.reset({
        display_name: initialName ?? "",
        kind: copy.defaultKind,
        phone: "",
        gov_id: "",
        city: "",
        notes: "",
      });
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialName]);

  const kind = form.watch("kind");
  const phone = form.watch("phone");
  const govId = form.watch("gov_id");
  const hasNoIdentifier = !phone?.trim() && !govId?.trim();

  const govIdKind = kind === "organization" ? "tax_id_ir" : "national_id_ir";
  const govIdLabel = kind === "organization" ? "شناسهٔ اقتصادی" : "کد ملی";

  const mutation = useMutation({
    mutationFn: async (v: Values): Promise<PersonInlineResult> => {
      const identifiers: Array<{ kind: string; value_raw: string; is_primary?: boolean }> = [];
      if (v.phone?.trim()) {
        identifiers.push({ kind: "mobile_e164", value_raw: v.phone.trim(), is_primary: true });
      }
      if (v.gov_id?.trim()) {
        identifiers.push({ kind: govIdKind, value_raw: v.gov_id.trim() });
      }

      // Mirrors CustomerForm/QuickAddCustomerDialog: attach the bearer token at
      // the call site so a hydration race in the global middleware cannot turn
      // this into an opaque 401.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) {
        throw new Error("نشست کاربری معتبر نیست. لطفاً دوباره وارد شوید.");
      }

      const { data, error } = await supabase.rpc("person_create_inline", {
        p_display_name: v.display_name.trim(),
        p_context_kind: context,
        p_kind: v.kind,
        p_identifiers: identifiers,
        p_city: v.city?.trim() || null,
        p_notes: v.notes?.trim() || null,
      });
      if (error) throw error;

      const row = data as {
        person_id: string;
        legacy_table: string | null;
        legacy_id: string | null;
      } | null;
      if (!row?.person_id) {
        throw new Error("ایجاد شخص ناموفق بود — شناسه‌ای بازگردانده نشد");
      }

      return {
        person_id: row.person_id,
        legacy_table: row.legacy_table,
        legacy_id: row.legacy_id,
        display_name: v.display_name.trim(),
      };
    },
    onSuccess: (result) => {
      toast.success(`«${result.display_name}» ثبت شد`);
      // Refresh every list that could now be stale.
      queryClient.invalidateQueries({ queryKey: ["purchase-form-suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["sales-quote-customer-search"] });
      queryClient.invalidateQueries({ queryKey: ["persons"] });
      onSuccess(result);
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      // Keep the modal OPEN so the user can correct and retry without retyping.
      const raw = err instanceof Error ? err.message : String(err ?? "");
      const code = (err as { code?: string } | null)?.code;
      // Phase 8.4 (241) rewords the duplicate-contact error to «این شماره قبلاً
      // برای شخص ... ثبت شده است», so match the shared «قبلاً» stem rather than
      // the old sentence. The message itself is always shown verbatim below;
      // this branch only picks the fallback text when the DB sent none.
      if (code === "23505" || raw.includes("قبلاً")) {
        setServerError(raw || "این شناسه قبلاً برای شخص دیگری ثبت شده است.");
      } else if (code === "42501" || raw.includes("دسترسی")) {
        setServerError("دسترسی لازم برای ثبت شخص جدید را ندارید.");
      } else {
        setServerError(raw || "ثبت شخص ناموفق بود.");
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => (mutation.isPending ? null : onOpenChange(o))}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((v) => {
            setServerError(null);
            mutation.mutate(v);
          })}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="pm-name">نام *</Label>
            <Input id="pm-name" autoFocus {...form.register("display_name")} />
            {form.formState.errors.display_name && (
              <p className="text-xs text-destructive">
                {form.formState.errors.display_name.message}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>نوع</Label>
              <Select value={kind} onValueChange={(v) => form.setValue("kind", v as PersonKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">حقیقی</SelectItem>
                  <SelectItem value="organization">حقوقی</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pm-phone">شمارهٔ موبایل</Label>
              <Input
                id="pm-phone"
                inputMode="tel"
                placeholder="۰۹۱۲۱۲۳۴۵۶۷"
                {...form.register("phone")}
              />
              {form.formState.errors.phone && (
                <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>
              )}
            </div>
          </div>

          {/* P1.2 — only the two context kinds that own a mirror table can have
              a role added this way; the rest still fall through to the RPC. */}
          {(context === "customer" || context === "supplier") && (
            <ExistingPersonPrompt
              phone={form.watch("phone")}
              targetRole={context}
              onUseExisting={(mirrorId, person) => {
                queryClient.invalidateQueries({ queryKey: ["purchase-form-suppliers"] });
                queryClient.invalidateQueries({ queryKey: ["suppliers"] });
                queryClient.invalidateQueries({ queryKey: ["customers"] });
                queryClient.invalidateQueries({ queryKey: ["sales-quote-customer-search"] });
                queryClient.invalidateQueries({ queryKey: ["persons"] });
                onSuccess({
                  person_id: person.person_id,
                  legacy_table: context === "supplier" ? "suppliers" : "customers",
                  legacy_id: mirrorId,
                  display_name: person.display_name,
                });
                onOpenChange(false);
              }}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pm-gov">{govIdLabel}</Label>
              <Input id="pm-gov" inputMode="numeric" {...form.register("gov_id")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pm-city">شهر</Label>
              <Input id="pm-city" {...form.register("city")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pm-notes">توضیحات</Label>
            <Textarea id="pm-notes" rows={2} {...form.register("notes")} />
          </div>

          {/* Advisory, never blocking — see the header note on required fields. */}
          {hasNoIdentifier && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              بدون شمارهٔ موبایل یا {govIdLabel}، تشخیص تکراری‌بودن این شخص در آینده دشوارتر خواهد
              بود. ثبت بدون آن‌ها ممکن است.
            </p>
          )}

          {serverError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {serverError}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              بازگشت
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              ذخیرهٔ شخص و ادامه
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
