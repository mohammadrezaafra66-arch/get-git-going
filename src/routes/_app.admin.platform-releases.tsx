import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { requireAdmin } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  archiveRelease,
  createDraftRelease,
  deleteDraftRelease,
  fetchDeployMeta,
  listAdminReleases,
  publishRelease,
  updateDraftRelease,
} from "@/lib/platform-releases/api";
import {
  RELEASE_CATEGORIES,
  RELEASE_STATUS_LABELS,
  type ReleaseCategory,
} from "@/lib/platform-releases/constants";
import { formatReleaseNumber, formatReleasePublishedAt } from "@/lib/platform-releases/format";
import type { PlatformRelease, PlatformReleaseItem } from "@/lib/platform-releases/types";
import { getPageTitle } from "@/config/branding";

export const Route = createFileRoute("/_app/admin/platform-releases")({
  // Wave 2 / B-1 — the client half of the guard below. `beforeLoad` runs only on the server
  // for a direct navigation and cannot see a localStorage session, so RouteRoleGate reads this.
  // Mirrors requireAdmin() below.
  staticData: { gate: { kind: "admin" } },
  beforeLoad: async () => {
    await requireAdmin();
  },
  head: () => ({ meta: [{ title: getPageTitle("مدیریت به‌روزرسانی‌ها") }] }),
  component: AdminPlatformReleasesPage,
});

type FormState = {
  title_fa: string;
  summary_fa: string;
  details_fa: string;
  category: ReleaseCategory;
  version: string;
  git_sha: string;
  build_time: string;
  items: PlatformReleaseItem[];
};

const emptyForm = (): FormState => ({
  title_fa: "",
  summary_fa: "",
  details_fa: "",
  category: "قابلیت جدید",
  version: "",
  git_sha: "",
  build_time: "",
  items: [{ item_number: 1, title_fa: "", description_fa: "" }],
});

function fromRelease(r: PlatformRelease): FormState {
  return {
    title_fa: r.title_fa,
    summary_fa: r.summary_fa,
    details_fa: r.details_fa ?? "",
    category: r.category,
    version: r.version ?? "",
    git_sha: r.git_sha ?? "",
    build_time: r.build_time ?? "",
    items: r.items.length > 0 ? r.items : [{ item_number: 1, title_fa: "", description_fa: "" }],
  };
}

function AdminPlatformReleasesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [confirm, setConfirm] = useState<null | {
    kind: "publish" | "archive" | "delete";
    id: string;
    title: string;
  }>(null);

  const listQuery = useQuery({
    queryKey: ["platform-releases", "admin"],
    queryFn: listAdminReleases,
  });

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["platform-releases"] });
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("نشست کاربر معتبر نیست");
      const payload = {
        title_fa: form.title_fa,
        summary_fa: form.summary_fa,
        details_fa: form.details_fa || null,
        category: form.category,
        version: form.version || null,
        git_sha: form.git_sha || null,
        build_time: form.build_time || null,
        items: form.items,
      };
      if (editingId) return updateDraftRelease(editingId, payload, user.id);
      return createDraftRelease(payload, user.id);
    },
    onSuccess: async (row) => {
      toast.success(editingId ? "پیش‌نویس ذخیره شد" : "پیش‌نویس ایجاد شد");
      setEditingId(row.id);
      setForm(fromRelease(row));
      await invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const actionMut = useMutation({
    mutationFn: async () => {
      if (!confirm) return;
      if (confirm.kind === "publish") return publishRelease(confirm.id);
      if (confirm.kind === "archive") return archiveRelease(confirm.id);
      await deleteDraftRelease(confirm.id);
      return null;
    },
    onSuccess: async () => {
      if (!confirm) return;
      if (confirm.kind === "publish") toast.success("نسخه منتشر شد");
      else if (confirm.kind === "archive") toast.success("نسخه بایگانی شد");
      else {
        toast.success("پیش‌نویس حذف شد");
        if (editingId === confirm.id) {
          setEditingId(null);
          setForm(emptyForm());
        }
      }
      setConfirm(null);
      await invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const drafts = useMemo(
    () => (listQuery.data ?? []).filter((r) => r.status === "draft"),
    [listQuery.data],
  );
  const others = useMemo(
    () => (listQuery.data ?? []).filter((r) => r.status !== "draft"),
    [listQuery.data],
  );

  const fillMeta = async () => {
    const meta = await fetchDeployMeta();
    setForm((f) => ({
      ...f,
      git_sha: meta.git_sha ?? f.git_sha,
      build_time: meta.build_time ?? f.build_time,
      version: meta.version ?? f.version,
    }));
    toast.message("اطلاعات استقرار فعلی پر شد — هنوز منتشر نشده است");
  };

  return (
    <div className="space-y-5" data-testid="admin-platform-releases">
      <PageHeader
        title="مدیریت به‌روزرسانی‌ها"
        description="پیش‌نویس بنویسید، پیش‌نمایش کنید، سپس با تأیید منتشر کنید"
        actions={
          <Button asChild size="sm" variant="outline">
            <Link to="/updates">مشاهده صفحهٔ کاربران</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            {editingId ? "ویرایش پیش‌نویس" : "پیش‌نویس جدید"}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => void fillMeta()}>
              پر کردن از استقرار فعلی
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm());
              }}
            >
              پاک کردن فرم
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="rel-title">عنوان</Label>
              <Input
                id="rel-title"
                value={form.title_fa}
                onChange={(e) => setForm((f) => ({ ...f, title_fa: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="rel-summary">خلاصه</Label>
              <Textarea
                id="rel-summary"
                rows={3}
                value={form.summary_fa}
                onChange={(e) => setForm((f) => ({ ...f, summary_fa: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>دسته‌بندی</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v as ReleaseCategory }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELEASE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rel-sha">Git SHA (اختیاری)</Label>
              <Input
                id="rel-sha"
                className="font-mono"
                value={form.git_sha}
                onChange={(e) => setForm((f) => ({ ...f, git_sha: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rel-ver">نسخه (اختیاری)</Label>
              <Input
                id="rel-ver"
                value={form.version}
                onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rel-build">زمان ساخت (ISO، اختیاری)</Label>
              <Input
                id="rel-build"
                className="font-mono text-xs"
                value={form.build_time}
                onChange={(e) => setForm((f) => ({ ...f, build_time: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="rel-details">توضیحات بیشتر (اختیاری)</Label>
              <Textarea
                id="rel-details"
                rows={3}
                value={form.details_fa}
                onChange={(e) => setForm((f) => ({ ...f, details_fa: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>موارد تغییر</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    items: [
                      ...f.items,
                      {
                        item_number: f.items.length + 1,
                        title_fa: "",
                        description_fa: "",
                      },
                    ],
                  }))
                }
              >
                <Plus className="ms-1 h-4 w-4" />
                مورد
              </Button>
            </div>
            {form.items.map((item, idx) => (
              <div
                key={idx}
                className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_1fr_auto]"
              >
                <Input
                  placeholder="عنوان مورد"
                  value={item.title_fa}
                  onChange={(e) =>
                    setForm((f) => {
                      const items = [...f.items];
                      items[idx] = { ...items[idx], title_fa: e.target.value };
                      return { ...f, items };
                    })
                  }
                />
                <Input
                  placeholder="توضیح کوتاه"
                  value={item.description_fa}
                  onChange={(e) =>
                    setForm((f) => {
                      const items = [...f.items];
                      items[idx] = { ...items[idx], description_fa: e.target.value };
                      return { ...f, items };
                    })
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={form.items.length <= 1}
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      items: f.items
                        .filter((_, i) => i !== idx)
                        .map((it, i) => ({ ...it, item_number: i + 1 })),
                    }))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Input
                  className="md:col-span-2"
                  placeholder="مسیر مرتبط اختیاری مثل /products"
                  value={item.route_path ?? ""}
                  onChange={(e) =>
                    setForm((f) => {
                      const items = [...f.items];
                      items[idx] = { ...items[idx], route_path: e.target.value };
                      return { ...f, items };
                    })
                  }
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? <Loader2 className="ms-1 h-4 w-4 animate-spin" /> : null}
              ذخیرهٔ پیش‌نویس
            </Button>
            {editingId ? (
              <Button
                type="button"
                variant="default"
                onClick={() =>
                  setConfirm({
                    kind: "publish",
                    id: editingId,
                    title: form.title_fa || "این نسخه",
                  })
                }
              >
                انتشار
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">پیش‌نویس‌ها</h2>
        {drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">پیش‌نویسی نیست.</p>
        ) : (
          drafts.map((r) => (
            <ReleaseAdminRow
              key={r.id}
              release={r}
              onEdit={() => {
                setEditingId(r.id);
                setForm(fromRelease(r));
              }}
              onPublish={() => setConfirm({ kind: "publish", id: r.id, title: r.title_fa })}
              onDelete={() => setConfirm({ kind: "delete", id: r.id, title: r.title_fa })}
            />
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">منتشرشده / بایگانی</h2>
        {others.map((r) => (
          <ReleaseAdminRow
            key={r.id}
            release={r}
            onArchive={
              r.status === "published"
                ? () => setConfirm({ kind: "archive", id: r.id, title: r.title_fa })
                : undefined
            }
          />
        ))}
      </section>

      <AlertDialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "publish"
                ? "انتشار نسخه؟"
                : confirm?.kind === "archive"
                  ? "بایگانی نسخه؟"
                  : "حذف پیش‌نویس؟"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              «{confirm?.title}» — این عمل برای کاربران قابل‌مشاهده اثر دارد یا برگشت‌پذیر نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                actionMut.mutate();
              }}
            >
              تأیید
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ReleaseAdminRow({
  release,
  onEdit,
  onPublish,
  onArchive,
  onDelete,
}: {
  release: PlatformRelease;
  onEdit?: () => void;
  onPublish?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{RELEASE_STATUS_LABELS[release.status]}</Badge>
          {release.release_number != null ? (
            <span className="text-xs text-primary">
              {formatReleaseNumber(release.release_number)}
            </span>
          ) : null}
          <Badge variant="secondary">{release.category}</Badge>
        </div>
        <div className="truncate font-medium">{release.title_fa}</div>
        <div className="text-xs text-muted-foreground">
          {release.published_at
            ? formatReleasePublishedAt(release.published_at)
            : `به‌روزرسانی فرم: ${formatReleasePublishedAt(release.updated_at)}`}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {onEdit ? (
          <Button type="button" size="sm" variant="outline" onClick={onEdit}>
            ویرایش
          </Button>
        ) : null}
        {onPublish ? (
          <Button type="button" size="sm" onClick={onPublish}>
            انتشار
          </Button>
        ) : null}
        {onArchive ? (
          <Button type="button" size="sm" variant="secondary" onClick={onArchive}>
            بایگانی
          </Button>
        ) : null}
        {onDelete ? (
          <Button type="button" size="sm" variant="destructive" onClick={onDelete}>
            حذف
          </Button>
        ) : null}
      </div>
    </div>
  );
}
