import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toFaDigits } from "@/lib/i18n/formatters";

const MAX_ROWS = 1000;
const BATCH_SIZE = 50;
const PHONE_REGEX = /^09\d{9}$/;
const CODE_REGEX = /^[A-Za-z0-9_-]{1,30}$/;

type FieldKey = "name" | "phone" | "city" | "accounting_code" | "notes";

const FIELD_LABELS: Record<FieldKey, string> = {
  name: "نام مشتری *",
  phone: "شماره تماس",
  city: "شهر",
  accounting_code: "کد حسابداری",
  notes: "توضیحات",
};

const NONE = "__none__";

interface ImportError {
  row: number;
  reason: string;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: ImportError[];
}

function normalizeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

export function CustomerImportForm() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({
    name: NONE,
    phone: NONE,
    city: NONE,
    accounting_code: NONE,
    notes: NONE,
  });
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);

  const previewRows = useMemo(() => rows.slice(0, 5), [rows]);
  const totalRows = rows.length;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setParsing(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error("فایل اکسل خالی است");
      const sheet = wb.Sheets[sheetName];
      const arr = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        blankrows: false,
        defval: "",
      });
      if (arr.length < 2) throw new Error("فایل باید حداقل ۱ ردیف داده داشته باشد");
      const hdr = (arr[0] as unknown[]).map((c, i) => normalizeCell(c) || `ستون ${i + 1}`);
      const dataRows = arr.slice(1).map((r) => (r as unknown[]).map(normalizeCell));
      if (dataRows.length > MAX_ROWS) {
        throw new Error(
          `حداکثر ${toFaDigits(MAX_ROWS)} ردیف مجاز است (${toFaDigits(dataRows.length)} ردیف یافت شد)`,
        );
      }
      setHeaders(hdr);
      setRows(dataRows);
      // auto-guess mapping by header name
      const guess: Record<FieldKey, string> = {
        name: NONE,
        phone: NONE,
        city: NONE,
        accounting_code: NONE,
        notes: NONE,
      };
      hdr.forEach((h) => {
        const lc = h.toLowerCase();
        if (guess.name === NONE && /(name|نام)/i.test(lc)) guess.name = h;
        if (guess.phone === NONE && /(phone|mobile|tel|تلفن|موبایل)/i.test(lc)) guess.phone = h;
        if (guess.city === NONE && /(city|شهر)/i.test(lc)) guess.city = h;
        if (guess.accounting_code === NONE && /(account|code|کد)/i.test(lc))
          guess.accounting_code = h;
        if (guess.notes === NONE && /(note|desc|توضیح)/i.test(lc)) guess.notes = h;
      });
      setMapping(guess);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "خطا در خواندن فایل";
      toast.error(msg);
      setFile(null);
      setHeaders([]);
      setRows([]);
    } finally {
      setParsing(false);
    }
  }

  function setMap(field: FieldKey, header: string) {
    setMapping((m) => ({ ...m, [field]: header }));
  }

  function buildPayload(
    row: string[],
    headerIndex: Record<string, number>,
  ): { payload?: Record<string, string | null>; error?: string } {
    const get = (h: string) => (h === NONE ? "" : (row[headerIndex[h]] ?? "").trim());
    const name = get(mapping.name);
    if (!name) return { error: "نام مشتری خالی است" };
    if (name.length < 2 || name.length > 100)
      return { error: "طول نام باید بین ۲ تا ۱۰۰ کاراکتر باشد" };
    const phoneRaw = get(mapping.phone);
    const phone = phoneRaw ? phoneRaw.replace(/[^\d]/g, "") : "";
    if (phone && !PHONE_REGEX.test(phone)) return { error: `شماره تماس نامعتبر: ${phoneRaw}` };
    const city = get(mapping.city);
    const notes = get(mapping.notes);
    if (notes.length > 500) return { error: "طول توضیحات بیش از ۵۰۰ کاراکتر است" };
    const code = get(mapping.accounting_code);
    if (code && !CODE_REGEX.test(code)) return { error: `کد حسابداری نامعتبر: ${code}` };
    return {
      payload: {
        name,
        phone: phone || null,
        city: city || null,
        notes: notes || null,
        accounting_code: code || null,
      },
    };
  }

  async function handleImport() {
    if (!mapping.name || mapping.name === NONE) {
      toast.error("نگاشت ستون «نام مشتری» الزامی است");
      return;
    }
    if (rows.length === 0) {
      toast.error("ردیفی برای ورود وجود ندارد");
      return;
    }

    setImporting(true);
    setProgress(0);
    const errors: ImportError[] = [];
    let success = 0;
    let failed = 0;

    const headerIndex: Record<string, number> = {};
    headers.forEach((h, i) => {
      headerIndex[h] = i;
    });

    try {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const slice = rows.slice(i, i + BATCH_SIZE);
        for (let j = 0; j < slice.length; j++) {
          const rowNum = i + j + 2; // header is row 1
          const { payload, error } = buildPayload(slice[j], headerIndex);
          if (error || !payload) {
            failed += 1;
            errors.push({ row: rowNum, reason: error || "نامشخص" });
            continue;
          }
          // Item 230 — this used to INSERT straight into `customers`, creating
          // rows with no person behind them and its own ad-hoc duplicate rules.
          // It now goes through person_import_batch, which matches on
          // normalized identifiers, reuses an existing person when one is
          // found, and writes the customers row + provenance link atomically.
          const p = payload as {
            name: string;
            phone?: string | null;
            city?: string | null;
            notes?: string | null;
            accounting_code?: string | null;
          };
          const { data: batch, error: insErr } = await supabase.rpc("person_import_batch", {
            p_rows: [
              {
                display_name: p.name,
                kind: "individual",
                context_kind: "customer",
                identifiers: p.phone
                  ? [{ kind: "mobile_e164", value_raw: p.phone, is_primary: true }]
                  : [],
                city: p.city ?? null,
                notes: p.notes ?? null,
                accounting_code: p.accounting_code ?? null,
              },
            ] as never,
          });

          const rowResult = (batch as { rows?: Array<{ action?: string; reason?: string }> } | null)
            ?.rows?.[0];

          if (insErr) {
            failed += 1;
            const msg = /duplicate key|accounting_code/i.test(insErr.message)
              ? "کد حسابداری تکراری یا قالب نامعتبر"
              : insErr.message;
            errors.push({ row: rowNum, reason: msg });
          } else if (rowResult?.action === "rejected") {
            // Business-level rejection (ambiguous match, bad identifier). The
            // RPC reports these per row instead of failing the whole call.
            failed += 1;
            errors.push({ row: rowNum, reason: rowResult.reason ?? "ردیف پذیرفته نشد" });
          } else {
            success += 1;
          }
        }
        setProgress(Math.round(((i + slice.length) / rows.length) * 100));
      }

      // audit log
      if (user?.id) {
        await supabase.from("audit_logs").insert({
          actor_id: user.id,
          entity_type: "customer",
          entity_id: null,
          action: "customers_imported",
          diff: { success, failed, total: rows.length, file_name: file?.name ?? null },
        } as never);
      }

      setResult({ success, failed, errors: errors.slice(0, 100) });
      toast.success(`ورود انجام شد: ${toFaDigits(success)} موفق، ${toFaDigits(failed)} ناموفق`);
    } finally {
      setImporting(false);
      setProgress(100);
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Step 1: file */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2 font-medium">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            مرحله ۱: انتخاب فایل اکسل
          </div>
          <div className="space-y-1">
            <Label htmlFor="excel-file" className="text-xs">
              فایل xlsx یا xls (حداکثر {toFaDigits(MAX_ROWS)} ردیف)
            </Label>
            <Input
              id="excel-file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFile}
              disabled={parsing || importing}
            />
            {parsing && (
              <p className="text-xs text-muted-foreground flex items-center">
                <Loader2 className="ml-1 h-3 w-3 animate-spin" /> در حال پردازش فایل...
              </p>
            )}
            {file && !parsing && (
              <p className="text-xs text-muted-foreground">
                {file.name} — {toFaDigits(totalRows)} ردیف داده
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 2: mapping + preview */}
      {headers.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-2 font-medium">
              <Upload className="h-5 w-5 text-primary" />
              مرحله ۲: نگاشت ستون‌ها
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(Object.keys(FIELD_LABELS) as FieldKey[]).map((field) => (
                <div key={field} className="space-y-1">
                  <Label className="text-xs">{FIELD_LABELS[field]}</Label>
                  <Select value={mapping[field]} onValueChange={(v) => setMap(field, v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="انتخاب ستون..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— هیچ —</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-2">پیش‌نمایش (۵ ردیف اول):</div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headers.map((h) => (
                        <TableHead key={h} className="whitespace-nowrap">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((r, i) => (
                      <TableRow key={i}>
                        {headers.map((_, j) => (
                          <TableCell key={j} className="whitespace-nowrap text-xs">
                            {r[j] ?? ""}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                مجموع ردیف‌ها: {toFaDigits(totalRows)}
              </span>
              <Button onClick={handleImport} disabled={importing || mapping.name === NONE}>
                {importing && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                <Upload className="ml-2 h-4 w-4" />
                وارد کردن
              </Button>
            </div>

            {importing && (
              <div className="space-y-1">
                <Progress value={progress} />
                <p className="text-xs text-muted-foreground text-center">{toFaDigits(progress)}٪</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: result */}
      {result && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              نتیجه ورود
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">موفق: {toFaDigits(result.success)}</Badge>
              <Badge variant={result.failed > 0 ? "destructive" : "secondary"}>
                ناموفق: {toFaDigits(result.failed)}
              </Badge>
            </div>
            {result.errors.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-destructive" />
                  خطاها (حداکثر ۱۰۰ مورد):
                </div>
                <div className="max-h-64 overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">ردیف</TableHead>
                        <TableHead>دلیل</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.errors.map((e, i) => (
                        <TableRow key={i}>
                          <TableCell>{toFaDigits(e.row)}</TableCell>
                          <TableCell className="text-destructive text-xs">{e.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
