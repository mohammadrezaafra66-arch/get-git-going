import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, BookOpen, Copy, Check, Loader2, Play, Eye, EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { requirePermission } from "@/lib/rbac/route-guards";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createFileRoute("/_app/bot-api-keys/docs")({
  beforeLoad: async () => { await requirePermission("bot-api-keys", "view"); },
  component: BotApiDocsPage,
});

interface KeyOpt { id: string; name: string; key_prefix: string | null; is_active: boolean }
interface AccessTable { id: string; name: string; slug: string; can_read: boolean; can_update: boolean }

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("کپی شد.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("کپی ناموفق بود.");
    }
  };
  return (
    <div className="relative group">
      {lang && (
        <Badge variant="secondary" className="absolute top-2 left-2 z-10 font-mono text-[10px]">
          {lang}
        </Badge>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={copy}
        className="absolute top-2 right-2 z-10 h-7"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
      <pre
        className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 pt-10 text-xs font-mono leading-relaxed"
        dir="ltr"
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

function BotApiDocsPage() {
  const { user } = useAuth();
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const docCurlGet = `curl -X GET "${baseUrl}/api/public/bot/dynamic-tables/<TABLE_ID>/rows?page=1&page_size=50&search=foo" \\
  -H "Authorization: Bearer <API_KEY>"`;

  const docCurlPatch = `curl -X PATCH "${baseUrl}/api/public/bot/dynamic-tables/<TABLE_ID>/rows/<ROW_ID>" \\
  -H "Authorization: Bearer <API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"values": {"status": "done", "qty": 12}}'`;

  const sampleSuccessGet = JSON.stringify({
    rows: [
      {
        row_id: "11111111-1111-1111-1111-111111111111",
        row_number: 1,
        is_active: true,
        created_at: "2026-04-26T10:00:00Z",
        updated_at: "2026-04-26T10:00:00Z",
        values: { name: "نمونه", qty: 5, status: "open" },
      },
    ],
    pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 },
  }, null, 2);

  const sampleSuccessPatch = JSON.stringify({
    row_id: "11111111-1111-1111-1111-111111111111",
    updated_count: 2,
    applied_columns: ["status", "qty"],
  }, null, 2);

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Bot API Docs</h1>
      <PageHeader
        title="مستندات و تست API ربات"
        description="راهنمای استفاده از endpointهای عمومی ربات و ابزار تست داخلی"
        actions={
          <Button asChild variant="outline">
            <Link to="/bot-api-keys"><ArrowLeft className="ml-2 h-4 w-4" />بازگشت</Link>
          </Button>
        }
      />

      <Tabs defaultValue="docs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="docs"><BookOpen className="ml-2 h-4 w-4" />مستندات</TabsTrigger>
          <TabsTrigger value="test"><Play className="ml-2 h-4 w-4" />تست داخلی</TabsTrigger>
        </TabsList>

        <TabsContent value="docs" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">معرفی Bot API</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm leading-7">
              <p>
                Bot API یک رابط امن و عمومی برای اتصال ربات‌ها (مانند ربات‌های تلگرام، اسکریپت‌های
                خودکار یا سرویس‌های خارجی) به «جداول داده پویا» این سامانه است.
              </p>
              <p>
                با این API می‌توان ردیف‌های یک جدول مشخص را خواند یا مقدار ستون‌های مجاز را
                به‌روزرسانی کرد. هر کلید API فقط به جداول و ستون‌هایی دسترسی دارد که مدیر صریحاً به
                آن داده باشد.
              </p>
              <ul className="list-disc pr-5 space-y-1 text-xs text-muted-foreground">
                <li>دو endpoint عمومی: GET برای خواندن، PATCH برای به‌روزرسانی</li>
                <li>احراز هویت با هدر <code dir="ltr">Authorization: Bearer &lt;API_KEY&gt;</code></li>
                <li>کنترل دسترسی در سطح جدول و ستون، با Rate Limit و ثبت Usage Log</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">ساخت کلید API</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm leading-7">
              <ol className="list-decimal pr-5 space-y-1">
                <li>به صفحه <Link to="/bot-api-keys" className="underline">کلیدهای API</Link> بروید و «کلید جدید» بسازید.</li>
                <li>کلید خام فقط یک‌بار نمایش داده می‌شود؛ آن را در محل امنی ذخیره کنید.</li>
                <li>از بخش «دسترسی جداول» کلید را به جدول مورد نظر متصل کنید.</li>
                <li>برای هر جدول، گزینه‌های <strong>read</strong> و در صورت نیاز <strong>update</strong> را فعال کنید.</li>
                <li>اگر update فعال است، ستون‌های مجاز برای تغییر را در «ستون‌های قابل به‌روزرسانی» انتخاب کنید.</li>
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">احراز هویت</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                همه درخواست‌ها باید در هدر <code className="font-mono" dir="ltr">Authorization</code>{" "}
                دارای کلید API به شکل زیر باشند:
              </p>
              <CodeBlock lang="header" code={`Authorization: Bearer <API_KEY>`} />
              <p className="text-xs text-muted-foreground">
                کلید فقط یک‌بار هنگام ساخت نمایش داده می‌شود و در سرور به‌صورت رمزشده ذخیره می‌شود.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="outline">GET</Badge>
                خواندن ردیف‌های جدول
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <CodeBlock lang="endpoint" code={`GET /api/public/bot/dynamic-tables/{table_id}/rows`} />
              <div>
                <p className="font-medium mb-1">پارامترهای Query</p>
                <ul className="list-disc pr-5 space-y-1 text-xs text-muted-foreground">
                  <li><code dir="ltr">page</code> — شماره صفحه (پیش‌فرض ۱)</li>
                  <li><code dir="ltr">page_size</code> — اندازه صفحه (پیش‌فرض ۵۰، حداکثر ۱۰۰)</li>
                  <li><code dir="ltr">search</code> — جستجوی متنی روی مقادیر ردیف‌ها</li>
                </ul>
              </div>
              <CodeBlock lang="curl" code={docCurlGet} />
              <div>
                <p className="font-medium mb-1">نمونه پاسخ موفق (200)</p>
                <CodeBlock lang="json" code={sampleSuccessGet} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="outline">PATCH</Badge>
                به‌روزرسانی یک ردیف
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <CodeBlock
                lang="endpoint"
                code={`PATCH /api/public/bot/dynamic-tables/{table_id}/rows/{row_id}`}
              />
              <div>
                <p className="font-medium mb-1">بدنه درخواست</p>
                <CodeBlock lang="json" code={`{ "values": { "<column_key>": <value>, ... } }`} />
                <p className="text-xs text-muted-foreground mt-2">
                  تنها ستون‌های موجود در «ستون‌های قابل تغییر» این کلید قابل به‌روزرسانی هستند. مقدارها
                  بر اساس نوع ستون اعتبارسنجی می‌شوند (عدد، بولی، تاریخ و ...).
                </p>
              </div>
              <CodeBlock lang="curl" code={docCurlPatch} />
              <div>
                <p className="font-medium mb-1">نمونه پاسخ موفق (200)</p>
                <CodeBlock lang="json" code={sampleSuccessPatch} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">خطاهای رایج</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <ErrorRow status={401} code="invalid_key | missing_key | inactive_key | expired_key"
                  desc="کلید API نامعتبر، غیرفعال، منقضی یا ارسال نشده است." />
                <ErrorRow status={403} code="forbidden_table | forbidden_read | forbidden_update | column_not_allowed"
                  desc="کلید مجوز دسترسی به این جدول/ستون را ندارد." />
                <ErrorRow status={404} code="row_not_found"
                  desc="ردیف موردنظر یافت نشد." />
                <ErrorRow status={400} code="invalid_values | invalid_number | invalid_boolean | invalid_date | invalid_datetime"
                  desc="بدنه درخواست یا مقدار یکی از ستون‌ها نامعتبر است." />
                <ErrorRow status={429} code="rate_limit_per_minute | rate_limit_per_day | rate_limit_ip_failures"
                  desc="از حد مجاز درخواست‌ها عبور کرده‌اید. هدر Retry-After را بررسی کنید." />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="outline">GET</Badge>
                محصولات (برای ربات ووردپرس)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                این endpoint محصولات را بر اساس برچسب‌های مجاز هر کلید برمی‌گرداند.
                برچسب‌های مجاز را از دکمه «دسترسی برچسب محصولات» در صفحه کلیدها تنظیم کنید.
                اگر هیچ برچسبی برای کلید فعال نباشد، پاسخ <code dir="ltr">403 forbidden_no_labels</code> خواهد بود.
              </p>
              <CodeBlock lang="endpoint" code={`GET /api/public/bot/products`} />
              <div>
                <p className="font-medium mb-1">پارامترهای Query</p>
                <ul className="list-disc pr-5 space-y-1 text-xs text-muted-foreground">
                  <li><code dir="ltr">label_id</code> — اختیاری؛ فقط محصولات یک برچسب خاص (باید در فهرست مجاز کلید باشد)</li>
                  <li><code dir="ltr">updated_since</code> — اختیاری؛ ISO datetime برای sync تدریجی</li>
                  <li><code dir="ltr">page</code>, <code dir="ltr">page_size</code> — صفحه‌بندی (حداکثر ۱۰۰)</li>
                </ul>
              </div>
              <CodeBlock
                lang="curl"
                code={`curl -X GET "${baseUrl}/api/public/bot/products?page=1&page_size=50" \\
  -H "Authorization: Bearer <API_KEY>"`}
              />
              <CodeBlock lang="endpoint" code={`GET /api/public/bot/products/{product_id}`} />
              <p className="text-xs text-muted-foreground">
                جزئیات یک محصول شامل برند، دسته، همه برچسب‌ها، همه قیمت‌های فعال (به ازای هر نوع‌قیمت) و
                ویژگی‌های داینامیک. اگر هیچ‌یک از برچسب‌های مجاز کلید روی این محصول نباشد،
                پاسخ <code dir="ltr">403 forbidden_product</code> خواهد بود.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">محدودیت نرخ (Rate Limit)</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm leading-7">
              <ul className="list-disc pr-5 space-y-1">
                <li>حداکثر <strong>۱۲۰ درخواست در دقیقه</strong> برای هر کلید.</li>
                <li>حداکثر <strong>۵۰۰۰ درخواست در روز</strong> برای هر کلید.</li>
                <li>حداکثر <strong>۳۰ درخواست ناموفق در ۱۰ دقیقه</strong> برای هر IP (برای جلوگیری از حملات brute-force).</li>
              </ul>
              <p className="text-xs text-muted-foreground">
                در صورت عبور از سقف، پاسخ <code dir="ltr">HTTP 429</code> همراه با هدر
                <code dir="ltr"> Retry-After</code> برمی‌گردد. مقدار این هدر به ثانیه است و نشان می‌دهد
                ربات باید پیش از ارسال درخواست بعدی چقدر صبر کند.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">نمونه درخواست با curl</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="font-medium mb-1">GET — خواندن ردیف‌ها</p>
                <CodeBlock lang="bash" code={docCurlGet} />
              </div>
              <div>
                <p className="font-medium mb-1">PATCH — به‌روزرسانی یک ردیف</p>
                <CodeBlock lang="bash" code={docCurlPatch} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">چک‌لیست اتصال ربات</CardTitle></CardHeader>
            <CardContent className="text-sm leading-7">
              <ol className="list-decimal pr-5 space-y-1">
                <li>یک کلید API بسازید و کلید خام را ذخیره کنید.</li>
                <li>کلید را به جدول هدف متصل کرده و سطح دسترسی (read / update) را تعیین کنید.</li>
                <li>اگر نیاز به تغییر ستون‌ها هست، ستون‌های قابل update را مشخص کنید.</li>
                <li>درخواست را در «<Link to="/bot-api-keys/playground" className="underline">API Playground</Link>» تست کنید.</li>
                <li>کلید را در ربات/سرویس خود تنظیم کرده و درخواست‌ها را ارسال کنید.</li>
                <li>مصرف و خطاها را در «<Link to="/bot-api-keys/usage" className="underline">گزارش استفاده</Link>» پایش کنید.</li>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="test">
          <BotApiTester baseUrl={baseUrl} userReady={!!user} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ErrorRow({ status, code, desc }: { status: number; code: string; desc: string }) {
  return (
    <div className="flex flex-wrap items-start gap-2 rounded-md border border-border p-2">
      <Badge variant="destructive">{status}</Badge>
      <code className="font-mono text-xs" dir="ltr">{code}</code>
      <span className="text-xs text-muted-foreground flex-1 min-w-[200px]">{desc}</span>
    </div>
  );
}

/* ----------------------------- Tester ----------------------------- */

function BotApiTester({ baseUrl, userReady }: { baseUrl: string; userReady: boolean }) {
  // Raw API key lives ONLY in component state (lost on refresh, never persisted)
  const [rawKey, setRawKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keyId, setKeyId] = useState<string>("");
  const [tableId, setTableId] = useState<string>("");

  // GET state
  const [page, setPage] = useState("1");
  const [pageSize, setPageSize] = useState("10");
  const [search, setSearch] = useState("");

  // PATCH state
  const [rowId, setRowId] = useState("");
  const [valuesJson, setValuesJson] = useState(`{\n  "column_key": "value"\n}`);

  // Response state
  const [busy, setBusy] = useState(false);
  const [resStatus, setResStatus] = useState<number | null>(null);
  const [resBody, setResBody] = useState<string>("");

  const keysQuery = useQuery({
    enabled: userReady,
    queryKey: ["bot-keys-tester"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bot_api_keys")
        .select("id, name, key_prefix, is_active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as KeyOpt[];
    },
  });

  const accessQuery = useQuery({
    enabled: !!keyId,
    queryKey: ["bot-key-access-tables", keyId],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bot_api_key_table_access")
        .select("table_id, can_read, can_update, dynamic_tables:table_id(id, name, slug)")
        .eq("api_key_id", keyId);
      if (error) throw error;
      type Row = {
        table_id: string;
        can_read: boolean;
        can_update: boolean;
        dynamic_tables: { id: string; name: string; slug: string } | null;
      };
      return ((data ?? []) as unknown as Row[])
        .filter((r) => r.dynamic_tables)
        .map((r) => ({
          id: r.dynamic_tables!.id,
          name: r.dynamic_tables!.name,
          slug: r.dynamic_tables!.slug,
          can_read: r.can_read,
          can_update: r.can_update,
        })) as AccessTable[];
    },
  });

  const tables = accessQuery.data ?? [];
  const selectedTable = useMemo(() => tables.find((t) => t.id === tableId) ?? null, [tables, tableId]);

  const send = async (mode: "GET" | "PATCH") => {
    if (!rawKey.trim()) { toast.error("کلید API را وارد کنید."); return; }
    if (!tableId) { toast.error("یک جدول مجاز انتخاب کنید."); return; }
    if (mode === "PATCH" && !rowId.trim()) { toast.error("شناسه ردیف را وارد کنید."); return; }

    let body: string | undefined;
    if (mode === "PATCH") {
      try {
        const parsed = JSON.parse(valuesJson);
        body = JSON.stringify({ values: parsed });
      } catch {
        toast.error("JSON ستون‌ها معتبر نیست.");
        return;
      }
    }

    setBusy(true);
    setResStatus(null);
    setResBody("");

    try {
      let url = `${baseUrl}/api/public/bot/dynamic-tables/${tableId}/rows`;
      const init: RequestInit = {
        method: mode,
        headers: {
          Authorization: `Bearer ${rawKey.trim()}`,
          ...(mode === "PATCH" ? { "Content-Type": "application/json" } : {}),
        },
      };
      if (mode === "GET") {
        const params = new URLSearchParams();
        if (page) params.set("page", page);
        if (pageSize) params.set("page_size", pageSize);
        if (search.trim()) params.set("search", search.trim());
        const qs = params.toString();
        if (qs) url += `?${qs}`;
      } else {
        url += `/${rowId.trim()}`;
        init.body = body;
      }

      const res = await fetch(url, init);
      setResStatus(res.status);
      const text = await res.text();
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        try { setResBody(JSON.stringify(JSON.parse(text), null, 2)); }
        catch { setResBody(text); }
      } else if (text.trimStart().startsWith("<!DOCTYPE") || text.trimStart().startsWith("<html")) {
        setResBody(
          "⚠️ سرور به‌جای JSON، صفحه HTML برگرداند.\n" +
          "این معمولاً یعنی نسخه فعلی برنامه هنوز publish نشده و endpoint روی production در دسترس نیست.\n" +
          "برای رفع: روی دکمه Publish کلیک کنید و چند لحظه بعد دوباره تست کنید.",
        );
      } else {
        setResBody(text || "(پاسخ خالی)");
      }
    } catch (e: unknown) {
      setResStatus(0);
      setResBody(`خطای شبکه: ${(e as Error)?.message ?? "نامشخص"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">پیکربندی تست</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
            کلید API فقط در حافظه همین صفحه نگهداری می‌شود و با رفرش پاک می‌شود. هرگز در دیتابیس ذخیره نمی‌شود.
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">انتخاب کلید (برای فیلتر جداول مجاز)</Label>
              <Select value={keyId} onValueChange={(v) => { setKeyId(v); setTableId(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder={keysQuery.isLoading ? "در حال بارگذاری…" : "یک کلید انتخاب کنید"} />
                </SelectTrigger>
                <SelectContent>
                  {(keysQuery.data ?? []).map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.name} {k.is_active ? "" : "(غیرفعال)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">کلید خام (Bearer)</Label>
              <div className="flex gap-2">
                <Input
                  type={showKey ? "text" : "password"}
                  dir="ltr"
                  placeholder="bk_…"
                  value={rawKey}
                  onChange={(e) => setRawKey(e.target.value)}
                  className="font-mono"
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setShowKey((s) => !s)}>
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">جدول مجاز برای این کلید</Label>
              <Select value={tableId} onValueChange={setTableId} disabled={!keyId}>
                <SelectTrigger>
                  <SelectValue placeholder={!keyId ? "ابتدا کلید را انتخاب کنید" : "یک جدول انتخاب کنید"} />
                </SelectTrigger>
                <SelectContent>
                  {tables.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} — {t.can_read ? "خواندن" : "—"}{t.can_update ? "/به‌روزرسانی" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {keyId && tables.length === 0 && !accessQuery.isLoading && (
                <p className="text-xs text-muted-foreground">این کلید به هیچ جدولی متصل نیست.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="get">
        <TabsList>
          <TabsTrigger value="get">GET — خواندن</TabsTrigger>
          <TabsTrigger value="patch">PATCH — به‌روزرسانی</TabsTrigger>
        </TabsList>

        <TabsContent value="get">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">page</Label>
                  <Input type="number" min={1} dir="ltr" value={page} onChange={(e) => setPage(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">page_size (≤۱۰۰)</Label>
                  <Input type="number" min={1} max={100} dir="ltr" value={pageSize}
                    onChange={(e) => setPageSize(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">search (اختیاری)</Label>
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </div>
              <Button onClick={() => send("GET")} disabled={busy}>
                {busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Play className="ml-2 h-4 w-4" />}
                ارسال درخواست GET
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="patch">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="space-y-1">
                <Label className="text-xs">شناسه ردیف (row_id UUID)</Label>
                <Input dir="ltr" value={rowId} onChange={(e) => setRowId(e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">مقادیر (JSON object از column_key → value)</Label>
                <Textarea
                  dir="ltr"
                  rows={6}
                  value={valuesJson}
                  onChange={(e) => setValuesJson(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <Button
                onClick={() => send("PATCH")}
                disabled={busy || !selectedTable?.can_update}
              >
                {busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Play className="ml-2 h-4 w-4" />}
                ارسال درخواست PATCH
              </Button>
              {selectedTable && !selectedTable.can_update && (
                <p className="text-xs text-muted-foreground">
                  این کلید مجوز به‌روزرسانی این جدول را ندارد.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {(resStatus !== null || resBody) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              پاسخ
              {resStatus !== null && (
                <Badge variant={resStatus >= 200 && resStatus < 300 ? "secondary" : "destructive"}>
                  HTTP {resStatus}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock lang="json" code={resBody || "(خالی)"} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}