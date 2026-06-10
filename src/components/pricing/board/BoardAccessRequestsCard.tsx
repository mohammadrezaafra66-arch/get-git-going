import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/AuthProvider";
import { AMIN_HOZOOR_BOARD_KEY } from "@/lib/pricing/board-settings";
import { fetchPendingBoardRequests, reviewBoardAccessRequest } from "@/lib/pricing/board-access";
import { formatDateTimeFa } from "@/lib/i18n/formatters";

export function BoardAccessRequestsCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ["pricing-board-pending-requests", AMIN_HOZOOR_BOARD_KEY],
    queryFn: () => fetchPendingBoardRequests(AMIN_HOZOOR_BOARD_KEY, "pending"),
    refetchInterval: 45_000,
    staleTime: 20_000,
  });

  const reviewMut = useMutation({
    mutationFn: async (vars: { id: string; status: "approved" | "rejected" }) => {
      if (!user?.id) throw new Error("کاربر احراز نشده است.");
      return reviewBoardAccessRequest({
        requestId: vars.id,
        newStatus: vars.status,
        reviewerId: user.id,
        reviewNote: notes[vars.id] || undefined,
      });
    },
    onSuccess: (_data, vars) => {
      toast.success(
        vars.status === "approved"
          ? "دسترسی کاربر با موفقیت تأیید شد."
          : "درخواست دسترسی کاربر رد شد.",
      );
      qc.invalidateQueries({ queryKey: ["pricing-board-pending-requests", AMIN_HOZOOR_BOARD_KEY] });
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "خطا در پردازش درخواست");
    },
  });

  const items = q.data ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" />
          درخواست‌های دسترسی به تابلوی امین حضور
          {items.length > 0 && <Badge variant="secondary">{items.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> در حال بارگذاری...
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">درخواست در انتظار تأییدی وجود ندارد.</p>
        ) : (
          items.map((r) => (
            <div
              key={r.id}
              className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <div className="text-sm font-medium">{r.profile?.full_name ?? "بدون نام"}</div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {r.profile?.phone && <span>📱 {r.profile.phone}</span>}
                  <span>زمان درخواست: {formatDateTimeFa(new Date(r.requested_at))}</span>
                  {r.roles.length > 0 && (
                    <span className="flex gap-1">
                      {r.roles.map((rl) => (
                        <Badge key={rl} variant="outline" className="text-[10px]">
                          {rl}
                        </Badge>
                      ))}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={notes[r.id] ?? ""}
                  onChange={(e) => setNotes((s) => ({ ...s, [r.id]: e.target.value }))}
                  placeholder="یادداشت (اختیاری)"
                  className="h-8 w-full sm:w-48"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => reviewMut.mutate({ id: r.id, status: "approved" })}
                    disabled={reviewMut.isPending}
                  >
                    <Check className="ml-1 h-4 w-4" /> تأیید
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => reviewMut.mutate({ id: r.id, status: "rejected" })}
                    disabled={reviewMut.isPending}
                  >
                    <X className="ml-1 h-4 w-4" /> رد
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
