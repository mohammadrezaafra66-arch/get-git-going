import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";

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
import { createPerson } from "@/lib/persons/functions";
import { createPersonIdentifier } from "@/lib/persons/identifiers.functions";
import { normalizeIdentifier, type IdentifierKind } from "@/lib/persons/identifiers-normalize";
import type { PersonKind } from "@/lib/persons/schemas";

const MAX_ROWS = 1000;
const NONE = "__none__";

/** Mappable columns. Identifier columns each carry their own `person_identifiers.kind`. */
type FieldKey =
  | "display_name"
  | "legal_name"
  | "kind"
  | "notes"
  | "mobile_e164"
  | "national_id_ir"
  | "tax_id_ir"
  | "email";

const FIELD_LABELS: Record<FieldKey, string> = {
  display_name: "نام نمایشی *",
  legal_name: "نام حقوقی",
  kind: "نوع (حقیقی/حقوقی)",
  notes: "توضیحات",
  mobile_e164: "موبایل",
  national_id_ir: "کد ملی",
  tax_id_ir: "شناسه/کد اقتصادی",
  email: "ایمیل",
};

/** Which mapped columns become person_identifiers rows, and with what kind. */
const IDENTIFIER_FIELDS: { field: FieldKey; kind: IdentifierKind }[] = [
  { field: "mobile_e164", kind: "mobile_e164" },
  { field: "national_id_ir", kind: "national_id_ir" },
  { field: "tax_id_ir", kind: "tax_id_ir" },
  { field: "email", kind: "email" },
];

const EMPTY_MAPPING: Record<FieldKey, string> = {
  display_name: NONE,
  legal_name: NONE,
  kind: NONE,
  notes: NONE,
  mobile_e164: NONE,
  national_id_ir: NONE,
  tax_id_ir: NONE,
  email: NONE,
};

interface ImportIssue {
  row: number;
  reason: string;
}

interface ImportResult {
  success: number;
  failed: number;
  /** Person created but at least one identifier failed — the person is still usable. */
  identifierWarnings: ImportIssue[];
  errors: ImportIssue[];
}

function normalizeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Accepts Persian or English wording for the person kind; defaults to individual. */
function parseKind(raw: string): PersonKind {
  const s = raw.trim().toLowerCase();
  if (/organization|org|legal|حقوق|شرکت|سازمان/.test(s)) return "organization";
  return "individual";
}

export function PersonImportForm() {
  const { user } = useAuth();
  const createPersonFn = useServerFn(createPerson);
  const createIdentifierFn = useServerFn(createPersonIdentifier);

  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({ ...EMPTY_MAPPING });
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

      // Auto-guess the mapping from header text (Persian or English).
      const guess: Record<FieldKey, string> = { ...EMPTY_MAPPING };
      hdr.forEach((h) => {
        const lc = h.toLowerCase();
        if (guess.display_name === NONE && /(display|name|نام نمایشی|نام)/i.test(lc))
          guess.display_name = h;
        if (guess.legal_name === NONE && /(legal|حقوقی|رسمی)/i.test(lc)) guess.legal_name = h;
        if (guess.kind === NONE && /(kind|type|نوع)/i.test(lc)) guess.kind = h;
        if (guess.notes === NONE && /(note|desc|توضیح)/i.test(lc)) guess.notes = h;
        if (guess.mobile_e164 === NONE && /(mobile|phone|موبایل|همراه|تلفن)/i.test(lc))
          guess.mobile_e164 = h;
        if (guess.national_id_ir === NONE && /(national|melli|ملی)/i.test(lc))
          guess.national_id_ir = h;
        if (guess.tax_id_ir === NONE && /(tax|اقتصادی|شناسه ملی)/i.test(lc)) guess.tax_id_ir = h;
        if (guess.email === NONE && /(email|mail|ایمیل|رایانامه)/i.test(lc)) guess.email = h;
      });
      // The name guess can accidentally win the "نام حقوقی" column; keep them distinct.
      if (guess.legal_name === guess.display_name) guess.legal_name = NONE;
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

  async function handleImport() {
    if (mapping.display_name === NONE) {
      toast.error("نگاشت ستون «نام نمایشی» الزامی است");
      return;
    }
    if (rows.length === 0) {
      toast.error("ردیفی برای ورود وجود ندارد");
      return;
    }

    setImporting(true);
    setProgress(0);
    const errors: ImportIssue[] = [];
    const identifierWarnings: ImportIssue[] = [];
    let success = 0;
    let failed = 0;

    const headerIndex: Record<string, number> = {};
    headers.forEach((h, i) => {
      headerIndex[h] = i;
    });

    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // header occupies row 1
        const get = (h: string) => (h === NONE ? "" : (row[headerIndex[h]] ?? "").trim());

        const displayName = get(mapping.display_name);
        if (!displayName) {
          failed += 1;
          errors.push({ row: rowNum, reason: "نام نمایشی خالی است" });
          continue;
        }
        if (displayName.length > 255) {
          failed += 1;
          errors.push({ row: rowNum, reason: "طول نام نمایشی بیش از ۲۵۵ کاراکتر است" });
          continue;
        }
        const legalName = get(mapping.legal_name);
        const notes = get(mapping.notes);
        if (notes.length > 2000) {
          failed += 1;
          errors.push({ row: rowNum, reason: "طول توضیحات بیش از ۲۰۰۰ کاراکتر است" });
          continue;
        }

        let personId: string;
        try {
          const person = await createPersonFn({
            data: {
              kind: parseKind(get(mapping.kind)),
              display_name: displayName,
              legal_name: legalName || null,
              notes: notes || null,
            },
          });
          personId = person.id;
          success += 1;
        } catch (err) {
          failed += 1;
          errors.push({
            row: rowNum,
            reason: err instanceof Error ? err.message : "ثبت شخص ناموفق بود",
          });
          continue;
        }

        // Identifiers are best-effort: a bad phone number must not discard the
        // person row that was already created.
        for (const { field, kind } of IDENTIFIER_FIELDS) {
          const raw = get(mapping[field]);
          if (!raw) continue;
          const norm = normalizeIdentifier(kind, raw);
          if (!norm.ok) {
            identifierWarnings.push({
              row: rowNum,
              reason: `${FIELD_LABELS[field]}: ${norm.message_fa}`,
            });
            continue;
          }
          try {
            await createIdentifierFn({
              data: { person_id: personId, kind, value_raw: raw, is_primary: false },
            });
          } catch (err) {
            identifierWarnings.push({
              row: rowNum,
              reason: `${FIELD_LABELS[field]}: ${err instanceof Error ? err.message : "ثبت شناسه ناموفق بود"}`,
            });
          }
        }

        setProgress(Math.round(((i + 1) / rows.length) * 100));
      }

      if (user?.id) {
        await supabase.from("audit_logs").insert({
          actor_id: user.id,
          entity_type: "person",
          entity_id: null,
          action: "persons_imported",
          diff: {
            success,
            failed,
            total: rows.length,
            identifier_warnings: identifierWarnings.length,
            file_name: file?.name ?? null,
          },
        } as never);
      }

      setResult({
        success,
        failed,
        errors: errors.slice(0, 100),
        identifierWarnings: identifierWarnings.slice(0, 100),
      });
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
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-2 font-medium">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            مرحله ۱: انتخاب فایل اکسل
          </div>
          <div className="space-y-1">
            <Label htmlFor="persons-excel-file" className="text-xs">
              فایل xlsx یا xls (حداکثر {toFaDigits(MAX_ROWS)} ردیف)
            </Label>
            <Input
              id="persons-excel-file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFile}
              disabled={parsing || importing}
            />
            {parsing && (
              <p className="flex items-center text-xs text-muted-foreground">
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
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2 font-medium">
              <Upload className="h-5 w-5 text-primary" />
              مرحله ۲: نگاشت ستون‌ها
            </div>
            <p className="text-xs text-muted-foreground">
              ستون‌های موبایل، کد ملی، شناسه اقتصادی و ایمیل به‌عنوان «شناسه شخص» ثبت می‌شوند و قبل
              از ثبت اعتبارسنجی و نرمال‌سازی می‌گردند.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <div className="mb-2 text-xs text-muted-foreground">پیش‌نمایش (۵ ردیف اول):</div>
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
              <Button onClick={handleImport} disabled={importing || mapping.display_name === NONE}>
                {importing && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                <Upload className="ml-2 h-4 w-4" />
                وارد کردن
              </Button>
            </div>

            {importing && (
              <div className="space-y-1">
                <Progress value={progress} />
                <p className="text-center text-xs text-muted-foreground">{toFaDigits(progress)}٪</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: result */}
      {result && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              نتیجه ورود
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">موفق: {toFaDigits(result.success)}</Badge>
              <Badge variant={result.failed > 0 ? "destructive" : "secondary"}>
                ناموفق: {toFaDigits(result.failed)}
              </Badge>
              {result.identifierWarnings.length > 0 && (
                <Badge variant="outline">
                  شناسه‌های ثبت‌نشده: {toFaDigits(result.identifierWarnings.length)}
                </Badge>
              )}
            </div>

            {result.errors.length > 0 && (
              <IssueTable
                title="خطاها — این ردیف‌ها ثبت نشدند (حداکثر ۱۰۰ مورد):"
                issues={result.errors}
                tone="error"
              />
            )}
            {result.identifierWarnings.length > 0 && (
              <IssueTable
                title="هشدارها — شخص ثبت شد ولی این شناسه‌ها ثبت نشدند:"
                issues={result.identifierWarnings}
                tone="warn"
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function IssueTable({
  title,
  issues,
  tone,
}: {
  title: string;
  issues: ImportIssue[];
  tone: "error" | "warn";
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <AlertTriangle
          className={tone === "error" ? "h-3 w-3 text-destructive" : "h-3 w-3 text-amber-600"}
        />
        {title}
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
            {issues.map((e, i) => (
              <TableRow key={i}>
                <TableCell>{toFaDigits(e.row)}</TableCell>
                <TableCell
                  className={
                    tone === "error"
                      ? "text-xs text-destructive"
                      : "text-xs text-amber-700 dark:text-amber-400"
                  }
                >
                  {e.reason}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
