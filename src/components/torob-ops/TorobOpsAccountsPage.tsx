import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { withOpsSession } from "@/lib/torob-ops/client-session";
import {
  ACCOUNT_STATUS_LABELS_FA,
  type AccountStatus,
} from "@/lib/torob-ops/types";
import {
  torobOpsListAccounts,
  torobOpsSetAccountStatus,
  torobOpsUpsertAccount,
} from "@/lib/torob-ops/functions";
import { toFaDigits } from "@/lib/i18n/formatters";
import { TorobOpsGate } from "./TorobOpsGate";

type AccountRow = {
  id: string;
  label: string;
  status: AccountStatus;
  last_used_at: string | null;
  last_error: string | null;
  reports_today: number;
  daily_cap: number;
  has_session: boolean;
};

function AccountsInner() {
  const qc = useQueryClient();
  const listFn = useServerFn(torobOpsListAccounts);
  const upsertFn = useServerFn(torobOpsUpsertAccount);
  const statusFn = useServerFn(torobOpsSetAccountStatus);

  const [label, setLabel] = useState("");
  const [dailyCap, setDailyCap] = useState(20);
  const [sessionJson, setSessionJson] = useState("");

  const q = useQuery({
    queryKey: ["torob-ops-accounts"],
    queryFn: () => listFn({ data: withOpsSession() }),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      upsertFn({
        data: withOpsSession({
          label: label.trim(),
          dailyCap,
          sessionJson: sessionJson.trim() || null,
          status: "active",
        }),
      }),
    onSuccess: () => {
      toast.success("اکانت ذخیره شد (session رمزنگاری‌شده).");
      setLabel("");
      setSessionJson("");
      qc.invalidateQueries({ queryKey: ["torob-ops-accounts"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const statusMut = useMutation({
    mutationFn: (payload: { id: string; status: AccountStatus }) =>
      statusFn({ data: withOpsSession(payload) }),
    onSuccess: () => {
      toast.success("وضعیت اکانت به‌روز شد.");
      qc.invalidateQueries({ queryKey: ["torob-ops-accounts"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="استخر اکانت‌های ترب"
        description="چرخش least-recent، سقف روزانه، و قرنطینه در صورت CAPTCHA/ban."
      />

      <Card>
        <CardContent className="grid gap-3 py-4">
          <div className="space-y-1">
            <Label>برچسب اکانت</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>سقف روزانه</Label>
            <Input
              type="number"
              value={dailyCap}
              onChange={(e) => setDailyCap(Number(e.target.value) || 1)}
            />
          </div>
          <div className="space-y-1">
            <Label>JSON نشست (رمزنگاری at-rest؛ هرگز در لاگ چاپ نشود)</Label>
            <Textarea
              value={sessionJson}
              onChange={(e) => setSessionJson(e.target.value)}
              rows={4}
              placeholder='{"cookies":"..."}'
            />
          </div>
          <Button
            type="button"
            className="w-fit"
            disabled={saveMut.isPending || !label.trim()}
            onClick={() => saveMut.mutate()}
          >
            افزودن اکانت
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {((q.data ?? []) as AccountRow[]).map((row) => (
          <Card key={row.id}>
            <CardContent className="space-y-2 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{row.label}</span>
                <Badge>{ACCOUNT_STATUS_LABELS_FA[row.status]}</Badge>
                {row.has_session ? (
                  <Badge variant="secondary">session دارد</Badge>
                ) : (
                  <Badge variant="outline">بدون session</Badge>
                )}
              </div>
              <div>
                امروز: {toFaDigits(String(row.reports_today ?? 0))} /{" "}
                {toFaDigits(String(row.daily_cap))}
              </div>
              {row.last_error ? (
                <p className="text-xs text-destructive">{row.last_error}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {row.status !== "active" ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => statusMut.mutate({ id: row.id, status: "active" })}
                  >
                    فعال
                  </Button>
                ) : null}
                {row.status !== "quarantine" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => statusMut.mutate({ id: row.id, status: "quarantine" })}
                  >
                    قرنطینه
                  </Button>
                ) : null}
                {row.status !== "disabled" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => statusMut.mutate({ id: row.id, status: "disabled" })}
                  >
                    غیرفعال
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
        {q.isSuccess && (q.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">استخر خالی است.</p>
        ) : null}
      </div>
    </div>
  );
}

export function TorobOpsAccountsPage() {
  return (
    <TorobOpsGate>
      <AccountsInner />
    </TorobOpsGate>
  );
}
