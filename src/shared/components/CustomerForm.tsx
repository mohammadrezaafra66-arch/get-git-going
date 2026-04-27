import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
});

export type CustomerFormValues = z.infer<typeof schema>;

interface Props {
  customerId?: string;
  defaultValues?: Partial<CustomerFormValues>;
}

export function CustomerForm({ customerId, defaultValues }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      phone: defaultValues?.phone ?? "",
      city: defaultValues?.city ?? "",
      notes: defaultValues?.notes ?? "",
    },
    mode: "onBlur",
  });

  const mutation = useMutation({
    mutationFn: async (values: CustomerFormValues) => {
      const payload = {
        name: values.name.trim(),
        phone: values.phone?.trim() || null,
        city: values.city?.trim() || null,
        notes: values.notes?.trim() || null,
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