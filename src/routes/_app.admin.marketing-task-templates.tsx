import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Loader2, Pencil, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { tehranToday } from "@/lib/marketing/tehran-date";
import { formatDateFa } from "@/lib/i18n/formatters";

/**
 * Phase 10 / requirement 224 — recurring marketing task templates.
 *
 * Channels come from the existing `marketing_channels` (56 rows) — this page
 * never defines a second channel list. New outlets (Instagram, article sites,
 * anything else) are added on /admin/marketing-channels and appear here
 * immediately.
 *
 * The "run now" button calls the same `generate_marketing_tasks` RPC the cron
 * worker calls. It is safe to press repeatedly: the function is idempotent and
 * takes a per-day advisory lock.
 */

// Postgres DOW convention (0 = Sunday .. 6 = Saturday), presented in Iranian
// week order, which starts on Saturday.
const WEEK_DAYS: { dow: number; label: string }[] = [
  { dow: 6, label: "شنبه" },
  { dow: 0, label: "یکشنبه" },
  { dow: 1, label: "دوشنبه" },
  { dow: 2, label: "سه‌شنبه" },
  { dow: 3, label: "چهارشنبه" },
  { dow: 4, label: "پنجشنبه" },
  { dow: 5, label: "جمعه" },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "مدیر سیستم",
  manager: "مدیر",
  sales: "فروش",
  accountant: "حسابداری",
  viewer: "بازدیدکننده",
};

type Template = {
  id: string;
  channel_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  assigned_role: string | null;
  recurs_on_days: number[];
  priority: string;
  is_active: boolean;
};

type Channel = { id: string; name: string; is_active: boolean };
type Profile = { id: string; full_name: string | null };

type FormState = {
  channel_id: string;
  title: string;
  description: string;
  mode: "person" | "role";
  assigned_to: string;
  assigned_role: string;
  days: number[];
  priority: string;
  is_active: boolean;
};

const EMPTY_FORM: FormState = {
  channel_id: "",
  title: "",
  description: "",
  mode: "person",
  assigned_to: "",
  assigned_role: "sales",
  days: [6, 0, 1, 2, 3],
  priority: "normal",
  is_active: true,
};

function MarketingTaskTemplatesPage() {
  const { roles } = useAuth();
  const allowed =
    roles.includes("admin") || roles.includes("manager") || roles.includes("accountant");
  const canGenerate = roles.includes("admin") || roles.includes("manager");

  const [items, setItems] = useState<Template[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [tpl, ch, pr] = await Promise.all([
      (supabase as any)
        .from("marketing_task_templates")
        .select(
          "id,channel_id,title,description,assigned_to,assigned_role,recurs_on_days,priority,is_active",
        )
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("marketing_channels")
        .select("id,name,is_active")
        .order("sort_order", { ascending: true })
        .limit(500),
      supabase.from("profiles").select("id,full_name").order("full_name").limit(500),
    ]);
    setLoading(false);
    if (tpl.error || ch.error || pr.error) {
      toast.error("خطا در بارگذاری");
      return;
    }
    setItems((tpl.data ?? []) as Template[]);
    setChannels((ch.data ?? []) as Channel[]);
    setProfiles((pr.data ?? []) as Profile[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!allowed) {
    return (
      <div className="p-6 text-sm text-muted-foreground" dir="rtl">
        دسترسی غیرمجاز
      </div>
    );
  }

  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? "—";
  const profileName = (id: string | null) =>
    id ? (profiles.find((p) => p.id === id)?.full_name ?? "—") : "—";

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, channel_id: channels.find((c) => c.is_active)?.id ?? "" });
    setOpen(true);
  };

  const openEdit = (t: Template) => {
    setEditing(t);
    setForm({
      channel_id: t.channel_id,
      title: t.title,
      description: t.description ?? "",
      mode: t.assigned_role ? "role" : "person",
      assigned_to: t.assigned_to ?? "",
      assigned_role: t.assigned_role ?? "sales",
      days: t.recurs_on_days ?? [],
      priority: t.priority,
      is_active: t.is_active,
    });
    setOpen(true);
  };

  const toggleDay = (dow: number) =>
    setForm((f) => ({
      ...f,
      days: f.days.includes(dow) ? f.days.filter((d) => d !== dow) : [...f.days, dow].sort(),
    }));

  const save = async () => {
    if (!form.channel_id) return toast.error("کانال را انتخاب کنید");
    if (form.title.trim().length < 2) return toast.error("عنوان باید حداقل ۲ کاراکتر باشد");
    if (form.days.length === 0) return toast.error("حداقل یک روز هفته را انتخاب کنید");
    if (form.mode === "person" && !form.assigned_to) return toast.error("مسئول را انتخاب کنید");

    setSaving(true);
    const payload = {
      channel_id: form.channel_id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      assigned_to: form.mode === "person" ? form.assigned_to : null,
      assigned_role: form.mode === "role" ? form.assigned_role : null,
      recurs_on_days: form.days,
      priority: form.priority,
      is_active: form.is_active,
    };

    const { error } = editing
      ? await (supabase as any)
          .from("marketing_task_templates")
          .update(payload)
          .eq("id", editing.id)
      : await (supabase as any).from("marketing_task_templates").insert(payload);

    setSaving(false);
    if (error) {
      toast.error(
        error.code === "23505" ? "برای این کانال قالبی با همین عنوان وجود دارد" : error.message,
      );
      return;
    }
    toast.success(editing ? "قالب به‌روزرسانی شد" : "قالب ساخته شد");
    setOpen(false);
    void load();
  };

  const runNow = async () => {
    setGenerating(true);
    const { data, error } = await (supabase as any).rpc("generate_marketing_tasks", {
      p_for_date: null,
    });
    setGenerating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const r = (data ?? {}) as Record<string, unknown>;
    if (r.locked) {
      toast.info(String(r.message ?? "اجرای دیگری در حال انجام است."));
      return;
    }
    toast.success(
      `ساخته‌شده: ${Number(r.generated ?? 0).toLocaleString("fa-IR")} · از قبل موجود: ${Number(
        r.skipped_existing ?? 0,
      ).toLocaleString("fa-IR")} · منقضی‌شده: ${Number(r.expired ?? 0).toLocaleString("fa-IR")}`,
    );
  };

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="قالب وظایف بازاریابی تکرارشونده"
        description="هر قالب، هر روزِ انتخاب‌شده یک وظیفه در «برد وظایف» می‌سازد. کانال‌ها از فهرست موجود کانال‌های بازاریابی می‌آیند."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button onClick={openNew}>
          <Plus className="ml-1 h-4 w-4" /> قالب جدید
        </Button>
        {canGenerate && (
          <Button variant="outline" onClick={() => void runNow()} disabled={generating}>
            {generating ? (
              <Loader2 className="ml-1 h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="ml-1 h-4 w-4" />
            )}
            ساخت وظایف امروز ({formatDateFa(tehranToday())})
          </Button>
        )}
      </div>

      <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        وظایف به‌صورت خودکار در ابتدای هر روز (به وقت تهران) ساخته می‌شوند. این دکمه فقط برای اجرای
        دستی است و اجرای دوباره چیزی را دو بار نمی‌سازد.
      </p>

      <div className="rounded-lg border">
        {loading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            هنوز قالبی ساخته نشده است.
          </div>
        ) : (
          items.map((t) => (
            <div key={t.id} className="border-b p-4 last:border-b-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{t.title}</span>
                    {!t.is_active && <Badge variant="outline">غیرفعال</Badge>}
                    <Badge variant="secondary">{channelName(t.channel_id)}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      مسئول:{" "}
                      {t.assigned_role
                        ? `همهٔ کاربران نقش «${ROLE_LABELS[t.assigned_role] ?? t.assigned_role}»`
                        : profileName(t.assigned_to)}
                    </span>
                    <span>·</span>
                    <span>
                      روزها:{" "}
                      {WEEK_DAYS.filter((d) => (t.recurs_on_days ?? []).includes(d.dow))
                        .map((d) => d.label)
                        .join("، ") || "—"}
                    </span>
                  </div>
                  {t.description && (
                    <p className="whitespace-pre-line text-xs text-muted-foreground">
                      {t.description}
                    </p>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
                  <Pencil className="ml-1 h-3 w-3" /> ویرایش
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "ویرایش قالب" : "قالب جدید"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tpl-channel">کانال بازاریابی</Label>
              <Select
                value={form.channel_id}
                onValueChange={(v) => setForm((f) => ({ ...f, channel_id: v }))}
              >
                <SelectTrigger id="tpl-channel">
                  <SelectValue placeholder="انتخاب کانال" />
                </SelectTrigger>
                <SelectContent>
                  {channels.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {!c.is_active ? " (غیرفعال)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tpl-title">عنوان کار</Label>
              <Input
                id="tpl-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="مثلاً: یک استوری از محصولات امروز"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tpl-desc">توضیح (اختیاری)</Label>
              <Textarea
                id="tpl-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tpl-mode">مسئول</Label>
              <Select
                value={form.mode}
                onValueChange={(v) => setForm((f) => ({ ...f, mode: v as "person" | "role" }))}
              >
                <SelectTrigger id="tpl-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="person">یک نفر مشخص</SelectItem>
                  <SelectItem value="role">همهٔ کاربران یک نقش</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.mode === "person" ? (
              <div className="space-y-2">
                <Label htmlFor="tpl-person">شخص</Label>
                <Select
                  value={form.assigned_to}
                  onValueChange={(v) => setForm((f) => ({ ...f, assigned_to: v }))}
                >
                  <SelectTrigger id="tpl-person">
                    <SelectValue placeholder="انتخاب شخص" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name ?? p.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="tpl-role">نقش</Label>
                <Select
                  value={form.assigned_role}
                  onValueChange={(v) => setForm((f) => ({ ...f, assigned_role: v }))}
                >
                  <SelectTrigger id="tpl-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  برای هر کاربرِ دارای این نقش، هر روز یک وظیفهٔ جداگانه ساخته می‌شود.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>روزهای تکرار</Label>
              <div className="flex flex-wrap gap-2">
                {WEEK_DAYS.map((d) => {
                  const on = form.days.includes(d.dow);
                  return (
                    <Button
                      key={d.dow}
                      type="button"
                      size="sm"
                      variant={on ? "default" : "outline"}
                      onClick={() => toggleDay(d.dow)}
                    >
                      {d.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="tpl-active">فعال</Label>
              <Switch
                id="tpl-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              انصراف
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/_app/admin/marketing-task-templates")({
  component: MarketingTaskTemplatesPage,
});
