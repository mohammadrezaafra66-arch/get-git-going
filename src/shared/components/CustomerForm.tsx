import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, ChevronsUpDown, X } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PersianDatePicker } from "@/components/common/PersianDatePicker";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const phoneRegex = /^09\d{9}$/;
const accountingCodeRegex = /^[A-Za-z0-9_-]{1,30}$/;

const schema = z.object({
  name: z.string().trim().min(2, "نام باید حداقل ۲ کاراکتر باشد").max(100),
  phone: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || phoneRegex.test(v), "شماره موبایل نامعتبر است (۰۹xxxxxxxxx)"),
  city: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500, "حداکثر ۵۰۰ کاراکتر").optional(),
  responsible_id: z.string().uuid().nullable().optional(),
  accounting_code: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => !v || accountingCodeRegex.test(v),
      "کد حسابداری فقط شامل حروف انگلیسی، اعداد، _ و - و حداکثر ۳۰ کاراکتر",
    ),
  link_group: z
    .string()
    .trim()
    .optional()
    .refine((v) => {
      if (!v) return true;
      try {
        const u = new URL(v);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    }, "لینک نامعتبر است (باید با http یا https شروع شود)"),
  birth_date: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((v) => {
      if (!v) return true;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return false;
      return d <= new Date();
    }, "تاریخ تولد نمی‌تواند در آینده باشد"),
});

export type CustomerFormValues = z.infer<typeof schema>;

interface Props {
  customerId?: string;
  defaultValues?: Partial<CustomerFormValues> & {
    responsible?: { id: string; full_name: string | null } | null;
  };
}

export function CustomerForm({ customerId, defaultValues }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, roles } = useAuth();

  const isAdminOrManager = roles.includes("admin") || roles.includes("manager");
  const isSales = roles.includes("sales");
  const canSetResponsible = isAdminOrManager || isSales;

  const [respLabel, setRespLabel] = useState<string>(defaultValues?.responsible?.full_name ?? "");

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      phone: defaultValues?.phone ?? "",
      city: defaultValues?.city ?? "",
      notes: defaultValues?.notes ?? "",
      responsible_id: defaultValues?.responsible_id ?? null,
      accounting_code: defaultValues?.accounting_code ?? "",
      link_group: defaultValues?.link_group ?? "",
      birth_date: defaultValues?.birth_date ?? null,
    },
    mode: "onBlur",
  });

  const mutation = useMutation({
    mutationFn: async (values: CustomerFormValues) => {
      // Sales users can only set themselves or null as responsible
      if (isSales && !isAdminOrManager) {
        const r = values.responsible_id;
        if (r && r !== user?.id) {
          throw new Error("شما فقط می‌توانید خودتان را به‌عنوان مسئول تنظیم کنید");
        }
      }
      const payload = {
        name: values.name.trim(),
        phone: values.phone?.trim() || null,
        city: values.city?.trim() || null,
        notes: values.notes?.trim() || null,
        responsible_id: values.responsible_id ?? null,
        accounting_code: values.accounting_code?.trim() || null,
        link_group: values.link_group?.trim() || null,
        birth_date: values.birth_date ? values.birth_date : null,
      };
      if (!user?.id) {
        throw new Error("نشست کاربری معتبر نیست. لطفاً دوباره وارد شوید.");
      }

      const duplicateFilters: string[] = [];
      if (payload.accounting_code) {
        duplicateFilters.push(`accounting_code.eq.${payload.accounting_code}`);
      }
      if (payload.phone) {
        duplicateFilters.push(`phone.eq.${payload.phone}`);
      }

      if (duplicateFilters.length > 0) {
        let duplicateQuery = supabase
          .from("customers")
          .select("id, name, phone, accounting_code")
          .or(duplicateFilters.join(","))
          .limit(1);

        if (customerId) {
          duplicateQuery = duplicateQuery.neq("id", customerId);
        }

        const { data: duplicateRows, error: duplicateError } = await duplicateQuery;
        if (duplicateError) throw new Error(duplicateError.message);

        const duplicate = duplicateRows?.[0] as
          | {
              id: string;
              name: string | null;
              phone: string | null;
              accounting_code: string | null;
            }
          | undefined;

        if (duplicate) {
          if (payload.accounting_code && duplicate.accounting_code === payload.accounting_code) {
            throw new Error(
              `کد حسابداری تکراری است؛ مشتری «${duplicate.name ?? "بدون نام"}» قبلاً با این کد ثبت شده است.`,
            );
          }
          if (payload.phone && duplicate.phone === payload.phone) {
            throw new Error(
              `شماره تماس تکراری است؛ مشتری «${duplicate.name ?? "بدون نام"}» قبلاً با این شماره ثبت شده است.`,
            );
          }
          throw new Error("مشتری مشابه قبلاً ثبت شده است.");
        }
      }

      if (customerId) {
        const { data: row, error } = await supabase
          .from("customers")
          .update(payload as never)
          .eq("id", customerId)
          .select("id")
          .single();

        if (error) throw new Error(error.message);
        if (!row) throw new Error("مشتری یافت نشد یا دسترسی به آن ندارید");
        return (row as { id: string }).id;
      }

      // Phase 6.2 — creation goes through person_create_inline so a customer can
      // never exist without a person. The duplicate guard above still runs first;
      // it protects the legacy accounting_code/phone uniqueness rules, which are
      // separate from the person-level identifier uniqueness of migration 228.
      const { data: rpcRow, error: rpcError } = await supabase.rpc("person_create_inline", {
        p_display_name: payload.name,
        p_context_kind: "customer",
        p_identifiers: payload.phone
          ? [
              {
                kind: "mobile_e164",
                value_raw: payload.phone,
                is_primary: true,
                status: "provisional",
              },
            ]
          : [],
        p_city: payload.city,
        p_notes: payload.notes,
        p_accounting_code: payload.accounting_code,
        // Customer-only columns, applied by the RPC whitelist (migration 232).
        p_legacy_fields: {
          responsible_id: payload.responsible_id,
          link_group: payload.link_group,
          birth_date: payload.birth_date,
        },
      });

      if (rpcError) throw new Error(rpcError.message);
      const created = rpcRow as { legacy_id: string | null } | null;
      if (!created?.legacy_id) {
        throw new Error("ایجاد مشتری ناموفق بود — رکوردی بازگردانده نشد");
      }
      return created.legacy_id;
    },
    onSuccess: () => {
      toast.success(customerId ? "مشتری ویرایش شد" : "مشتری ثبت شد");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customers", "search"] });
      queryClient.invalidateQueries({ queryKey: ["persons"] });
      if (!customerId) form.reset();
      navigate({ to: "/sales/customers" });
    },
    onError: (err: unknown) => {
      const raw = err instanceof Error ? err.message : "";
      const lower = raw.toLowerCase();

      if (
        err instanceof TypeError ||
        lower.includes("failed to fetch") ||
        lower.includes("networkerror") ||
        lower.includes("load failed")
      ) {
        toast.error("ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.");
        return;
      }
      if (raw.includes("کد حسابداری تکراری") || lower.includes("accounting_code")) {
        form.setError("accounting_code", { message: "کد حسابداری تکراری است" });
        toast.error("کد حسابداری تکراری است؛ یک کد یکتای دیگر انتخاب کنید.");
        return;
      }
      if (raw.includes("نشست کاربری") || lower.includes("unauthorized") || lower.includes("401")) {
        toast.error("نشست شما منقضی شده است. لطفاً دوباره وارد شوید.");
        return;
      }
      if (
        raw.includes("دسترسی") ||
        lower.includes("forbidden") ||
        lower.includes("403") ||
        lower.includes("rls")
      ) {
        toast.error("دسترسی لازم برای این عملیات را ندارید.");
        return;
      }
      if (raw.includes("موبایل") || lower.includes("phone")) {
        form.setError("phone", { message: "شماره موبایل نامعتبر است" });
        toast.error("شماره موبایل نامعتبر است.");
        return;
      }
      toast.error(raw ? `عملیات ناموفق بود: ${raw}` : "عملیات ناموفق بود. لطفاً دوباره تلاش کنید.");
    },
  });

  const errors = form.formState.errors;
  const responsibleId = form.watch("responsible_id");

  return (
    <form
      onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
      className="mx-auto w-full max-w-xl space-y-5"
      dir="rtl"
    >
      <div className="space-y-2">
        <Label htmlFor="name">
          نام مشتری <span className="text-destructive">*</span>
        </Label>
        <Input id="name" {...form.register("name")} placeholder="نام و نام خانوادگی" />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">شماره تماس</Label>
        <Input
          id="phone"
          inputMode="numeric"
          dir="ltr"
          placeholder="09xxxxxxxxx"
          {...form.register("phone")}
        />
        {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="city">شهر</Label>
        <Input id="city" {...form.register("city")} placeholder="مثلاً تهران" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="birth_date">تاریخ تولد (اختیاری)</Label>
        <PersianDatePicker
          value={form.watch("birth_date") ?? null}
          onChange={(iso) => form.setValue("birth_date", iso, { shouldValidate: true })}
          placeholder="انتخاب تاریخ تولد"
          max={new Date().toISOString().slice(0, 10)}
        />
        {errors.birth_date && (
          <p className="text-xs text-destructive">{errors.birth_date.message as string}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="accounting_code">کد حسابداری</Label>
        <Input
          id="accounting_code"
          dir="ltr"
          maxLength={30}
          placeholder="مثلاً CUST-1024"
          {...form.register("accounting_code")}
        />
        {errors.accounting_code && (
          <p className="text-xs text-destructive">{errors.accounting_code.message}</p>
        )}
        <p className="text-[11px] text-muted-foreground">
          اختیاری، یکتا، فقط حروف انگلیسی/اعداد/_/-
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="link_group">لینک گروه (واتساپ/روبیکا)</Label>
        <Input
          id="link_group"
          dir="ltr"
          type="url"
          placeholder="https://chat.whatsapp.com/..."
          {...form.register("link_group")}
        />
        {errors.link_group && (
          <p className="text-xs text-destructive">{errors.link_group.message}</p>
        )}
      </div>

      {/* Responsible (مسئول مشتری) */}
      {canSetResponsible && (
        <ResponsiblePicker
          value={responsibleId ?? null}
          label={respLabel}
          onChange={(id, label) => {
            form.setValue("responsible_id", id, { shouldValidate: true });
            setRespLabel(label);
          }}
          restrictedToSelf={isSales && !isAdminOrManager}
          currentUserId={user?.id ?? null}
        />
      )}

      <div className="space-y-2">
        <Label htmlFor="notes">توضیحات</Label>
        <Textarea id="notes" rows={3} maxLength={500} {...form.register("notes")} />
        {errors.notes && <p className="text-xs text-destructive">{errors.notes.message}</p>}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={mutation.isPending} className="flex-1">
          {mutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          {customerId ? "ذخیره تغییرات" : "ثبت مشتری"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate({ to: "/sales/customers" })}
        >
          بازگشت
        </Button>
      </div>
    </form>
  );
}

/* ------------- Responsible autocomplete ------------- */

interface ResponsiblePickerProps {
  value: string | null;
  label: string;
  onChange: (id: string | null, label: string) => void;
  restrictedToSelf?: boolean;
  currentUserId: string | null;
}

function ResponsiblePicker({
  value,
  label,
  onChange,
  restrictedToSelf,
  currentUserId,
}: ResponsiblePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 350);

  const { data: profiles = [] } = useQuery({
    queryKey: ["responsible-profiles", debounced, restrictedToSelf, currentUserId],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("profiles")
        .select("id, full_name")
        .eq("status", "active")
        .order("full_name", { ascending: true })
        .limit(20);
      const term = debounced.trim().replace(/[%_]/g, "");
      if (term) q = q.ilike("full_name", `%${term}%`);
      if (restrictedToSelf && currentUserId) q = q.eq("id", currentUserId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-2">
      <Label>مسئول مشتری</Label>
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              className={cn(
                "flex-1 justify-between font-normal",
                !value && "text-muted-foreground",
              )}
            >
              {value ? label || "کاربر انتخاب شده" : "انتخاب مسئول (اختیاری)..."}
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput placeholder="نام کاربر..." value={search} onValueChange={setSearch} />
              <CommandList>
                <CommandEmpty>کاربری یافت نشد</CommandEmpty>
                <CommandGroup>
                  {profiles.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={p.id}
                      onSelect={() => {
                        onChange(p.id, p.full_name ?? "");
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn("ml-2 h-4 w-4", p.id === value ? "opacity-100" : "opacity-0")}
                      />
                      <span>{p.full_name || "بدون نام"}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(null, "")}
            aria-label="پاک کردن"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {restrictedToSelf && (
        <p className="text-xs text-muted-foreground">
          شما فقط می‌توانید خودتان را به‌عنوان مسئول انتخاب کنید.
        </p>
      )}
    </div>
  );
}
