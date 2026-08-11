import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { toPersianDigits } from "@/lib/dashboard/utils";

interface OpenSession {
  id: string;
  clock_in_at: string;
}

function formatHM(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return toPersianDigits(`${hh}:${mm}`);
}

export function ClockInOutButton() {
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;
  const isAdmin = roles.includes("admin");

  const { data: openSession, isLoading } = useQuery({
    enabled: !!userId && !isAdmin,
    queryKey: ["presence-open", userId],
    queryFn: async (): Promise<OpenSession | null> => {
      const { data, error } = await supabase
        .from("presence_logs")
        .select("id, clock_in_at")
        .eq("user_id", userId!)
        .is("clock_out_at", null)
        .order("clock_in_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as OpenSession | null) ?? null;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const clockIn = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("کاربر نامعتبر است");
      const now = new Date().toISOString();
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from("presence_logs").insert({
        user_id: userId,
        clock_in_at: now,
        date: today,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ورود ثبت شد");
      qc.invalidateQueries({ queryKey: ["presence-open", userId] });
    },
    onError: (e: Error) => toast.error("ثبت ورود ناموفق بود", { description: e.message }),
  });

  const clockOut = useMutation({
    mutationFn: async () => {
      if (!openSession) throw new Error("جلسه فعالی یافت نشد");
      const now = new Date();
      const start = new Date(openSession.clock_in_at);
      const minutes = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 60000));
      const { error } = await supabase
        .from("presence_logs")
        .update({ clock_out_at: now.toISOString(), total_minutes: minutes })
        .eq("id", openSession.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("خروج ثبت شد");
      qc.invalidateQueries({ queryKey: ["presence-open", userId] });
    },
    onError: (e: Error) => toast.error("ثبت خروج ناموفق بود", { description: e.message }),
  });

  if (!userId || isAdmin) return null;

  const busy = clockIn.isPending || clockOut.isPending || isLoading;

  if (openSession) {
    return (
      <Button
        variant="destructive"
        size="sm"
        className="gap-1.5"
        disabled={busy}
        onClick={() => clockOut.mutate()}
      >
        {clockOut.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Square className="h-4 w-4" />
        )}
        <span>خروج (از {formatHM(openSession.clock_in_at)})</span>
      </Button>
    );
  }

  return (
    <Button
      variant="default"
      size="sm"
      className="gap-1.5"
      disabled={busy}
      onClick={() => clockIn.mutate()}
    >
      {clockIn.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Play className="h-4 w-4" />
      )}
      <span>ورود</span>
    </Button>
  );
}

export default ClockInOutButton;