/**
 * Settings «دلایل شکست معامله» — pattern from pricing/change-reasons.
 * Deactivate never delete.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ArrowRight, Power, Search } from "lucide-react";

import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { useDebounce } from "@/hooks/use-debounce";
import {
  createDealLostReason,
  listDealLostReasons,
  setDealLostReasonActive,
  salesDeskErrorMessage,
} from "@/lib/sales-desk";

export const Route = createFileRoute("/_app/settings/deal-lost-reasons")({
  beforeLoad: async () => {
    await requirePermission("deal-lost-reasons", "view");
  },
  component: DealLostReasonsSettingsPage,
});

function DealLostReasonsSettingsPage() {
  const { roles } = useAuth();
  const canWrite = hasAnyRole(roles, ["admin", "manager"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const dSearch = useDebounce(search, 350);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["deal-lost-reasons-admin"],
    queryFn: () => listDealLostReasons(),
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    const q = dSearch.trim();
    return q.length >= 1 ? list.filter((r) => r.title.includes(q)) : list;
  }, [data, dSearch]);

  const onCreate = async () => {
    setSaving(true);
    try {
      await createDealLostReason(title);
      toast.success("دلیل ثبت شد");
      setTitle("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["deal-lost-reasons-admin"] });
      qc.invalidateQueries({ queryKey: ["sales-desk", "deal-lost-reasons-active"] });
    } catch (e) {
      toast.error(salesDeskErrorMessage(e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (id: string, currentlyActive: boolean) => {
    try {
      await setDealLostReasonActive(id, !currentlyActive);
      toast.success(currentlyActive ? "غیرفعال شد" : "فعال شد");
      qc.invalidateQueries({ queryKey: ["deal-lost-reasons-admin"] });
      qc.invalidateQueries({ queryKey: ["sales-desk", "deal-lost-reasons-active"] });
    } catch (e) {
      toast.error(salesDeskErrorMessage(e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="دلایل شکست معامله"
        description="فهرست دلایل قابل انتخاب هنگام ناموفق شدن معامله"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/operations/sales-desk">
                <ArrowRight className="ms-1 h-4 w-4" />
                میز فروش
              </Link>
            </Button>
            {canWrite ? (
              <Button
                size="sm"
                onClick={() => {
                  setTitle("");
                  setOpen(true);
                }}
              >
                <Plus className="ms-1 h-4 w-4" />
                ایجاد دلیل شکست جدید
              </Button>
            ) : null}
          </>
        }
      />

      <Card>
        <CardContent className="p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی عنوان"
              className="pr-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
            <span>عنوان</span>
            <span>فعال</span>
            <span>غیرفعال</span>
          </div>
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">دلیلی ثبت نشده.</div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((r) => (
                <li
                  key={r.id}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-3"
                >
                  <span className="font-medium">{r.title}</span>
                  <span>
                    {r.is_active ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">فعال</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </span>
                  <span className="flex items-center gap-1">
                    {!r.is_active ? (
                      <Badge variant="destructive">غیرفعال</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    {canWrite ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggle(r.id, r.is_active)}
                        title={r.is_active ? "غیرفعال" : "فعال"}
                      >
                        <Power
                          className={`h-4 w-4 ${r.is_active ? "text-destructive" : "text-emerald-600"}`}
                        />
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>ایجاد دلیل شکست جدید</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-lost-reason-title">عنوان</Label>
            <Input
              id="new-lost-reason-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              انصراف
            </Button>
            <Button type="button" disabled={saving || !title.trim()} onClick={onCreate}>
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
