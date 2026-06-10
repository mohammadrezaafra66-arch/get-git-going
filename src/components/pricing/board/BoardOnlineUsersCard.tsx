import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AMIN_HOZOOR_BOARD_KEY } from "@/lib/pricing/board-settings";
import { fetchOnlineSessions } from "@/lib/pricing/board-presence";
import { formatDateTimeFa } from "@/lib/i18n/formatters";

export function BoardOnlineUsersCard() {
  const q = useQuery({
    queryKey: ["pricing-board-online", AMIN_HOZOOR_BOARD_KEY],
    queryFn: () => fetchOnlineSessions(AMIN_HOZOOR_BOARD_KEY),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const items = q.data ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          کاربران آنلاین تابلوی امین حضور
          <Badge variant="secondary">{items.length}</Badge>
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => q.refetch()}
          disabled={q.isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> در حال بارگذاری...
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            در حال حاضر کاربری در تابلو آنلاین نیست.
          </p>
        ) : (
          items.map((s) => (
            <div
              key={s.id}
              className="flex flex-col gap-1 rounded-md border bg-muted/20 p-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                  {s.profile?.full_name ?? "بدون نام"}
                  {s.roles.length > 0 && (
                    <span className="flex gap-1">
                      {s.roles.map((r) => (
                        <Badge key={r} variant="outline" className="text-[10px]">
                          {r}
                        </Badge>
                      ))}
                    </span>
                  )}
                </div>
                {s.profile?.phone && (
                  <div className="text-xs text-muted-foreground">📱 {s.profile.phone}</div>
                )}
              </div>
              <div className="text-xs text-muted-foreground sm:text-left">
                <div>ورود: {formatDateTimeFa(new Date(s.entered_at))}</div>
                <div>آخرین حضور: {formatDateTimeFa(new Date(s.last_seen_at))}</div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}