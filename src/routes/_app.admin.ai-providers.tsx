import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Plus, RefreshCw, Trash2, Plug, Save } from "lucide-react";
import { toast } from "sonner";

import { requireAdmin } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { HelpHint } from "@/components/common/HelpHint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteAiProvider,
  discoverAiModels,
  listAiProviders,
  testAiProvider,
  updateAiUsageRoute,
  upsertAiProvider,
} from "@/lib/ai/providers.functions";
import {
  AI_CAPABILITIES,
  AI_CAPABILITY_FA,
  type AiCapability,
  type AiProvider,
  type AiProviderHealth,
  type AiUsageRoute,
} from "@/lib/ai/types";
import { AI_USAGE_DEFINITIONS, type AiUsageKey } from "@/lib/ai/usages";
import { formatDateFa } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/admin/ai-providers")({
  // Wave 2 / B-1 — the client half of the guard below. `beforeLoad` runs only on the server
  // for a direct navigation and cannot see a localStorage session, so RouteRoleGate reads this.
  // Mirrors requireAdmin() below.
  staticData: { gate: { kind: "admin" } },
  beforeLoad: async () => {
    await requireAdmin();
  },
  component: AiProvidersPage,
});

const STATUS_FA: Record<string, string> = {
  ok: "سالم",
  error: "خطا",
  rate_limited: "محدودشده (شلوغ)",
  credit_exhausted: "اعتبار تمام شده",
  unavailable: "در دسترس نیست",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ok: "default",
  error: "destructive",
  rate_limited: "secondary",
  credit_exhausted: "destructive",
  unavailable: "outline",
};

type HealthRow = AiProviderHealth;
type UsageRow = AiUsageRoute;

const FIELD_HELP = {
  name: [
    "شناسه نام فنی provider است و بهتر است انگلیسی، کوتاه و بدون فاصله باشد.",
    "مثال: openai-main، gemini-cloud، ollama-local.",
    "این مقدار برای تشخیص داخلی استفاده می‌شود؛ بعد از استفاده در تنظیمات بهتر است تغییر نکند.",
  ].join("\n"),
  label: [
    "نامی است که کاربران داخل صفحه می‌بینند.",
    "اینجا اسم واضح و انسانی بنویسید؛ مثلا GPT شرکت، Gemini، یا Ollama داخلی.",
    "اگر خالی بماند، سیستم از همان شناسه استفاده می‌کند.",
  ].join("\n"),
  kind: [
    "نوع مشخص می‌کند سیستم با چه پروتکلی به سرویس وصل شود.",
    "OpenAI سازگار: برای OpenAI، Gemini از مسیر سازگار، OpenRouter، یا هر سرویس دارای /chat/completions.",
    "Ollama: برای مدل‌های محلی روی سرور، مثل qwen یا llama.",
  ].join("\n"),
  baseUrl: [
    "آدرس پایه همان endpoint اصلی سرویس است.",
    "برای OpenAI-compatible معمولا شبیه https://api.openai.com/v1 یا https://ai.gateway.lovable.dev/v1 است.",
    "برای Ollama معمولا شبیه http://192.168.170.8:11434 است. آخر آدرس مسیر مدل را ننویسید.",
  ].join("\n"),
  priority: [
    "عدد کمتر یعنی این provider زودتر امتحان می‌شود.",
    "مثلا 10 قبل از 100 استفاده می‌شود.",
    "اگر برای یک بخش provider خاص انتخاب نشده باشد، سیستم از providerهای فعال با همین اولویت استفاده می‌کند.",
  ].join("\n"),
  active: [
    "اگر فعال باشد، سیستم اجازه دارد از این provider استفاده کند.",
    "اگر خاموش شود، حتی اگر در مسیرهای مصرف AI انتخاب شده باشد استفاده نمی‌شود.",
    "برای تست یا توقف موقت یک سرویس، این گزینه را خاموش کنید.",
  ].join("\n"),
  chatModel: [
    "مدلی که برای پاسخ متنی و گفت‌وگو استفاده می‌شود.",
    "برای دستیار خرید، دانش‌نامه، پیام‌رسان AI و متن تبلیغاتی کاربرد دارد.",
    "مثال OpenAI/Gateway: gpt-4o-mini. مثال Ollama: qwen2.5:7b.",
  ].join("\n"),
  embedModel: [
    "مدلی که متن را به بردار معنایی تبدیل می‌کند.",
    "برای جستجوی معنایی پیام‌ها و دانش‌نامه استفاده می‌شود.",
    "اگر provider قرار نیست embedding بدهد، این فیلد را خالی بگذارید و قابلیت بردار معنایی را تیک نزنید.",
  ].join("\n"),
  visionModel: [
    "مدلی که تصویر را می‌خواند.",
    "برای OCR فیش واریزی یا هر قابلیت تصویری استفاده می‌شود.",
    "اگر سرویس تصویر نمی‌خواند، این فیلد را خالی بگذارید و قابلیت خواندن تصویر را تیک نزنید.",
  ].join("\n"),
  apiKey: [
    "کلید محرمانه سرویس را اینجا وارد کنید.",
    "برای Ollama داخلی معمولا کلید لازم نیست و می‌تواند خالی بماند.",
    "برای سرویس‌های ابری معمولا کلید اجباری است. هنگام ویرایش، اگر فیلد را دست نزنید کلید قبلی حفظ می‌شود.",
  ].join("\n"),
  capabilities: [
    "اینجا مشخص می‌کنید به کدام توانایی‌های این provider اعتماد دارید.",
    "گفت‌وگو یعنی پاسخ متنی؛ بردار معنایی یعنی embedding؛ خواندن تصویر یعنی vision/OCR.",
    "فقط قابلیت‌هایی را تیک بزنید که مدل مربوط به آن را واقعا وارد کرده‌اید و تستش موفق است.",
  ].join("\n"),
  notes: [
    "برای توضیح داخلی مدیران است و روی عملکرد سیستم اثر مستقیم ندارد.",
    "مثلا بنویسید این provider برای تست است، هزینه‌اش بالاست، یا فقط برای دانش‌نامه استفاده شود.",
  ].join("\n"),
} as const;

type Draft = {
  id: string | null;
  name: string;
  label: string;
  kind: "ollama" | "openai_compatible";
  base_url: string;
  is_active: boolean;
  priority: number;
  chat_model: string;
  embed_model: string;
  vision_model: string;
  capabilities: AiCapability[];
  api_key: string;
  /** Distinguishes "left the key field alone" from "cleared it deliberately". */
  api_key_touched: boolean;
  notes: string;
};

function emptyDraft(): Draft {
  return {
    id: null,
    name: "",
    label: "",
    kind: "openai_compatible",
    base_url: "",
    is_active: true,
    priority: 100,
    chat_model: "",
    embed_model: "",
    vision_model: "",
    capabilities: ["chat"],
    api_key: "",
    api_key_touched: false,
    notes: "",
  };
}

function draftFrom(p: AiProvider): Draft {
  return {
    id: p.id,
    name: p.name,
    label: p.label,
    kind: p.kind,
    base_url: p.base_url,
    is_active: p.is_active,
    priority: p.priority,
    chat_model: p.chat_model ?? "",
    embed_model: p.embed_model ?? "",
    vision_model: p.vision_model ?? "",
    capabilities: p.capabilities,
    api_key: "",
    api_key_touched: false,
    notes: p.notes ?? "",
  };
}

function FieldLabel({
  htmlFor,
  children,
  help,
}: {
  htmlFor?: string;
  children: string;
  help: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>{children}</Label>
      <HelpHint text={help} ariaLabel={`راهنمای ${children}`} />
    </div>
  );
}

function AiProvidersPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["ai-providers"],
    queryFn: () => listAiProviders(),
  });

  const providers = (q.data?.providers ?? []) as AiProvider[];
  const usageRoutes = (q.data?.usageRoutes ?? []) as UsageRow[];

  const healthByProvider = useMemo(() => {
    const health = (q.data?.health ?? []) as HealthRow[];
    const m = new Map<string, HealthRow[]>();
    for (const h of health) {
      const list = m.get(h.provider_id) ?? [];
      list.push(h);
      m.set(h.provider_id, list);
    }
    return m;
  }, [q.data?.health]);

  const saveM = useMutation({
    mutationFn: async (d: Draft) => {
      if (d.capabilities.length === 0) {
        throw new Error("حداقل یک قابلیت را انتخاب کنید.");
      }
      return upsertAiProvider({
        data: {
          id: d.id,
          name: d.name.trim(),
          label: d.label.trim() || d.name.trim(),
          kind: d.kind,
          base_url: d.base_url.trim(),
          is_active: d.is_active,
          priority: d.priority,
          chat_model: d.chat_model.trim() || null,
          embed_model: d.embed_model.trim() || null,
          vision_model: d.vision_model.trim() || null,
          capabilities: d.capabilities,
          // Untouched key field => null => the stored key is left alone.
          api_key: d.api_key_touched ? d.api_key : null,
          notes: d.notes.trim() || null,
        },
      });
    },
    onSuccess: async () => {
      toast.success("ارائه‌دهنده ذخیره شد.");
      setDraft(null);
      await qc.invalidateQueries({ queryKey: ["ai-providers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "خطا در ذخیره."),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteAiProvider({ data: { id } }),
    onSuccess: async () => {
      toast.success("ارائه‌دهنده حذف شد.");
      await qc.invalidateQueries({ queryKey: ["ai-providers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "خطا در حذف."),
  });

  const discoverM = useMutation({
    mutationFn: (id: string) => discoverAiModels({ data: { id } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.messageFa);
        return;
      }
      if (r.models.length === 0) {
        toast.info("مدلی گزارش نشد.");
        return;
      }
      const known = r.models.filter((m) => m.capabilitiesKnown);
      toast.success(
        known.length > 0
          ? `${r.models.length} مدل یافت شد؛ قابلیت ${known.length} مدل توسط سرویس گزارش شد.`
          : `${r.models.length} مدل یافت شد. این سرویس قابلیت مدل‌ها را گزارش نمی‌کند؛ انتخاب با شماست.`,
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "خطا در دریافت مدل‌ها."),
  });

  const usageM = useMutation({
    mutationFn: (row: UsageDraft) => updateAiUsageRoute({ data: row }),
    onSuccess: async () => {
      toast.success("مسیر مصرف هوش مصنوعی ذخیره شد.");
      await qc.invalidateQueries({ queryKey: ["ai-providers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "خطا در ذخیره مسیر مصرف."),
  });

  async function runTest(id: string, capability: AiCapability) {
    setTesting(`${id}:${capability}`);
    try {
      const r = await testAiProvider({ data: { id, capability } });
      if (r.ok) {
        toast.success(
          `${AI_CAPABILITY_FA[capability]}: ${r.messageFa} (${r.ms ?? "?"} میلی‌ثانیه)`,
        );
      } else {
        toast.error(`${AI_CAPABILITY_FA[capability]}: ${r.messageFa}`);
      }
      await qc.invalidateQueries({ queryKey: ["ai-providers"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در آزمایش اتصال.");
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="ارائه‌دهندگان هوش مصنوعی"
        description="مدیریت سرویس‌های هوش مصنوعی، کلیدها، قابلیت‌ها و وضعیت سلامت"
        actions={
          <Button onClick={() => setDraft(emptyDraft())}>
            <Plus className="ml-2 h-4 w-4" />
            افزودن ارائه‌دهنده
          </Button>
        }
      />

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>درباره نگهداری کلیدها</AlertTitle>
        <AlertDescription className="text-sm leading-7">
          کلید هر سرویس رمزنگاری‌شده در Vault دیتابیس ذخیره می‌شود و هرگز در این صفحه، در گزارش
          تغییرات یا در پیام‌های خطا نمایش داده نمی‌شود؛ فقط چند حرف ابتدایی آن دیده می‌شود. کلید
          رمزگشایی خارج از دیتابیس نگهداری می‌شود، بنابراین یک نسخهٔ پشتیبان از دیتابیس به‌تنهایی
          کلیدها را فاش نمی‌کند — اما به همان دلیل، بازگردانی دیتابیس روی سروری دیگر کلیدها را
          غیرقابل‌بازیابی می‌کند و باید دوباره وارد شوند.
        </AlertDescription>
      </Alert>

      <AiUsageRoutingSection
        providers={providers}
        usageRoutes={usageRoutes}
        savingKey={usageM.variables?.service_key ?? null}
        saving={usageM.isPending}
        onSave={(row) => usageM.mutate(row)}
      />

      {q.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : q.isError ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          خطا در بارگذاری ارائه‌دهندگان.
        </div>
      ) : providers.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          هنوز هیچ ارائه‌دهنده‌ای ثبت نشده است.
        </div>
      ) : (
        <div className="space-y-4">
          {providers.map((p) => {
            const rows = healthByProvider.get(p.id) ?? [];
            return (
              <Card key={p.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <Plug className="h-4 w-4 text-primary" />
                    <span>{p.label}</span>
                    <span className="text-xs text-muted-foreground" dir="ltr">
                      {p.name}
                    </span>
                    {p.is_active ? (
                      <Badge variant="default" className="text-xs font-normal">
                        فعال
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs font-normal">
                        غیرفعال
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs font-normal">
                      اولویت {p.priority}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2 text-sm md:grid-cols-2">
                    <div dir="ltr" className="text-muted-foreground">
                      {p.base_url}
                    </div>
                    <div>
                      کلید:{" "}
                      {p.has_key ? (
                        <span dir="ltr" className="font-mono">
                          {p.key_prefix}…
                        </span>
                      ) : (
                        <span className="text-muted-foreground">ثبت نشده</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {AI_CAPABILITIES.map((c) => {
                      const enabled = p.capabilities.includes(c);
                      const h = rows.find((r) => r.capability === c);
                      return (
                        <div
                          key={c}
                          className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs"
                        >
                          <span className={enabled ? "" : "text-muted-foreground line-through"}>
                            {AI_CAPABILITY_FA[c]}
                          </span>
                          {h && (
                            <Badge
                              variant={STATUS_VARIANT[h.last_status] ?? "outline"}
                              className="text-[10px] font-normal"
                            >
                              {STATUS_FA[h.last_status] ?? h.last_status}
                            </Badge>
                          )}
                          {enabled && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[11px]"
                              disabled={testing === `${p.id}:${c}`}
                              onClick={() => runTest(p.id, c)}
                            >
                              {testing === `${p.id}:${c}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "آزمایش"
                              )}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {rows.length > 0 && (
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {rows.map((h) => (
                        <div key={h.capability}>
                          {AI_CAPABILITY_FA[h.capability]} — آخرین موفقیت:{" "}
                          {h.last_ok_at ? formatDateFa(h.last_ok_at) : "—"}
                          {h.last_error_at && (
                            <>
                              {" "}
                              | آخرین خطا: {formatDateFa(h.last_error_at)}
                              {h.last_error_code ? ` (${h.last_error_code})` : ""}
                            </>
                          )}
                          {h.last_latency_ms != null && <> | {h.last_latency_ms} میلی‌ثانیه</>}
                        </div>
                      ))}
                    </div>
                  )}

                  {p.notes && <p className="text-xs leading-6 text-muted-foreground">{p.notes}</p>}

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setDraft(draftFrom(p))}>
                      ویرایش
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={discoverM.isPending}
                      onClick={() => discoverM.mutate(p.id)}
                    >
                      {discoverM.isPending ? (
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="ml-2 h-4 w-4" />
                      )}
                      مدل‌های موجود
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deleteM.isPending}
                      onClick={() => deleteM.mutate(p.id)}
                    >
                      <Trash2 className="ml-2 h-4 w-4" />
                      حذف
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {draft && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {draft.id ? "ویرایش ارائه‌دهنده" : "ارائه‌دهنده جدید"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <FieldLabel htmlFor="ap-name" help={FIELD_HELP.name}>
                  شناسه (انگلیسی، بدون فاصله)
                </FieldLabel>
                <Input
                  id="ap-name"
                  dir="ltr"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="lovable"
                />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="ap-label" help={FIELD_HELP.label}>
                  نام نمایشی
                </FieldLabel>
                <Input
                  id="ap-label"
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  placeholder="سرویس ابری"
                />
              </div>
              <div className="space-y-1">
                <FieldLabel help={FIELD_HELP.kind}>نوع</FieldLabel>
                <Select
                  value={draft.kind}
                  onValueChange={(v) => setDraft({ ...draft, kind: v as Draft["kind"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ollama">اولاما (محلی)</SelectItem>
                    <SelectItem value="openai_compatible">سازگار با OpenAI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="ap-url" help={FIELD_HELP.baseUrl}>
                  آدرس پایه
                </FieldLabel>
                <Input
                  id="ap-url"
                  dir="ltr"
                  value={draft.base_url}
                  onChange={(e) => setDraft({ ...draft, base_url: e.target.value })}
                  placeholder="https://ai.gateway.lovable.dev/v1"
                />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="ap-priority" help={FIELD_HELP.priority}>
                  اولویت (کمتر = زودتر امتحان می‌شود)
                </FieldLabel>
                <Input
                  id="ap-priority"
                  type="number"
                  dir="ltr"
                  value={draft.priority}
                  onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch
                  id="ap-active"
                  checked={draft.is_active}
                  onCheckedChange={(v) => setDraft({ ...draft, is_active: v })}
                />
                <FieldLabel htmlFor="ap-active" help={FIELD_HELP.active}>
                  فعال
                </FieldLabel>
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="ap-chat" help={FIELD_HELP.chatModel}>
                  مدل گفت‌وگو
                </FieldLabel>
                <Input
                  id="ap-chat"
                  dir="ltr"
                  value={draft.chat_model}
                  onChange={(e) => setDraft({ ...draft, chat_model: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="ap-embed" help={FIELD_HELP.embedModel}>
                  مدل بردار معنایی
                </FieldLabel>
                <Input
                  id="ap-embed"
                  dir="ltr"
                  value={draft.embed_model}
                  onChange={(e) => setDraft({ ...draft, embed_model: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="ap-vision" help={FIELD_HELP.visionModel}>
                  مدل خواندن تصویر
                </FieldLabel>
                <Input
                  id="ap-vision"
                  dir="ltr"
                  value={draft.vision_model}
                  onChange={(e) => setDraft({ ...draft, vision_model: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="ap-key" help={FIELD_HELP.apiKey}>
                  کلید سرویس
                </FieldLabel>
                <Input
                  id="ap-key"
                  dir="ltr"
                  type="password"
                  autoComplete="new-password"
                  value={draft.api_key}
                  onChange={(e) =>
                    setDraft({ ...draft, api_key: e.target.value, api_key_touched: true })
                  }
                  placeholder={draft.id ? "برای حفظ کلید فعلی خالی بگذارید" : ""}
                />
                {draft.id && (
                  <p className="text-xs text-muted-foreground">
                    اگر این فیلد را دست نزنید کلید فعلی حفظ می‌شود. برای حذف کلید، داخل آن کلیک کنید
                    و خالی ذخیره کنید.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <FieldLabel help={FIELD_HELP.capabilities}>قابلیت‌ها</FieldLabel>
              <div className="flex flex-wrap gap-4">
                {AI_CAPABILITIES.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={draft.capabilities.includes(c)}
                      onCheckedChange={(v) =>
                        setDraft({
                          ...draft,
                          capabilities: v
                            ? [...draft.capabilities, c]
                            : draft.capabilities.filter((x) => x !== c),
                        })
                      }
                    />
                    {AI_CAPABILITY_FA[c]}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                فقط قابلیت‌هایی را تیک بزنید که به این سرویس اعتماد دارید. وجود داشتن یک مدل به
                معنای مناسب بودن آن نیست.
              </p>
            </div>

            <div className="space-y-1">
              <FieldLabel htmlFor="ap-notes" help={FIELD_HELP.notes}>
                یادداشت
              </FieldLabel>
              <Textarea
                id="ap-notes"
                rows={2}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDraft(null)}>
                انصراف
              </Button>
              <Button disabled={saveM.isPending} onClick={() => saveM.mutate(draft)}>
                {saveM.isPending ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="ml-2 h-4 w-4" />
                )}
                ذخیره
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type UsageDraft = {
  service_key: AiUsageKey;
  provider_id: string | null;
  is_enabled: boolean;
  fallback_enabled: boolean;
};

function AiUsageRoutingSection({
  providers,
  usageRoutes,
  savingKey,
  saving,
  onSave,
}: {
  providers: AiProvider[];
  usageRoutes: UsageRow[];
  savingKey: AiUsageKey | null;
  saving: boolean;
  onSave: (row: UsageDraft) => void;
}) {
  const [drafts, setDrafts] = useState<Record<AiUsageKey, UsageDraft>>(
    () =>
      Object.fromEntries(
        AI_USAGE_DEFINITIONS.map((u) => [
          u.key,
          {
            service_key: u.key,
            provider_id: null,
            is_enabled: true,
            fallback_enabled: true,
          },
        ]),
      ) as Record<AiUsageKey, UsageDraft>,
  );

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        AI_USAGE_DEFINITIONS.map((u) => {
          const row = usageRoutes.find((r) => r.service_key === u.key);
          return [
            u.key,
            {
              service_key: u.key,
              provider_id: row?.provider_id ?? null,
              is_enabled: row?.is_enabled ?? true,
              fallback_enabled: row?.fallback_enabled ?? true,
            },
          ];
        }),
      ) as Record<AiUsageKey, UsageDraft>,
    );
  }, [usageRoutes]);

  const updateDraft = (key: AiUsageKey, patch: Partial<UsageDraft>) => {
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const providerLabel = (id: string | null) => {
    if (!id) return "خودکار بر اساس اولویت";
    return providers.find((p) => p.id === id)?.label ?? "ارائه‌دهنده نامعتبر";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">مسیرهای مصرف هوش مصنوعی در سیستم</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTitle>این بخش مشخص می‌کند هر قسمت سیستم از کدام AI جواب بگیرد.</AlertTitle>
          <AlertDescription className="text-sm leading-7">
            اگر گزینه روی حالت خودکار باشد، سیستم مثل قبل provider فعال با اولویت بهتر را انتخاب
            می‌کند. اگر یک provider مشخص انتخاب شود، همان بخش اول سراغ همان سرویس می‌رود. با خاموش
            کردن fallback، همان بخش فقط از provider انتخاب‌شده استفاده می‌کند.
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          {AI_USAGE_DEFINITIONS.map((usage) => {
            const draft = drafts[usage.key];
            const capableProviders = providers.filter(
              (p) => p.is_active && p.capabilities.includes(usage.capability),
            );
            const isSaving = saving && savingKey === usage.key;
            return (
              <div key={usage.key} className="rounded-lg border p-3">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.9fr)_auto]">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{usage.label}</h3>
                      <Badge variant="outline" className="text-[11px]">
                        {AI_CAPABILITY_FA[usage.capability]}
                      </Badge>
                      {!draft?.is_enabled && (
                        <Badge variant="secondary" className="text-[11px]">
                          غیرفعال
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs leading-6 text-muted-foreground">{usage.description}</p>
                    <p className="text-[11px] text-muted-foreground" dir="ltr">
                      {usage.key}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">ارائه‌دهنده این بخش</Label>
                    <Select
                      value={draft?.provider_id ?? "__auto__"}
                      disabled={!draft?.is_enabled}
                      onValueChange={(v) =>
                        updateDraft(usage.key, {
                          provider_id: v === "__auto__" ? null : v,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="انتخاب ارائه‌دهنده">
                          {providerLabel(draft?.provider_id ?? null)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__auto__">خودکار بر اساس اولویت</SelectItem>
                        {capableProviders.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.label} — اولویت {p.priority}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {capableProviders.length === 0 && (
                      <p className="text-xs text-destructive">
                        هیچ provider فعالی برای این قابلیت وجود ندارد.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 lg:min-w-48">
                    <label className="flex items-center justify-between gap-3 text-sm">
                      <span>فعال</span>
                      <Switch
                        checked={draft?.is_enabled ?? true}
                        onCheckedChange={(v) => updateDraft(usage.key, { is_enabled: v })}
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3 text-sm">
                      <span>fallback در صورت خطا</span>
                      <Switch
                        checked={draft?.fallback_enabled ?? true}
                        disabled={!draft?.is_enabled || !draft?.provider_id}
                        onCheckedChange={(v) => updateDraft(usage.key, { fallback_enabled: v })}
                      />
                    </label>
                    <Button
                      size="sm"
                      disabled={isSaving || !draft}
                      onClick={() => draft && onSave(draft)}
                    >
                      {isSaving ? (
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="ml-2 h-4 w-4" />
                      )}
                      ذخیره این بخش
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
