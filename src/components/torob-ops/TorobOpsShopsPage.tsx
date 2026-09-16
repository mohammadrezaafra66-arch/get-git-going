import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { withOpsSession } from "@/lib/torob-ops/client-session";
import {
  torobOpsDeleteOwnShop,
  torobOpsListOwnShops,
  torobOpsUpsertOwnShop,
} from "@/lib/torob-ops/functions";
import { TorobOpsGate } from "./TorobOpsGate";

type ShopRow = {
  id: string;
  shop_name: string | null;
  domain: string | null;
  notes: string | null;
  is_active: boolean;
};

function ShopsInner() {
  const qc = useQueryClient();
  const listFn = useServerFn(torobOpsListOwnShops);
  const upsertFn = useServerFn(torobOpsUpsertOwnShop);
  const deleteFn = useServerFn(torobOpsDeleteOwnShop);

  const [shopName, setShopName] = useState("");
  const [domain, setDomain] = useState("");
  const [notes, setNotes] = useState("");

  const q = useQuery({
    queryKey: ["torob-ops-own-shops"],
    queryFn: () => listFn({ data: withOpsSession() }),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      upsertFn({
        data: withOpsSession({
          shopName: shopName.trim() || null,
          domain: domain.trim() || null,
          notes: notes.trim() || null,
          isActive: true,
        }),
      }),
    onSuccess: () => {
      toast.success("فروشگاه خودی ذخیره شد.");
      setShopName("");
      setDomain("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["torob-ops-own-shops"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: withOpsSession({ id }) }),
    onSuccess: () => {
      toast.success("حذف شد.");
      qc.invalidateQueries({ queryKey: ["torob-ops-own-shops"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="فروشگاه‌های خودی"
        description="این فروشگاه‌ها در اسکن طعمه نادیده گرفته می‌شوند."
      />

      <Card>
        <CardContent className="grid gap-3 py-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>نام فروشگاه</Label>
            <Input value={shopName} onChange={(e) => setShopName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>دامنه</Label>
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>یادداشت</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <Button
            type="button"
            className="sm:col-span-2 w-fit"
            disabled={saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            افزودن
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {((q.data ?? []) as ShopRow[]).map((row) => (
          <Card key={row.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div>
                <div className="font-medium">{row.shop_name ?? "—"}</div>
                <div className="text-muted-foreground">{row.domain ?? "بدون دامنه"}</div>
                {row.notes ? <div className="mt-1 text-xs">{row.notes}</div> : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={delMut.isPending}
                onClick={() => delMut.mutate(row.id)}
              >
                حذف
              </Button>
            </CardContent>
          </Card>
        ))}
        {q.isSuccess && (q.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">هنوز فروشگاه خودی ثبت نشده.</p>
        ) : null}
      </div>
    </div>
  );
}

export function TorobOpsShopsPage() {
  return (
    <TorobOpsGate>
      <ShopsInner />
    </TorobOpsGate>
  );
}
