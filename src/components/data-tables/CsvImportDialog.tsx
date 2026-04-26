import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toFaDigits } from "@/lib/i18n/formatters";
import {
  parseCsv, validateRows, suggestMapping,
  CSV_IMPORT_MAX_ROWS, CSV_DELIMITER_LABELS,
  type CsvImportColumn, type ParsedCsv, type ValidationResult,
} from "@/lib/data-tables/csv-import";
import { DYNAMIC_COLUMN_DATA_TYPE_LABELS } from "@/lib/data-tables/constants";

type Step = "file" | "preview" | "map" | "validate" | "import" | "done";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string;
  columns: CsvImportColumn[];
}

const NONE = "__none__";

interface ImportSummary {
  inserted: number;
  skipped: number;
  total: number;
  validCount: number;
  errorCount: number;
  sessionId: string;
  delimiterLabel: string;
  atomic: boolean;
}

export function CsvImportDialog({ open, onOpenChange, tableId, columns }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<Step>("file");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [skipErrors, setSkipErrors] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep("file"); setParsed(null); setMapping({});
    setValidation(null); setSkipErrors(false);
    setSummary(null); setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleClose = (next: boolean) => {
    if (busy) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const onFileSelected = async (file: File | null) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("حجم فایل بیش از حد مجاز است (حداکثر ۱۰ مگابایت).");
      return;
    }
    try {
      setBusy(true);
      const text = await file.text();
      const p = parseCsv(text);
      if (p.warnings.includes("delimiter_unknown")) {
        toast.error("ساختار فایل قابل تشخیص نیست؛ لطفاً CSV را با comma یا semicolon خروجی بگیرید.");
        return;
      }
      if (p.headers.length === 0) {
        toast.error("ردیف اول فایل باید شامل نام ستون‌ها باشد.");
        return;
      }
      if (p.rows.length === 0) {
        toast.error("فایل CSV هیچ ردیفی ندارد.");
        return;
      }
      if (p.rows.length > CSV_IMPORT_MAX_ROWS) {
        toast.error(`حداکثر ${toFaDigits(String(CSV_IMPORT_MAX_ROWS))} ردیف در هر واردسازی مجاز است.`);
        return;
      }
      setParsed(p);
      setMapping(suggestMapping(columns, p.headers));
      setStep("preview");
    } catch {
      toast.error("خواندن فایل با خطا مواجه شد.");
    } finally {
      setBusy(false);
    }
  };

  const previewRows = useMemo(
    () => (parsed ? parsed.rows.slice(0, 8) : []),
    [parsed],
  );

  const requiredColumnsMissing = useMemo(() => {
    return columns.filter((c) => c.is_required && !mapping[c.column_key]);
  }, [columns, mapping]);

  const runValidation = () => {
    if (!parsed) return;
    if (requiredColumnsMissing.length > 0) {
      toast.error(`ستون‌های الزامی بدون مپ: ${requiredColumnsMissing.map((c) => c.label).join("، ")}`);
      return;
    }
    const r = validateRows(parsed, columns, mapping);
    setValidation(r);
    setStep("validate");
  };

  const runImport = async () => {
    if (!validation || !parsed) return;
    const rowsToImport = validation.valid;
    if (rowsToImport.length === 0) {
      toast.error("هیچ ردیف معتبری برای واردسازی وجود ندارد.");
      return;
    }
    setBusy(true);
    setStep("import");
    // Atomic mode: single RPC call wraps everything in one DB transaction.
    const sessionId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("import_dynamic_table_rows", {
        p_table_id: tableId,
        p_rows: rowsToImport,
        p_session_id: sessionId,
      });
      if (error) throw error;
      const result = (data ?? {}) as {
        inserted?: number; total?: number; session_id?: string; atomic?: boolean;
      };
      const inserted = Number(result.inserted ?? rowsToImport.length);
      const skipped = validation.totalRows - inserted;
      setSummary({
        inserted,
        skipped,
        total: validation.totalRows,
        validCount: validation.validCount,
        errorCount: validation.errorRowCount,
        sessionId: result.session_id ?? sessionId,
        delimiterLabel: CSV_DELIMITER_LABELS[parsed.delimiter],
        atomic: result.atomic ?? true,
      });
      setStep("done");
      toast.success(`واردسازی موفق: ${toFaDigits(String(inserted))} ردیف اضافه شد.`);
      qc.invalidateQueries({ queryKey: ["dynamic-table-rows", tableId] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "خطای ناشناخته";
      toast.error(`خطا در واردسازی (هیچ ردیفی ذخیره نشد): ${msg}`);
      setStep("validate");
    } finally {
      setBusy(false);
    }
  };

  const canProceedFromValidation =
    !!validation &&
    (validation.errorRowCount === 0 || skipErrors) &&
    validation.validCount > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>
            واردسازی از CSV
            <span className="ms-2 text-xs text-muted-foreground font-normal">
              ({stepLabel(step)})
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Step: File */}
        {step === "file" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              یک فایل CSV با سرستون انتخاب کنید. حداکثر {toFaDigits(String(CSV_IMPORT_MAX_ROWS))} ردیف مجاز است.
              فایل فقط در مرورگر شما خوانده می‌شود و روی سرور ذخیره نمی‌گردد.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="block w-full text-sm file:ml-3 file:py-2 file:px-4 file:rounded-md file:border file:border-border file:bg-muted file:text-foreground hover:file:bg-muted/80 cursor-pointer"
              onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
            {busy && <p className="text-xs text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin ms-1" />در حال خواندن…</p>}
          </div>
        )}

        {/* Step: Preview */}
        {step === "preview" && parsed && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                پیش‌نمایش {toFaDigits(String(previewRows.length))} ردیف اول از مجموع {toFaDigits(String(parsed.rows.length))} ردیف.
              </span>
              <Badge variant="outline" className="text-[10px]">
                جداکننده: {CSV_DELIMITER_LABELS[parsed.delimiter]}
              </Badge>
            </div>
            {parsed.warnings.some((w) => w.startsWith("column_count_mismatch")) && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                برخی ردیف‌ها تعداد ستون متفاوتی با سرستون دارند؛ احتمال خطا در اعتبارسنجی هست.
              </p>
            )}
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    {parsed.headers.map((h, i) => (
                      <th key={i} className="px-2 py-1.5 text-right font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      {parsed.headers.map((_, j) => (
                        <td key={j} className="px-2 py-1 whitespace-nowrap">{r[j] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step: Map */}
        {step === "map" && parsed && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              برای هر ستون جدول، سرستون متناظر در CSV را انتخاب کنید. ستون‌هایی که مپ نشوند نادیده گرفته می‌شوند.
            </p>
            <div className="space-y-2">
              {columns.map((c) => (
                <div key={c.id} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center rounded-md border border-border bg-muted/20 px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label className="font-medium text-sm">{c.label}</Label>
                    <Badge variant="outline" className="text-[10px]">{DYNAMIC_COLUMN_DATA_TYPE_LABELS[c.data_type]}</Badge>
                    {c.is_required && <Badge variant="secondary" className="text-[10px]">الزامی</Badge>}
                  </div>
                  <div className="md:col-span-2">
                    <Select
                      value={mapping[c.column_key] ?? NONE}
                      onValueChange={(v) => {
                        setMapping((m) => {
                          const next = { ...m };
                          if (v === NONE) delete next[c.column_key];
                          else next[c.column_key] = v;
                          return next;
                        });
                      }}
                    >
                      <SelectTrigger className="h-9"><SelectValue placeholder="— انتخاب سرستون —" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>— نادیده بگیر —</SelectItem>
                        {parsed.headers.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
            {requiredColumnsMissing.length > 0 && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                ستون‌های الزامی بدون مپ: {requiredColumnsMissing.map((c) => c.label).join("، ")}
              </p>
            )}
          </div>
        )}

        {/* Step: Validate */}
        {step === "validate" && validation && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border border-border bg-muted/30 p-2">
                <div className="text-xs text-muted-foreground">کل</div>
                <div className="text-lg font-bold">{toFaDigits(String(validation.totalRows))}</div>
              </div>
              <div className="rounded-md border border-border bg-emerald-500/10 p-2">
                <div className="text-xs text-muted-foreground">معتبر</div>
                <div className="text-lg font-bold text-emerald-600">{toFaDigits(String(validation.validCount))}</div>
              </div>
              <div className="rounded-md border border-border bg-destructive/10 p-2">
                <div className="text-xs text-muted-foreground">خطادار</div>
                <div className="text-lg font-bold text-destructive">{toFaDigits(String(validation.errorRowCount))}</div>
              </div>
            </div>

            {validation.errors.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  نمایش {toFaDigits(String(Math.min(50, validation.errors.length)))} خطا از {toFaDigits(String(validation.errors.length))} خطا:
                </p>
                <div className="max-h-64 overflow-y-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-right">ردیف</th>
                        <th className="px-2 py-1.5 text-right">ستون</th>
                        <th className="px-2 py-1.5 text-right">مقدار</th>
                        <th className="px-2 py-1.5 text-right">پیام</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validation.errors.slice(0, 50).map((e, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-2 py-1">{toFaDigits(String(e.rowIndex))}</td>
                          <td className="px-2 py-1">{e.columnLabel}</td>
                          <td className="px-2 py-1 max-w-[200px] truncate" title={e.value}>{e.value || "—"}</td>
                          <td className="px-2 py-1 text-destructive">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {validation.errorRowCount > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={skipErrors} onCheckedChange={setSkipErrors} />
                نادیده گرفتن ردیف‌های خطادار و واردسازی فقط ردیف‌های معتبر
              </label>
            )}
          </div>
        )}

        {/* Step: Import progress */}
        {step === "import" && (
          <div className="space-y-3 py-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <p className="text-sm">در حال واردسازی اتمیک… لطفاً صفحه را نبندید.</p>
            <p className="text-xs text-muted-foreground">
              کل {toFaDigits(String(validation?.validCount ?? 0))} ردیف در یک تراکنش ذخیره می‌شود.
            </p>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && summary && (
          <div className="space-y-3 py-4">
            <div className="text-center space-y-1">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            <p className="font-semibold">واردسازی انجام شد.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <SummaryRow label="کل ردیف‌های فایل" value={toFaDigits(String(summary.total))} />
              <SummaryRow label="ردیف معتبر" value={toFaDigits(String(summary.validCount))} />
              <SummaryRow label="ردیف خطادار" value={toFaDigits(String(summary.errorCount))} />
              <SummaryRow label="واردشده" value={toFaDigits(String(summary.inserted))} highlight />
              <SummaryRow label="جداکننده تشخیص‌داده‌شده" value={summary.delimiterLabel} />
              <SummaryRow label="حالت" value={summary.atomic ? "اتمیک (تک‌تراکنش)" : "Batch"} />
              <div className="col-span-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                <span className="text-muted-foreground">شناسه نشست واردسازی: </span>
                <span className="font-mono break-all" dir="ltr">{summary.sessionId}</span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "file" && (
            <Button variant="outline" onClick={() => handleClose(false)} disabled={busy}>انصراف</Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("file")}>قبلی</Button>
              <Button onClick={() => setStep("map")}>مرحله بعد: مپ ستون‌ها</Button>
            </>
          )}
          {step === "map" && (
            <>
              <Button variant="outline" onClick={() => setStep("preview")}>قبلی</Button>
              <Button onClick={runValidation}>اعتبارسنجی</Button>
            </>
          )}
          {step === "validate" && (
            <>
              <Button variant="outline" onClick={() => setStep("map")} disabled={busy}>قبلی</Button>
              <Button onClick={runImport} disabled={!canProceedFromValidation || busy}>
                <Upload className="ml-2 h-4 w-4" />
                واردسازی {toFaDigits(String(validation?.validCount ?? 0))} ردیف
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={() => handleClose(false)}>بستن</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function stepLabel(s: Step): string {
  switch (s) {
    case "file": return "۱/۵ انتخاب فایل";
    case "preview": return "۲/۵ پیش‌نمایش";
    case "map": return "۳/۵ مپ ستون‌ها";
    case "validate": return "۴/۵ اعتبارسنجی";
    case "import": return "۵/۵ واردسازی";
    case "done": return "پایان";
  }
}