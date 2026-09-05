import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Trophy } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LeagueBadge } from "@/components/gamification/LeagueBadge";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatNumber } from "@/lib/i18n/formatters";
import {
  getCurrentLeague,
  getLeagueLeaderboard,
  LEAGUE_TIERS,
  TIER_FA,
  type LeagueTier,
} from "@/lib/operations/gamification-leagues";

export const Route = createFileRoute("/_app/gamification/league")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "sales", "accountant", "viewer"]);
  },
  component: LeaguePage,
});

function LeaguePage() {
  const { user } = useAuth();
  const [tier, setTier] = useState<LeagueTier>("Bronze");

  const mineQ = useQuery({
    queryKey: ["current-league", user?.id],
    enabled: !!user?.id,
    queryFn: () => getCurrentLeague(user!.id),
  });

  const boardQ = useQuery({
    queryKey: ["league-leaderboard", tier],
    queryFn: () => getLeagueLeaderboard(tier, 50, 0),
  });

  const myLeague = (mineQ.data?.league as LeagueTier | null | undefined) ?? null;

  return (
    <div className="container py-6 space-y-6" dir="rtl">
      <PageHeader
        title="لیگ گیمیفیکیشن"
        description="رتبه و امتیاز لیگ از بک‌اند خوانده می‌شود؛ محاسبه در فرانت تکرار نشده است."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/gamification/leaderboard">لیدربورد کلی</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            لیگ من
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {mineQ.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : !myLeague ? (
            // C-6 (unwired wave 1) — LeagueBadge draws its own "no tier yet" state, so it
            // renders here too rather than only on the happy path. `employee_leagues` is
            // empty today, so this is the branch that is actually on screen.
            <div className="flex items-center gap-3">
              <LeagueBadge tier={null} size="md" label />
              <p className="text-muted-foreground">
                فصل فعالی ثبت نشده است. مدیر می‌تواند از «مدیریت لیگ‌ها» فصل را شروع کند.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3 items-center">
              <LeagueBadge tier={myLeague} size="md" label />
              <Badge>{TIER_FA[myLeague]}</Badge>
              <span>فصل: {mineQ.data?.season_name ?? "—"}</span>
              <span>امتیاز: {formatNumber(Number(mineQ.data?.score ?? 0))}</span>
              <span>رتبه: {mineQ.data?.rank != null ? formatNumber(mineQ.data.rank) : "—"}</span>
              {mineQ.data?.promoted && <Badge variant="default">ارتقا یافته</Badge>}
              {mineQ.data?.demoted && <Badge variant="destructive">سقوط</Badge>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {/* C-6 — the badge tracks the selector, so it is visible whatever the data is. */}
            <LeagueBadge tier={tier} size="sm" />
            جدول لیگ
          </CardTitle>
          <Select value={tier} onValueChange={(v) => setTier(v as LeagueTier)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAGUE_TIERS.map((t) => (
                <SelectItem key={t} value={t}>
                  <span className="flex items-center gap-2">
                    <LeagueBadge tier={t} size="xs" />
                    {TIER_FA[t]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {boardQ.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (boardQ.data ?? []).length === 0 ? (
            <EmptyState
              title="عضوی در این لیگ نیست"
              description="پس از شروع فصل و تسویه، رتبه‌ها اینجا دیده می‌شوند."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رتبه</TableHead>
                  <TableHead>نام</TableHead>
                  <TableHead>امتیاز</TableHead>
                  <TableHead>وضعیت</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(boardQ.data ?? []).map((r) => (
                  <TableRow
                    key={r.employee_id}
                    className={r.employee_id === user?.id ? "bg-muted/40" : undefined}
                  >
                    <TableCell>{formatNumber(r.rank)}</TableCell>
                    <TableCell>{r.full_name ?? "—"}</TableCell>
                    <TableCell>{formatNumber(Number(r.score))}</TableCell>
                    <TableCell>{r.promoted ? "ارتقا" : r.demoted ? "سقوط" : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
