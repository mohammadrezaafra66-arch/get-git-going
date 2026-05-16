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

  const docCurlPost = `curl -X POST "${baseUrl}/api/public/bot/dynamic-tables/<TABLE_ID>/rows" \\
  -H "Authorization: Bearer <API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "values": {
      "source": "rubika",
      "customer_name": "علی رضایی",
      "mobile": "09121234567",
      "message": "متن استخراج‌شده توسط ربات",
      "status": "new"
    }
  }'`;

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

  const sampleSuccessPost = JSON.stringify({
    row_id: "22222222-2222-2222-2222-222222222222",
    row_number: 42,
    is_active: true,
    created_at: "2026-05-16T10:00:00Z",
    updated_at: "2026-05-16T10:00:00Z",
    values: {
      source: "rubika",
      customer_name: "علی رضایی",
      mobile: "09121234567",
      status: "new",
    },
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
          <Tabs defaultValue="dynamic" className="space-y-4">
            <TabsList>
              <TabsTrigger value="dynamic">جدول‌های داینامیک</TabsTrigger>
              <TabsTrigger value="products">محصولات / ربات ووردپرس</TabsTrigger>
            </TabsList>
            <TabsContent value="dynamic" className="space-y-4">
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
                <li>سه endpoint عمومی: GET برای خواندن، POST برای افزودن ردیف، PATCH برای به‌روزرسانی</li>
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
                <li>توجه: برای افزودن ردیف جدید توسط ربات (POST)، گزینه «به‌روزرسانی» باید فعال باشد و ستون‌های مجاز انتخاب شده باشند.</li>
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
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="outline">POST</Badge>
                افزودن ردیف جدید (ثبت داده استخراجی ربات)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <CodeBlock
                lang="endpoint"
                code={`POST /api/public/bot/dynamic-tables/{table_id}/rows`}
              />
              <div>
                <p className="font-medium mb-1">بدنه درخواست (پیشنهادی)</p>
                <CodeBlock lang="json" code={`{ "values": { "<column_key>": <value>, ... } }`} />
                <p className="text-xs text-muted-foreground mt-2">
                  فقط ستون‌های موجود در «ستون‌های قابل به‌روزرسانی» این کلید قابل ثبت هستند.
                  ستون‌های الزامی (is_required) باید مقدار داشته باشند، در غیر این صورت خطای
                  <code dir="ltr"> required_column_missing</code> برمی‌گردد. نوع داده هر ستون
                  اعتبارسنجی می‌شود.
                </p>
              </div>
              <CodeBlock lang="curl" code={docCurlPost} />
              <div>
                <p className="font-medium mb-1">نمونه پاسخ موفق (201)</p>
                <CodeBlock lang="json" code={sampleSuccessPost} />
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
                <ErrorRow status={400} code="invalid_json | invalid_values | unknown_column"
                  desc="بدنه درخواست JSON معتبر نیست، آبجکت نیست، یا ستون ناشناخته‌ای ارسال شده است." />
                <ErrorRow status={400} code="required_column_missing"
                  desc="یکی از ستون‌های الزامی در POST مقدار ندارد." />
                <ErrorRow status={400} code="invalid_number | invalid_boolean | invalid_date | invalid_datetime | value_too_long"
                  desc="مقدار یکی از ستون‌ها با نوع داده ستون سازگار نیست." />
                <ErrorRow status={413} code="body_too_large"
                  desc="اندازه بدنه درخواست بیش از حد مجاز (۶۴ کیلوبایت) است." />
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
                مستندات کامل این بخش به تب «محصولات / ربات ووردپرس» منتقل شده است.
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
              <div>
                <p className="font-medium mb-1">POST — افزودن ردیف جدید</p>
                <CodeBlock lang="bash" code={docCurlPost} />
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

            <TabsContent value="products" className="space-y-4">
              <ProductsDocs baseUrl={baseUrl} />
            </TabsContent>
          </Tabs>
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

  // POST state (new row)
  const [postValuesJson, setPostValuesJson] = useState(
    `{\n  "source": "rubika",\n  "title": "نمونه داده استخراج‌شده",\n  "message": "این یک پیام تستی از ربات است",\n  "status": "new"\n}`,
  );

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

  const send = async (mode: "GET" | "PATCH" | "POST") => {
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
    } else if (mode === "POST") {
      try {
        const parsed = JSON.parse(postValuesJson);
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
          ...(mode === "PATCH" || mode === "POST" ? { "Content-Type": "application/json" } : {}),
        },
      };
      if (mode === "GET") {
        const params = new URLSearchParams();
        if (page) params.set("page", page);
        if (pageSize) params.set("page_size", pageSize);
        if (search.trim()) params.set("search", search.trim());
        const qs = params.toString();
        if (qs) url += `?${qs}`;
      } else if (mode === "PATCH") {
        url += `/${rowId.trim()}`;
        init.body = body;
      } else {
        // POST — create row
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
          <TabsTrigger value="post">POST — افزودن</TabsTrigger>
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

        <TabsContent value="post">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="space-y-1">
                <Label className="text-xs">مقادیر ردیف جدید (JSON object از column_key → value)</Label>
                <Textarea
                  dir="ltr"
                  rows={8}
                  value={postValuesJson}
                  onChange={(e) => setPostValuesJson(e.target.value)}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  فقط ستون‌هایی پذیرفته می‌شوند که در «ستون‌های قابل به‌روزرسانی» این کلید مجاز هستند.
                  ستون‌های الزامی باید مقدار داشته باشند.
                </p>
              </div>
              <Button
                onClick={() => send("POST")}
                disabled={busy || !selectedTable?.can_update}
              >
                {busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Play className="ml-2 h-4 w-4" />}
                ارسال درخواست POST
              </Button>
              {selectedTable && !selectedTable.can_update && (
                <p className="text-xs text-muted-foreground">
                  برای ثبت ردیف جدید، گزینه «به‌روزرسانی» این جدول باید فعال باشد.
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

/* ----------------------------- Products Docs (WordPress) ----------------------------- */

function ProductsDocs({ baseUrl }: { baseUrl: string }) {
  const sampleList = JSON.stringify({
    products: [
      {
        id: "8f2c9d10-0001-4a11-9b22-aaaaaaaaaaaa",
        sku: "SAM-A55-128-BLK",
        name: "گوشی سامسونگ A55 ظرفیت ۱۲۸ مشکی",
        brand: { id: "b1", title: "سامسونگ" },
        category: { id: "c1", title: "گوشی موبایل" },
        status: "active",
        stock_status: "in_stock",
        labels: [
          { id: "lbl-001", title: "وب‌سایت اصلی", color: "#16a34a" },
        ],
        prices: [
          {
            sale_price_type_id: "spt-1",
            sale_price_type_title: "خرده‌فروشی نقدی",
            amount: 18500000,
            currency: "IRT",
            computed_at: "2026-05-09T08:30:00Z",
          },
          {
            sale_price_type_id: "spt-2",
            sale_price_type_title: "عمده نقدی",
            amount: 17900000,
            currency: "IRT",
            computed_at: "2026-05-09T08:30:00Z",
          },
        ],
        updated_at: "2026-05-09T08:31:12Z",
      },
    ],
    pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 },
  }, null, 2);

  const sampleSingle = JSON.stringify({
    product: {
      id: "8f2c9d10-0001-4a11-9b22-aaaaaaaaaaaa",
      sku: "SAM-A55-128-BLK",
      name: "گوشی سامسونگ A55 ظرفیت ۱۲۸ مشکی",
      description: "...",
      unit: "عدد",
      brand: { id: "b1", title: "سامسونگ" },
      category: { id: "c1", title: "گوشی موبایل" },
      status: "active",
      stock_status: "in_stock",
      color: "مشکی",
      capacity: "128GB",
      model: "A55",
      labels: [
        { id: "lbl-001", title: "وب‌سایت اصلی", color: "#16a34a" },
      ],
      attributes: { ram: "8GB", screen: "6.6 inch" },
      prices: [
        { sale_price_type_id: "spt-1", sale_price_type_title: "خرده‌فروشی نقدی", amount: 18500000, currency: "IRT", computed_at: "2026-05-09T08:30:00Z" },
        { sale_price_type_id: "spt-2", sale_price_type_title: "عمده نقدی", amount: 17900000, currency: "IRT", computed_at: "2026-05-09T08:30:00Z" },
      ],
      created_at: "2026-01-12T10:00:00Z",
      updated_at: "2026-05-09T08:31:12Z",
    },
  }, null, 2);

  const phpCode = `<?php
/**
 * افراکالا → ووردپرس Sync
 * این فایل را در پوشه پلاگین خود بگذارید و از طریق WP-Cron یا cron سرور اجرا کنید.
 */

define('AFRA_API_BASE', '${baseUrl}');
define('AFRA_API_KEY',  'bk_xxxxxxxxxxxxxxxxxxxxxx'); // در wp-config.php نگه دارید

function afra_fetch_products($page = 1, $updated_since = null) {
    $url = AFRA_API_BASE . '/api/public/bot/products?page=' . $page . '&page_size=100';
    if ($updated_since) {
        $url .= '&updated_since=' . urlencode($updated_since);
    }
    $res = wp_remote_get($url, [
        'headers' => [ 'Authorization' => 'Bearer ' . AFRA_API_KEY ],
        'timeout' => 30,
    ]);
    if (is_wp_error($res)) return null;
    return json_decode(wp_remote_retrieve_body($res), true);
}

function afra_sync_all() {
    $last = get_option('afra_last_sync_at', null);
    $page = 1;
    do {
        $data = afra_fetch_products($page, $last);
        if (empty($data['products'])) break;

        foreach ($data['products'] as $p) {
            // ۱) پیدا کردن محصول WP بر اساس SKU
            $post_id = wc_get_product_id_by_sku($p['sku']);
            if (!$post_id) continue;

            // ۲) به‌روزرسانی نام
            wp_update_post([ 'ID' => $post_id, 'post_title' => $p['name'] ]);

            // ۳) قیمت — انتخاب «خرده‌فروشی نقدی»
            foreach ($p['prices'] as $pr) {
                if ($pr['sale_price_type_title'] === 'خرده‌فروشی نقدی') {
                    update_post_meta($post_id, '_regular_price', $pr['amount']);
                    update_post_meta($post_id, '_price',         $pr['amount']);
                    break;
                }
            }

            // ۴) برچسب‌ها
            $tags = array_map(fn($l) => $l['title'], $p['labels']);
            wp_set_object_terms($post_id, $tags, 'product_tag');

            // ۵) موجودی
            update_post_meta($post_id, '_stock_status',
                $p['stock_status'] === 'in_stock' ? 'instock' : 'outofstock');
        }

        $page++;
    } while ($page <= ($data['pagination']['total_pages'] ?? 1));

    update_option('afra_last_sync_at', gmdate('c'));
}

// زمان‌بندی هر ۱۵ دقیقه
if (!wp_next_scheduled('afra_sync_event')) {
    wp_schedule_event(time(), 'fifteen_minutes', 'afra_sync_event');
}
add_action('afra_sync_event', 'afra_sync_all');
`;

  const nodeCode = `// Node.js — اسکریپت ساده sync
const BASE = "${baseUrl}";
const KEY  = process.env.AFRA_API_KEY;

async function syncAll(updatedSince) {
  let page = 1, totalPages = 1;
  do {
    const url = new URL(BASE + "/api/public/bot/products");
    url.searchParams.set("page", page);
    url.searchParams.set("page_size", "100");
    if (updatedSince) url.searchParams.set("updated_since", updatedSince);

    const res = await fetch(url, { headers: { Authorization: "Bearer " + KEY } });
    if (!res.ok) throw new Error("HTTP " + res.status + " — " + await res.text());
    const data = await res.json();
    totalPages = data.pagination.total_pages;

    for (const p of data.products) {
      // اینجا منطق sync خودتون رو بنویسید
      console.log(p.sku, "→", p.name, p.prices[0]?.amount);
    }
    page++;
  } while (page <= totalPages);
}

syncAll(process.env.LAST_SYNC).catch(console.error);
`;

  const curlList = `curl -X GET "${baseUrl}/api/public/bot/products?page=1&page_size=50" \\
  -H "Authorization: Bearer <API_KEY>"`;

  const curlByLabel = `curl -X GET "${baseUrl}/api/public/bot/products?label_id=<LABEL_UUID>&updated_since=2026-05-01T00:00:00Z" \\
  -H "Authorization: Bearer <API_KEY>"`;

  const curlSingle = `curl -X GET "${baseUrl}/api/public/bot/products/<PRODUCT_ID>" \\
  -H "Authorization: Bearer <API_KEY>"`;

  return (
    <div className="space-y-4">
      {/* TOC */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">فهرست</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground leading-7">
          ۱) سناریو · ۲) پیش‌نیاز و ساخت کلید · ۳) GET لیست محصولات · ۴) GET تک محصول ·
          ۵) ساختار قیمت · ۶) Sync تدریجی · ۷) نمونه کد PHP / Node / curl · ۸) خطاها · ۹) چک‌لیست راه‌اندازی
        </CardContent>
      </Card>

      {/* 1 */}
      <Card>
        <CardHeader><CardTitle className="text-base">۱) سناریو</CardTitle></CardHeader>
        <CardContent className="text-sm leading-7 space-y-2">
          <p>
            یک سایت ووردپرس (یا ووکامرس) از قبل دارید و محصولات را آنجا منتشر کرده‌اید. می‌خواهید
            <strong> قیمت، نام، برچسب، موجودی</strong> را از سامانه افراکالا به‌صورت خودکار روی همان
            محصولات وردپرسی به‌روزرسانی کنید — بدون اینکه مدیر دسترسی به کل دیتابیس داشته باشد.
          </p>
          <p>
            مدل امنیتی: هر کلید API فقط محصولاتی را می‌بیند که <strong>حداقل یکی از برچسب‌های مجاز
            آن کلید</strong> روی محصول نشسته باشد. پس می‌توانید چند کلید برای چند سایت مختلف بسازید
            و هر سایت فقط محصولات مربوط به برچسب خودش را sync کند.
          </p>
        </CardContent>
      </Card>

      {/* 2 */}
      <Card>
        <CardHeader><CardTitle className="text-base">۲) پیش‌نیاز و ساخت کلید (صفر)</CardTitle></CardHeader>
        <CardContent className="text-sm leading-7 space-y-2">
          <ol className="list-decimal pr-5 space-y-2">
            <li>به <Link to="/products/labels" className="underline">برچسب‌های محصول</Link> بروید و یک برچسب مثل «وب‌سایت اصلی» بسازید.</li>
            <li>در صفحه محصولات، این برچسب را به محصولاتی که می‌خواهید روی WP منتشر شوند بچسبانید.</li>
            <li>به <Link to="/bot-api-keys" className="underline">کلیدهای API</Link> بروید و دکمه «کلید جدید» را بزنید.</li>
            <li><strong>کلید خام</strong> فقط یک‌بار نمایش داده می‌شود؛ فوراً کپی و در محل امن (مثلاً <code dir="ltr">wp-config.php</code>) ذخیره کنید.</li>
            <li>روبه‌روی همان کلید روی دکمه <strong>«دسترسی برچسب محصولات»</strong> بزنید و برچسب‌های مجاز را تیک بزنید.</li>
            <li>اگر می‌خواهید SKU/قیمت را روی WP داشته باشید، مطمئن شوید SKU محصولات افراکالا با SKU محصولات WP یکی است.</li>
          </ol>
        </CardContent>
      </Card>

      {/* 3 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Badge variant="outline">GET</Badge> ۳) لیست محصولات
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <CodeBlock lang="endpoint" code="GET /api/public/bot/products" />
          <div>
            <p className="font-medium mb-1">پارامترهای Query</p>
            <ul className="list-disc pr-5 space-y-1 text-xs text-muted-foreground">
              <li><code dir="ltr">label_id</code> — UUID برچسب (اختیاری)؛ فقط محصولات این برچسب. باید جزو برچسب‌های مجاز کلید باشد.</li>
              <li><code dir="ltr">updated_since</code> — ISO 8601 datetime؛ فقط محصولاتی که بعد از این زمان تغییر کرده‌اند.</li>
              <li><code dir="ltr">page</code> پیش‌فرض ۱، <code dir="ltr">page_size</code> پیش‌فرض ۵۰، حداکثر ۱۰۰.</li>
            </ul>
          </div>
          <CodeBlock lang="curl — همه" code={curlList} />
          <CodeBlock lang="curl — فیلتر برچسب + sync" code={curlByLabel} />
          <div>
            <p className="font-medium mb-1">نمونه پاسخ موفق (200)</p>
            <CodeBlock lang="json" code={sampleList} />
          </div>
        </CardContent>
      </Card>

      {/* 4 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Badge variant="outline">GET</Badge> ۴) جزئیات یک محصول
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <CodeBlock lang="endpoint" code="GET /api/public/bot/products/{product_id}" />
          <CodeBlock lang="curl" code={curlSingle} />
          <div>
            <p className="font-medium mb-1">نمونه پاسخ موفق (200)</p>
            <CodeBlock lang="json" code={sampleSingle} />
          </div>
          <p className="text-xs text-muted-foreground">
            اگر هیچ‌یک از برچسب‌های مجاز کلید روی این محصول نباشد،
            پاسخ <code dir="ltr">403 forbidden_product</code> برمی‌گردد.
          </p>
        </CardContent>
      </Card>

      {/* 5 */}
      <Card>
        <CardHeader><CardTitle className="text-base">۵) ساختار قیمت</CardTitle></CardHeader>
        <CardContent className="text-sm leading-7 space-y-2">
          <p>
            میدان <code dir="ltr">prices[]</code> برای هر محصول شامل همه قیمت‌های فعال
            (به ازای هر «نوع قیمت») است. هر آیتم:
          </p>
          <CodeBlock lang="schema" code={`{
  "sale_price_type_id":    "uuid",
  "sale_price_type_title": "خرده‌فروشی نقدی | عمده نقدی | ...",
  "amount":                18500000,
  "currency":              "IRT",
  "computed_at":           "2026-05-09T08:30:00Z"
}`} />
          <p className="text-xs text-muted-foreground">
            در ربات WP معمولاً یک عنوان مشخص (مثلاً «خرده‌فروشی نقدی») را انتخاب می‌کنید و آن را
            روی <code dir="ltr">_regular_price</code> ووکامرس می‌نویسید (نمونه در بخش ۷).
          </p>
        </CardContent>
      </Card>

      {/* 6 */}
      <Card>
        <CardHeader><CardTitle className="text-base">۶) استراتژی Sync تدریجی</CardTitle></CardHeader>
        <CardContent className="text-sm leading-7 space-y-2">
          <ol className="list-decimal pr-5 space-y-1">
            <li>اولین بار <code dir="ltr">updated_since</code> را خالی بگذارید و از <code dir="ltr">page=1</code> شروع کنید.</li>
            <li>بعد از پایان هر دور، زمان شروع همان دور را در سمت ربات ذخیره کنید (مثلاً <code dir="ltr">last_sync_at</code> در WP options).</li>
            <li>دفعه بعد همان مقدار را به <code dir="ltr">updated_since</code> بدهید تا فقط تغییرات جدید برگردد.</li>
            <li>تا زمانی که <code dir="ltr">page &lt;= total_pages</code> است صفحه‌بندی را ادامه دهید.</li>
          </ol>
        </CardContent>
      </Card>

      {/* 7 */}
      <Card>
        <CardHeader><CardTitle className="text-base">۷) نمونه کد ربات</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Tabs defaultValue="php">
            <TabsList>
              <TabsTrigger value="php">PHP (WordPress)</TabsTrigger>
              <TabsTrigger value="node">Node.js</TabsTrigger>
              <TabsTrigger value="bash">curl</TabsTrigger>
            </TabsList>
            <TabsContent value="php"><CodeBlock lang="php" code={phpCode} /></TabsContent>
            <TabsContent value="node"><CodeBlock lang="javascript" code={nodeCode} /></TabsContent>
            <TabsContent value="bash"><CodeBlock lang="bash" code={curlList + "\n\n" + curlByLabel + "\n\n" + curlSingle} /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* 8 */}
      <Card>
        <CardHeader><CardTitle className="text-base">۸) خطاهای اختصاصی</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ErrorRow status={403} code="forbidden_no_labels"
            desc="هیچ برچسبی برای این کلید فعال نیست. از دکمه «دسترسی برچسب محصولات» حداقل یک برچسب فعال کنید." />
          <ErrorRow status={403} code="forbidden_label"
            desc="label_id ارسال شد، اما این برچسب در فهرست مجاز کلید نیست." />
          <ErrorRow status={403} code="forbidden_product"
            desc="محصول هست، ولی هیچ‌یک از برچسب‌های مجاز کلید روی آن نیست." />
          <ErrorRow status={404} code="product_not_found" desc="محصولی با این شناسه وجود ندارد." />
          <ErrorRow status={400} code="invalid_label_id" desc="مقدار label_id باید UUID معتبر باشد." />
          <ErrorRow status={400} code="invalid_product_id" desc="شناسه محصول در URL باید UUID معتبر باشد." />
          <ErrorRow status={401} code="invalid_key | missing_key | inactive_key | expired_key"
            desc="کلید نامعتبر، غیرفعال، منقضی یا ارسال نشده است." />
          <ErrorRow status={429} code="rate_limit_*"
            desc="عبور از سقف نرخ. هدر Retry-After را رعایت کنید." />
        </CardContent>
      </Card>

      {/* 9 */}
      <Card>
        <CardHeader><CardTitle className="text-base">۹) چک‌لیست راه‌اندازی ربات WP</CardTitle></CardHeader>
        <CardContent className="text-sm leading-7">
          <ol className="list-decimal pr-5 space-y-1">
            <li>برچسب «وب‌سایت اصلی» را بسازید و به محصولات هدف بچسبانید.</li>
            <li>کلید API بسازید و کلید خام را در <code dir="ltr">wp-config.php</code> ذخیره کنید.</li>
            <li>برچسب مجاز را روی کلید فعال کنید.</li>
            <li>اول با curl یک GET بزنید و مطمئن شوید پاسخ ۲۰۰ می‌گیرید.</li>
            <li>کد PHP بخش ۷ را در یک پلاگین کوچک قرار دهید.</li>
            <li>SKU محصولات WP و افراکالا را همسان کنید.</li>
            <li>WP-Cron یا cron سرور را روی فاصله ۱۵ دقیقه تنظیم کنید.</li>
            <li>گزارش مصرف و خطاها را در <Link to="/bot-api-keys/usage" className="underline">گزارش استفاده</Link> پایش کنید.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}