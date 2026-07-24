import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Plus, Pencil, Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDateFa } from "@/lib/i18n/formatters";
import { reindexKnowledgeDocuments } from "@/lib/knowledge/rag.functions";
import {
  KNOWLEDGE_CATEGORY_LABELS,
  KNOWLEDGE_ACCESS_LABELS,
  type KnowledgeCategory,
  type KnowledgeAccessLevel,
} from "@/lib/knowledge/constants";
import {
  KnowledgeDocumentForm,
  type KnowledgeFormValues,
} from "@/shared/components/KnowledgeDocumentForm";

export const Route = createFileRoute("/_app/knowledge_/manage")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: KnowledgeManagePage,
});

interface DocRow {
  id: string;
  title: string;
  content: string;
  category: KnowledgeCategory;
  access_level: KnowledgeAccessLevel;
  version: number;
  is_published: boolean;
  updated_at: string;
}

function KnowledgeManagePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<DocRow | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["knowledge-documents-manage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_documents")
        .select("id, title, content, category, access_level, version, is_published, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DocRow[];
    },
  });

  const reindexM = useMutation({
    mutationFn: () => reindexKnowledgeDocuments({ data: {} }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.messageFa ?? "نمایه‌سازی انجام نشد.");
        return;
      }
      if (r.documentsSeen === 0) {
        // Say plainly that there was nothing to index rather than reporting a
        // successful run that did nothing.
        toast.info("سند منتشرشده‌ای برای نمایه‌سازی وجود ندارد.");
        return;
      }
      const parts = [`${r.documentsIndexed} سند نمایه شد`, `${r.chunksWritten} بخش`];
      if (r.documentsSkippedCorrupted > 0) {
        parts.push(`${r.documentsSkippedCorrupted} سند به دلیل خرابی متن رد شد`);
      }
      if (r.documentsSkippedEmpty > 0) {
        parts.push(`${r.documentsSkippedEmpty} سند خالی بود`);
      }
      if (r.model) parts.push(`مدل ${r.model} (${r.dimension} بعد)`);
      toast.success(parts.join(" — "));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "خطا در نمایه‌سازی"),
  });

  const createMutation = useMutation({
    mutationFn: async (values: KnowledgeFormValues) => {
      if (!user?.id) throw new Error("کاربر شناسایی نشد");
      const { data, error } = await supabase
        .from("knowledge_documents")
        .insert({ ...values, created_by: user.id })
        .select("id")
        .single();
      if (error) throw error;
      const { error: aErr } = await supabase.from("audit_logs").insert({
        action: "knowledge_document_created",
        entity_type: "knowledge_document",
        entity_id: data.id,
        actor_id: user.id,
        diff: {
          title: values.title,
          category: values.category,
          access_level: values.access_level,
          is_published: values.is_published,
        },
      });
      if (aErr) console.warn("audit insert failed:", aErr);
    },
    onSuccess: () => {
      toast.success("سند ایجاد شد");
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["knowledge-documents-manage"] });
      qc.invalidateQueries({ queryKey: ["knowledge-documents"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در ایجاد سند"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      values,
      original,
    }: {
      id: string;
      values: KnowledgeFormValues;
      original: DocRow;
    }) => {
      if (!user?.id) throw new Error("کاربر شناسایی نشد");
      const { error } = await supabase.from("knowledge_documents").update(values).eq("id", id);
      if (error) throw error;

      const diff: Record<string, { from: unknown; to: unknown }> = {};
      (Object.keys(values) as (keyof KnowledgeFormValues)[]).forEach((k) => {
        if (original[k] !== values[k]) diff[k] = { from: original[k], to: values[k] };
      });
      const publishToggled = original.is_published !== values.is_published;

      const action = publishToggled
        ? values.is_published
          ? "knowledge_document_published"
          : "knowledge_document_updated"
        : "knowledge_document_updated";
      const { error: aErr } = await supabase.from("audit_logs").insert({
        action,
        entity_type: "knowledge_document",
        entity_id: id,
        actor_id: user.id,
        diff: JSON.parse(JSON.stringify(diff)),
      });
      if (aErr) console.warn("audit insert failed:", aErr);
    },
    onSuccess: () => {
      toast.success("سند به‌روزرسانی شد");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["knowledge-documents-manage"] });
      qc.invalidateQueries({ queryKey: ["knowledge-documents"] });
      qc.invalidateQueries({ queryKey: ["knowledge-document"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در به‌روزرسانی سند"),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="مدیریت دانشنامه"
        description="ایجاد، ویرایش و انتشار اسناد سازمانی"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/knowledge">
                <ArrowRight className="ms-1 h-4 w-4" />
                بازگشت
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={reindexM.isPending}
              onClick={() => reindexM.mutate()}
            >
              {reindexM.isPending ? (
                <Loader2 className="ms-1 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="ms-1 h-4 w-4" />
              )}
              نمایه‌سازی مجدد
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="ms-1 h-4 w-4" />
              سند جدید
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              در حال بارگذاری...
            </div>
          ) : !rows || rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              هنوز سندی ثبت نشده است.
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 ps-3 text-start">عنوان</th>
                      <th className="py-2 text-start">دسته</th>
                      <th className="py-2 text-start">دسترسی</th>
                      <th className="py-2 text-start">نسخه</th>
                      <th className="py-2 text-start">وضعیت</th>
                      <th className="py-2 text-start">به‌روزرسانی</th>
                      <th className="py-2 pe-3 text-end">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2 ps-3 font-medium">{r.title}</td>
                        <td className="py-2">{KNOWLEDGE_CATEGORY_LABELS[r.category]}</td>
                        <td className="py-2 text-xs">{KNOWLEDGE_ACCESS_LABELS[r.access_level]}</td>
                        <td className="py-2">{r.version}</td>
                        <td className="py-2">
                          {r.is_published ? (
                            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                              <Eye className="ms-1 h-3 w-3" />
                              منتشرشده
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <EyeOff className="ms-1 h-3 w-3" />
                              پیش‌نویس
                            </Badge>
                          )}
                        </td>
                        <td className="py-2 text-xs text-muted-foreground">
                          {formatDateFa(r.updated_at)}
                        </td>
                        <td className="py-2 pe-3 text-end">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="space-y-2 p-3 md:hidden">
                {rows.map((r) => (
                  <div key={r.id} className="rounded-md border bg-background p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="font-medium">{r.title}</div>
                        <div className="flex flex-wrap gap-1.5 text-xs">
                          <Badge variant="outline">{KNOWLEDGE_CATEGORY_LABELS[r.category]}</Badge>
                          <Badge variant="secondary">
                            {KNOWLEDGE_ACCESS_LABELS[r.access_level]}
                          </Badge>
                          {r.is_published ? (
                            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                              منتشرشده
                            </Badge>
                          ) : (
                            <Badge>پیش‌نویس</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          نسخه {r.version} • {formatDateFa(r.updated_at)}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>سند جدید</DialogTitle>
          </DialogHeader>
          <KnowledgeDocumentForm
            submitting={createMutation.isPending}
            submitLabel="ایجاد"
            onCancel={() => setCreating(false)}
            onSubmit={async (values) => {
              await createMutation.mutateAsync(values);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>ویرایش سند</DialogTitle>
          </DialogHeader>
          {editing && (
            <KnowledgeDocumentForm
              defaultValues={editing}
              submitting={updateMutation.isPending}
              submitLabel="ذخیره تغییرات"
              onCancel={() => setEditing(null)}
              onSubmit={async (values) => {
                await updateMutation.mutateAsync({ id: editing.id, values, original: editing });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
