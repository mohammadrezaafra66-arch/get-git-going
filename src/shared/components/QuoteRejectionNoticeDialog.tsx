import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDateTimeFa } from "@/lib/i18n/formatters";

type QuoteRejectionNotice = {
  id: string;
  title: string;
  body: string;
  reference_id: string | null;
  created_at: string;
};

export function QuoteRejectionNoticeDialog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const noticeQ = useQuery({
    enabled: !!user,
    queryKey: ["quote-rejection-notice", user?.id],
    queryFn: async (): Promise<QuoteRejectionNotice | null> => {
      const { data, error } = await supabase
        .from("notification_queue")
        .select("id,title,body,reference_id,created_at")
        .eq("type", "quote_rejected")
        .eq("reference_type", "sales_quote")
        .eq("is_read", false)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as QuoteRejectionNotice | null;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const markSeen = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase.rpc("mark_notification_read", {
        p_notification_id: notificationId,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("اعلان خوانده شد.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["quote-rejection-notice"] }),
        qc.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
    onError: () => toast.error("خطا در ثبت مشاهده اعلان."),
  });

  const notice = noticeQ.data;
  if (!user || !notice) return null;

  const goToQuote = () => {
    if (!notice.reference_id) return;
    navigate({ to: "/sales/quotes/$quoteId", params: { quoteId: notice.reference_id } });
  };

  return (
    <AlertDialog open>
      <AlertDialogContent className="text-right" dir="rtl">
        <AlertDialogHeader className="text-right">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <AlertDialogTitle>{notice.title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            این اعلان تا زمانی که دکمه «دیدم» را نزنید، برای شما باقی می‌ماند.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm leading-7">
          <div className="whitespace-pre-wrap">{notice.body}</div>
          <div className="text-xs text-muted-foreground">{formatDateTimeFa(notice.created_at)}</div>
        </div>

        <AlertDialogFooter className="gap-2 sm:justify-start">
          {notice.reference_id && (
            <Button variant="outline" onClick={goToQuote}>
              <Eye className="ml-1 h-4 w-4" />
              مشاهده پیش‌فاکتور
            </Button>
          )}
          <AlertDialogAction
            disabled={markSeen.isPending}
            onClick={() => markSeen.mutate(notice.id)}
          >
            {markSeen.isPending ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : null}
            دیدم
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
