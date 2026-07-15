import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Clock, Loader2, Upload, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useCreateDeliveryReceipt } from "@/hooks/delivery-receipts/useDeliveryReceipts";
import { useWorkflowSettings } from "@/hooks/settings/useWorkflowSettings";
import { formatMinutes } from "@/lib/settings/labels";
import {
  DELIVERY_RECEIPT_TYPE_FA,
  formatFileSize,
} from "@/lib/delivery-receipts/labels";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const ALLOWED_EXT = ["jpg", "jpeg", "png", "pdf", "mp4", "mov", "webm", "mkv"];
const VIDEO_EXT = ["mp4", "mov", "webm", "mkv"];
const IMAGE_PDF_MAX = 20 * 1024 * 1024;
const VIDEO_MAX = 100 * 1024 * 1024;

const schema = z.object({
  type: z.enum(["shipping_receipt", "delivery_receipt"]),
  notes: z.string().max(500, "حداکثر ۵۰۰ کاراکتر").optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  onSuccess?: () => void;
  defaultInvoiceId?: string;
  defaultCustomerId?: string;
}

export function DeliveryReceiptUploadForm({
  onSuccess,
  defaultInvoiceId,
  defaultCustomerId,
}: Props) {
  const { roles } = useAuth();
  const allowed =
    roles.includes("admin") ||
    roles.includes("manager") ||
    roles.includes("sales");

  const mutation = useCreateDeliveryReceipt();
  const settingsQ = useWorkflowSettings();

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [invoiceId, setInvoiceId] = useState<string | null>(
    defaultInvoiceId ?? null,
  );
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const debouncedInvoiceSearch = useDebounce(invoiceSearch, 300);

  const [customerId, setCustomerId] = useState<string | null>(
    defaultCustomerId ?? null,
  );
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const debouncedCustomerSearch = useDebounce(customerSearch, 300);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: "shipping_receipt", notes: "" },
    mode: "onBlur",
  });

  const selectedType = form.watch("type");

  const timerMinutes = useMemo(() => {
    const row = settingsQ.data?.find(
      (s) => s.process_key === selectedType && s.is_active,
    );
    return row?.timer_minutes ?? null;
  }, [settingsQ.data, selectedType]);

  const { data: invoiceOptions = [], isFetching: invoiceLoading } = useQuery({
    queryKey: ["dr-upload-invoice", debouncedInvoiceSearch],
    enabled: invoiceOpen,
    queryFn: async () => {
      const term = debouncedInvoiceSearch.trim();
      let q = supabase
        .from("invoices")
        .select("id, number, created_at, product_video_required")
        .order("created_at", { ascending: false })
        .limit(20);
      if (term) q = q.ilike("number", `%${term}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id as string,
        label: (r.number as string | null) ?? `فاکتور ${String(r.id).slice(0, 8)}`,
        videoRequired: Boolean(
          (r as { product_video_required?: boolean }).product_video_required,
        ),
      }));
    },
    staleTime: 30_000,
  });

  const { data: customerOptions = [], isFetching: customerLoading } = useQuery({
    queryKey: ["dr-upload-customer", debouncedCustomerSearch],
    enabled: customerOpen,
    queryFn: async () => {
      const term = debouncedCustomerSearch.trim();
      let q = supabase
        .from("customers")
        .select("id, name")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(20);
      if (term) q = q.ilike("name", `%${term}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id as string,
        label: (r.name as string) ?? "مشتری",
      }));
    },
    staleTime: 30_000,
  });

  const selectedInvoice = useMemo(
    () => (invoiceId ? invoiceOptions.find((o) => o.id === invoiceId) ?? null : null),
    [invoiceId, invoiceOptions],
  );
  const selectedInvoiceLabel = selectedInvoice?.label ?? null;
  const invoiceVideoRequired = selectedInvoice?.videoRequired ?? false;
  const selectedCustomerLabel = useMemo(
    () =>
      customerId
        ? customerOptions.find((o) => o.id === customerId)?.label ?? null
        : null,
    [customerId, customerOptions],
  );

  const validateFile = (f: File): string | null => {
    const ext = (f.name.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) return "فرمت مجاز: jpg, png, pdf, mp4, mov, webm";
    const isVideo = VIDEO_EXT.includes(ext) || f.type.startsWith("video/");
    const max = isVideo ? VIDEO_MAX : IMAGE_PDF_MAX;
    if (f.size > max) {
      return isVideo
        ? "حجم ویدئو بیش از ۱۰۰ مگابایت است"
        : "حجم فایل بیش از ۲۰ مگابایت است";
    }
    return null;
  };

  const onPickFile = (f: File | null) => {
    if (!f) {
      setFile(null);
      setFileError(null);
      return;
    }
    const err = validateFile(f);
    setFileError(err);
    setFile(err ? null : f);
  };

  const onSubmit = async (values: FormValues) => {
    if (!file) {
      setFileError("انتخاب فایل الزامی است");
      return;
    }
    await mutation.mutateAsync({
      type: values.type,
      file,
      notes: values.notes ?? null,
      invoice_id: invoiceId,
      customer_id: customerId,
    });
    form.reset({ type: values.type, notes: "" });
    setFile(null);
    setInvoiceId(defaultInvoiceId ?? null);
    setCustomerId(defaultCustomerId ?? null);
    setInvoiceSearch("");
    setCustomerSearch("");
    onSuccess?.();
  };

  if (!allowed) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground" dir="rtl">
          شما دسترسی آپلود رسید را ندارید. این عملیات فقط برای کارشناس فروش، مدیر و
          ادمین فعال است.
        </CardContent>
      </Card>
    );
  }

  const status: "idle" | "uploading" | "done" | "error" = mutation.isPending
    ? "uploading"
    : mutation.isSuccess
      ? "done"
      : mutation.isError
        ? "error"
        : "idle";

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" dir="rtl">
      <div className="space-y-2">
        <Label>
          نوع رسید <span className="text-destructive">*</span>
        </Label>
        <Select
          value={selectedType}
          onValueChange={(v) =>
            form.setValue("type", v as FormValues["type"], { shouldValidate: true })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(DELIVERY_RECEIPT_TYPE_FA) as [FormValues["type"], string][]).map(
              ([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        {timerMinutes !== null && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            مهلت تأیید: {formatMinutes(timerMinutes)}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>
          فایل <span className="text-destructive">*</span>
        </Label>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0] ?? null;
            onPickFile(f);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition",
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".jpg,.jpeg,.png,.pdf,.mp4,.mov,.webm,.mkv,image/jpeg,image/png,application/pdf,video/*"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{file.name}</span>
              <span className="text-xs text-muted-foreground">
                ({formatFileSize(file.size)})
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onPickFile(null);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <Upload className="h-6 w-6 text-muted-foreground" />
              <div className="text-sm">فایل را اینجا رها کنید یا کلیک کنید</div>
              <div className="text-xs text-muted-foreground">
                jpg، png، pdf تا ۲۰MB — mp4/mov/webm تا ۱۰۰MB
              </div>
            </>
          )}
        </div>
        {fileError && <p className="text-xs text-destructive">{fileError}</p>}
        {invoiceVideoRequired && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            برای این فاکتور آپلود ویدئوی محصول الزامی است.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>فاکتور مرتبط (اختیاری)</Label>
          <Popover open={invoiceOpen} onOpenChange={setInvoiceOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                className={cn(
                  "w-full justify-between font-normal",
                  !selectedInvoiceLabel && "text-muted-foreground",
                )}
              >
                <span className="truncate">
                  {selectedInvoiceLabel ?? "جست‌وجوی شماره فاکتور..."}
                </span>
                <div className="flex items-center gap-1">
                  {invoiceId && (
                    <X
                      className="h-3.5 w-3.5 opacity-60 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInvoiceId(null);
                      }}
                    />
                  )}
                  <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </div>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[--radix-popover-trigger-width] p-0"
              align="start"
            >
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="جست‌وجو..."
                  value={invoiceSearch}
                  onValueChange={setInvoiceSearch}
                />
                <CommandList>
                  {invoiceLoading && (
                    <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" /> جست‌وجو...
                    </div>
                  )}
                  <CommandEmpty>موردی یافت نشد</CommandEmpty>
                  <CommandGroup>
                    {invoiceOptions.map((o) => (
                      <CommandItem
                        key={o.id}
                        value={o.id}
                        onSelect={() => {
                          setInvoiceId(o.id);
                          setInvoiceOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "ml-2 h-4 w-4",
                            o.id === invoiceId ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="truncate">{o.label}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label>مشتری مرتبط (اختیاری)</Label>
          <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                className={cn(
                  "w-full justify-between font-normal",
                  !selectedCustomerLabel && "text-muted-foreground",
                )}
              >
                <span className="truncate">
                  {selectedCustomerLabel ?? "جست‌وجوی نام مشتری..."}
                </span>
                <div className="flex items-center gap-1">
                  {customerId && (
                    <X
                      className="h-3.5 w-3.5 opacity-60 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCustomerId(null);
                      }}
                    />
                  )}
                  <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </div>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[--radix-popover-trigger-width] p-0"
              align="start"
            >
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="جست‌وجو..."
                  value={customerSearch}
                  onValueChange={setCustomerSearch}
                />
                <CommandList>
                  {customerLoading && (
                    <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" /> جست‌وجو...
                    </div>
                  )}
                  <CommandEmpty>موردی یافت نشد</CommandEmpty>
                  <CommandGroup>
                    {customerOptions.map((o) => (
                      <CommandItem
                        key={o.id}
                        value={o.id}
                        onSelect={() => {
                          setCustomerId(o.id);
                          setCustomerOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "ml-2 h-4 w-4",
                            o.id === customerId ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="truncate">{o.label}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="dr-notes">توضیحات (اختیاری)</Label>
        <Textarea
          id="dr-notes"
          rows={3}
          maxLength={500}
          placeholder="یادداشت..."
          {...form.register("notes")}
        />
      </div>

      {status !== "idle" && (
        <div className="text-xs text-muted-foreground">
          {status === "uploading" && "در حال آپلود..."}
          {status === "done" && "آپلود کامل شد."}
          {status === "error" && "خطا در آپلود."}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={mutation.isPending || !file}>
        {mutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
        ثبت رسید
      </Button>
    </form>
  );
}