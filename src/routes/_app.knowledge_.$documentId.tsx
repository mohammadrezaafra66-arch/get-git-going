import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, BookOpen, CheckCircle2, Loader2 } from "lucide-react";
import { marked } from "marked";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDateFa } from "@/lib/i18n/formatters";
import {
  KNOWLEDGE_CATEGORY_LABELS, KNOWLEDGE_ACCESS_LABELS,
  type KnowledgeCategory, type KnowledgeAccessLevel,
} from "@/lib/knowledge/constants";

export const Route = createFileRoute("/_app/knowledge_/$documentId")({
  beforeLoad: async () => { await requirePermission("knowledge", "view"); },
  component: KnowledgeDocumentPage,
});

marked.setOptions({ gfm: true, breaks: true });

function KnowledgeDocumentPage() {
  const { documentId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: doc, isLoading, error } = useQuery({
    queryKey: ["knowledge-document", documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_documents")
        .select("id, title, content, category, access_level, version, is_published, created_at, updated_at, created_by")
        .eq("id", documentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: confirmation } = useQuery({
    queryKey: ["knowledge-confirmation", documentId, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_confirmations")
        .select("id, confirmed_at")
        .eq("document_id", documentId)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("کاربر شناسایی نشد");
      const { error } = await supabase.from("knowledge_confirmations").insert({
        document_id: documentId, user_id: user.id,
      });
      if (error) throw error;
      const { error: aErr } = await supabase.from("audit_logs").insert({
        action: "knowledge_confirmation_added",
        entity_type: "knowledge_confirmation",
        entity_id: documentId,
        actor_id: user.id,
        diff: { document_id: documentId },
      });
      if (aErr) console.warn("audit insert failed:", aErr);
    },
    onSuccess: () => {
      toast.success("مطالعه شما ثبت شد");
      qc.invalidateQueries({ queryKey: ["knowledge-confirmation", documentId, user?.id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در ثبت مطالعه"),
  });

  const html = useMemo(() => {
    if (!doc?.content) return "";
    try { return marked.parse(doc.content) as string; }
    catch { return doc.content; }
  }, [doc?.content]);

  if (isLoading) return <div className="py-10 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>;
  if (error || !doc) return (
    <div className="space-y-4 py-10 text-center">
      <BookOpen className="mx-auto h-10 w-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">سند یافت نشد یا دسترسی ندارید.</p>
      <Button asChild variant="outline" size="sm">
        <Link to="/knowledge"><ArrowRight className="ms-1 h-4 w-4" />بازگشت به دانشنامه</Link>
      </Button>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={doc.title}
        description={`نسخه ${doc.version} • آخرین به‌روزرسانی: ${formatDateFa(doc.updated_at)}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/knowledge"><ArrowRight className="ms-1 h-4 w-4" />بازگشت</Link>
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{KNOWLEDGE_CATEGORY_LABELS[doc.category as KnowledgeCategory]}</Badge>
        <Badge variant="secondary">{KNOWLEDGE_ACCESS_LABELS[doc.access_level as KnowledgeAccessLevel]}</Badge>
        {!doc.is_published && <Badge className="bg-amber-500 text-white hover:bg-amber-500">پیش‌نویس</Badge>}
      </div>

      <Card>
        <CardContent className="p-5">
          <div
            className="prose prose-sm max-w-none text-foreground rtl:prose-headings:text-right [&_*]:break-words"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          {confirmation ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              <span>شما این سند را در تاریخ {formatDateFa(confirmation.confirmed_at)} مطالعه کرده‌اید.</span>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">پس از مطالعه کامل سند، تأیید کنید.</p>
              <Button onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
                {confirmMutation.isPending && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}
                مطالعه کردم
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}