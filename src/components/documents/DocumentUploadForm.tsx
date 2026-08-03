import { useMemo, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, Upload, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useCreateDocument } from "@/hooks/documents/useDocuments";
import { DOCUMENT_TYPE_FA, formatFileSize } from "@/lib/documents/labels";

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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CameraCaptureButton } from "@/shared/components/CameraCaptureButton";

const ALLOWED_EXT = ["jpg", "jpeg", "png", "pdf"];
const MAX_SIZE = 25 * 1024 * 1024;

const schema = z.object({
  type: z.enum(["bijak", "invoice", "havale"]),
  notes: z.string().max(500, "حداکثر ۵۰۰ کاراکتر").optional(),
});

type FormValues = z.infer<typeof schema>;

type RefKind = "inquiry" | "purchase_request";

export function DocumentUploadForm({ onSuccess }: { onSuccess?: () => void }) {
  const { roles } = useAuth();
  const allowed =
    roles.includes("admin") || roles.includes("manager") || roles.includes("accountant");

  const mutation = useCreateDocument();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [refKind, setRefKind] = useState<RefKind | "none">("none");
  const [refId, setRefId] = useState<string | null>(null);
  const [refOpen, setRefOpen] = useState(false);
  const [refSearch, setRefSearch] = useState("");
  const debouncedRefSearch = useDebounce(refSearch, 300);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: "bijak", notes: "" },
    mode: "onBlur",
  });

  const { data: refOptions = [], isFetching: refLoading } = useQuery({
    queryKey: ["doc-upload-ref", refKind, debouncedRefSearch],
    enabled: refOpen && refKind !== "none",
    queryFn: async () => {
      const term = debouncedRefSearch.trim();
      if (refKind === "inquiry") {
        const { data, error } = await supabase
          .from("inquiries")
          .select("id, created_at, products(name)")
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) throw error;
        const rows = (data ?? []).filter((r) => {
          if (!term) return true;
          const name = (r as { products?: { name?: string } }).products?.name ?? "";
          return name.toLowerCase().includes(term.toLowerCase());
        });
        return rows.map((r) => ({
          id: r.id as string,
          label:
            (r as { products?: { name?: string } }).products?.name ??
            `استعلام ${String(r.id).slice(0, 8)}`,
        }));
      }
      const { data, error } = await supabase
        .from("purchase_requests")
        .select("id, created_at, product_id, products(name)")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      const filtered = (data ?? []).filter((r) => {
        if (!term) return true;
        const name = (r as { products?: { name?: string } }).products?.name ?? "";
        return name.toLowerCase().includes(term.toLowerCase());
      });
      return filtered.map((r) => ({
        id: r.id as string,
        label: (r as { products?: { name?: string } }).products?.name ?? "درخواست خرید",
      }));
    },
    staleTime: 30_000,
  });

  const selectedRefLabel = useMemo(() => {
    if (!refId) return null;
    return refOptions.find((o) => o.id === refId)?.label ?? null;
  }, [refId, refOptions]);

  const validateFile = (f: File): string | null => {
    const ext = (f.name.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) return "فرمت مجاز: jpg, png, pdf";
    if (f.size > MAX_SIZE) return "حجم فایل بیش از ۲۵ مگابایت است";
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
      reference_id: refKind === "none" ? null : refId,
      reference_type: refKind === "none" ? null : refKind,
    });
    form.reset({ type: values.type, notes: "" });
    setFile(null);
    setRefKind("none");
    setRefId(null);
    setRefSearch("");
    onSuccess?.();
  };

  if (!allowed) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground" dir="rtl">
          شما دسترسی آپلود سند را ندارید. این عملیات فقط برای حسابدار، مدیر و ادمین فعال است.
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
          نوع سند <span className="text-destructive">*</span>
        </Label>
        <Select
          value={form.watch("type")}
          onValueChange={(v) =>
            form.setValue("type", v as FormValues["type"], { shouldValidate: true })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(DOCUMENT_TYPE_FA) as [FormValues["type"], string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
            accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{file.name}</span>
              <span className="text-xs text-muted-foreground">({formatFileSize(file.size)})</span>
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
              <div className="text-xs text-muted-foreground">jpg، png، pdf — حداکثر ۲۵ مگابایت</div>
            </>
          )}
        </div>
        <div className="flex justify-center">
          <CameraCaptureButton
            accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
            onFiles={(files) => onPickFile(files?.[0] ?? null)}
            testId="document-camera"
          />
        </div>
        {fileError && <p className="text-xs text-destructive">{fileError}</p>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>نوع مرجع (اختیاری)</Label>
          <Select
            value={refKind}
            onValueChange={(v) => {
              setRefKind(v as RefKind | "none");
              setRefId(null);
              setRefSearch("");
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">بدون مرجع</SelectItem>
              <SelectItem value="inquiry">استعلام</SelectItem>
              <SelectItem value="purchase_request">درخواست خرید</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {refKind !== "none" && (
          <div className="space-y-2">
            <Label>انتخاب مرجع</Label>
            <Popover open={refOpen} onOpenChange={setRefOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  className={cn(
                    "w-full justify-between font-normal",
                    !selectedRefLabel && "text-muted-foreground",
                  )}
                >
                  <span className="truncate">{selectedRefLabel ?? "جست‌وجو و انتخاب..."}</span>
                  <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="جست‌وجو..."
                    value={refSearch}
                    onValueChange={setRefSearch}
                  />
                  <CommandList>
                    {refLoading && (
                      <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" /> جست‌وجو...
                      </div>
                    )}
                    <CommandEmpty>موردی یافت نشد</CommandEmpty>
                    <CommandGroup>
                      {refOptions.map((o) => (
                        <CommandItem
                          key={o.id}
                          value={o.id}
                          onSelect={() => {
                            setRefId(o.id);
                            setRefOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "ml-2 h-4 w-4",
                              o.id === refId ? "opacity-100" : "opacity-0",
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
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">توضیحات (اختیاری)</Label>
        <Textarea
          id="notes"
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
        ثبت سند
      </Button>
    </form>
  );
}
