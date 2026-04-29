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
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

const phoneRegex = /^09\d{9}$/;

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

  const [respLabel, setRespLabel] = useState<string>(
    defaultValues?.responsible?.full_name ?? "",
  );

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      phone: defaultValues?.phone ?? "",
      city: defaultValues?.city ?? "",
      notes: defaultValues?.notes ?? "",
      responsible_id: defaultValues?.responsible_id ?? null,
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
      };
      if (customerId) {
        const { error } = await supabase
          .from("customers")
          .update(payload as never)
          .eq("id", customerId);
        if (error) throw error;
        return customerId;
      }
      const { data, error } = await supabase
        .from("customers")
        .insert(payload as never)
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => {
      toast.success(customerId ? "مشتری ویرایش شد" : "مشتری ثبت شد");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      navigate({ to: "/sales/customers" });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطای ناشناخته";
      toast.error(`عملیات ناموفق بود: ${msg}`);
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
        <Label htmlFor="name">نام مشتری <span className="text-destructive">*</span></Label>
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
  value, label, onChange, restrictedToSelf, currentUserId,
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
              {value ? (label || "کاربر انتخاب شده") : "انتخاب مسئول (اختیاری)..."}
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="نام کاربر..."
                value={search}
                onValueChange={setSearch}
              />
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
                        className={cn(
                          "ml-2 h-4 w-4",
                          p.id === value ? "opacity-100" : "opacity-0",
                        )}
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
