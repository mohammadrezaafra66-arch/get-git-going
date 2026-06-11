import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import {
  WaybillCustomFieldsInput,
  validateCustomData,
  type CustomFieldDef,
  type CustomData,
} from "./WaybillCustomFieldsInput";

const phoneRe = /^[0-9+\-\s()]{4,40}$/;

export const waybillSchema = z.object({
  sender_name: z.string().trim().min(2).max(150),
  sender_phone: z.string().trim().regex(phoneRe, "شماره نامعتبر"),
  receiver_name: z.string().trim().min(2).max(150),
  receiver_phone: z.string().trim().regex(phoneRe, "شماره نامعتبر"),
  shipping_company: z.string().trim().min(1).max(200),
  destination_city: z.string().trim().min(1).max(200),
  customer_accounting_code: z.string().trim().max(30).optional().or(z.literal("")),
  destination_address: z.string().trim().max(500).optional().or(z.literal("")),
  shipping_notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export type WaybillFormValues = z.infer<typeof waybillSchema>;

const empty: WaybillFormValues = {
  sender_name: "",
  sender_phone: "",
  receiver_name: "",
  receiver_phone: "",
  shipping_company: "",
  destination_city: "",
  customer_accounting_code: "",
  destination_address: "",
  shipping_notes: "",
};

export function WaybillForm({
  initial,
  submitting,
  onSubmit,
  customFields = [],
  initialCustomData = {},
}: {
  initial?: Partial<WaybillFormValues>;
  submitting: boolean;
  onSubmit: (
    values: WaybillFormValues,
    register: boolean,
    customData: CustomData,
  ) => Promise<void> | void;
  customFields?: CustomFieldDef[];
  initialCustomData?: CustomData;
}) {
  const [v, setV] = useState<WaybillFormValues>({ ...empty, ...initial });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [customData, setCustomData] = useState<CustomData>(initialCustomData);
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({});

  const set =
    (k: keyof WaybillFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (register: boolean) => {
    const r = waybillSchema.safeParse(v);
    const cErrs = validateCustomData(customFields, customData);
    setCustomErrors(cErrs);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.issues.forEach((i) => {
        errs[i.path.join(".")] = i.message;
      });
      setErrors(errs);
      return;
    }
    if (Object.keys(cErrs).length > 0) {
      setErrors({});
      return;
    }
    setErrors({});
    await onSubmit(r.data, register, customData);
  };

  const Err = ({ k }: { k: string }) =>
    errors[k] ? <p className="text-xs text-destructive">{errors[k]}</p> : null;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>نام فرستنده *</Label>
          <Input value={v.sender_name} onChange={set("sender_name")} maxLength={150} />
          <Err k="sender_name" />
        </div>
        <div className="space-y-1">
          <Label>موبایل فرستنده *</Label>
          <Input value={v.sender_phone} onChange={set("sender_phone")} maxLength={40} dir="ltr" />
          <Err k="sender_phone" />
        </div>
        <div className="space-y-1">
          <Label>نام گیرنده *</Label>
          <Input value={v.receiver_name} onChange={set("receiver_name")} maxLength={150} />
          <Err k="receiver_name" />
        </div>
        <div className="space-y-1">
          <Label>موبایل گیرنده *</Label>
          <Input
            value={v.receiver_phone}
            onChange={set("receiver_phone")}
            maxLength={40}
            dir="ltr"
          />
          <Err k="receiver_phone" />
        </div>
        <div className="space-y-1">
          <Label>کد حسابداری مشتری</Label>
          <Input
            value={v.customer_accounting_code ?? ""}
            onChange={set("customer_accounting_code")}
            maxLength={30}
          />
        </div>
        <div className="space-y-1">
          <Label>باربری / روش ارسال *</Label>
          <Input value={v.shipping_company} onChange={set("shipping_company")} maxLength={200} />
          <Err k="shipping_company" />
        </div>
        <div className="space-y-1">
          <Label>شهر مقصد *</Label>
          <Input value={v.destination_city} onChange={set("destination_city")} maxLength={200} />
          <Err k="destination_city" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>آدرس مقصد</Label>
          <Textarea
            value={v.destination_address ?? ""}
            onChange={set("destination_address")}
            maxLength={500}
            rows={2}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>توضیحات ارسال</Label>
          <Textarea
            value={v.shipping_notes ?? ""}
            onChange={set("shipping_notes")}
            maxLength={500}
            rows={2}
          />
        </div>
      </div>

      {customFields.length > 0 && (
        <WaybillCustomFieldsInput
          fields={customFields}
          value={customData}
          onChange={setCustomData}
          errors={customErrors}
        />
      )}

      <div className="flex flex-col sm:flex-row gap-2 justify-end">
        <Button variant="outline" onClick={() => submit(false)} disabled={submitting}>
          {submitting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          ذخیره به‌عنوان پیش‌نویس
        </Button>
        <Button onClick={() => submit(true)} disabled={submitting}>
          {submitting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          ثبت و تأیید
        </Button>
      </div>
    </div>
  );
}
