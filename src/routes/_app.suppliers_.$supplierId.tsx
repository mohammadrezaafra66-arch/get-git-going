import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, X, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { requirePermission } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermissionEx } from "@/lib/rbac/roles";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SupplierForm } from "@/shared/components/SupplierForm";
import { PersonRoleCrossLinks } from "@/components/persons/PersonRoleCrossLinks";
import { formatDateTimeFa } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/suppliers_/$supplierId")({
  beforeLoad: async () => {
    await requirePermission("suppliers", "view");
  },
  component: SupplierDetailPage,
});

interface SupplierDetail {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  city: string | null;
  notes: string | null;
  trust_level: "low" | "medium" | "high";
  status: "pending" | "active" | "rejected";
  created_at: string;
  updated_at: string;
  created_by: string | null;
  person_id: string | null;
}

function SupplierDetailPage() {
  const { supplierId } = Route.useParams();
  const isNew = supplierId === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { roles } = useAuth();
  // P1.5b — see SupplierForm: role_permissions is the source of truth.
  const canManage = hasPermissionEx(roles, "suppliers", "update");

  const { data, isLoading } = useQuery({
    queryKey: ["supplier", supplierId],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select(
          "id, name, contact_name, phone, city, notes, trust_level, status, created_at, updated_at, created_by, person_id",
        )
        .eq("id", supplierId)
        .maybeSingle();
      if (error) throw error;
      return data as SupplierDetail | null;
    },
  });

  // The Asan code is read from person_identifiers, not from
  // suppliers.accounting_code. The column is a mirror kept in step by triggers
  // (migrations 308/309); the identifier is the source, and it is what
  // asan_list_purchase_export actually reads.
  const { data: asanCode } = useQuery({
    queryKey: ["supplier-asan-code", data?.person_id],
    enabled: Boolean(data?.person_id),
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("person_identifiers")
        .select("value_raw")
        .eq("person_id", data!.person_id as string)
        .eq("kind", "asan_person_code")
        .neq("status", "revoked")
        .maybeSingle();
      if (error) throw error;
      return ((row as { value_raw: string | null } | null)?.value_raw ?? "") as string;
    },
  });

  const setStatus = useMutation({
    mutationFn: async (newStatus: "active" | "rejected") => {
      const { error } = await supabase
        .from("suppliers")
        .update({ status: newStatus } as never)
        .eq("id", supplierId);
      if (error) throw error;
    },
    onSuccess: (_, newStatus) => {
      toast.success(newStatus === "active" ? "تأمین‌کننده تأیید شد" : "تأمین‌کننده رد شد");
      queryClient.invalidateQueries({ queryKey: ["supplier", supplierId] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطای ناشناخته";
      toast.error(`عملیات ناموفق بود: ${msg}`);
    },
  });

  if (isNew) {
    if (!canManage) {
      return (
        <div className="space-y-4" dir="rtl">
          <PageHeader title="تأمین‌کننده جدید" />
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              دسترسی ایجاد تأمین‌کننده ندارید.
            </CardContent>
          </Card>
        </div>
      );
    }
    return (
      <div className="space-y-4" dir="rtl">
        <PageHeader
          title="تأمین‌کننده جدید"
          description="ثبت یک تأمین‌کننده جدید در سیستم"
          actions={
            <Button variant="outline" onClick={() => navigate({ to: "/suppliers" })}>
              <ArrowRight className="ml-2 h-4 w-4" /> بازگشت
            </Button>
          }
        />
        <Card>
          <CardContent className="pt-6">
            <SupplierForm />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4" dir="rtl">
        <PageHeader title="یافت نشد" />
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            تأمین‌کننده مورد نظر یافت نشد.
            <div className="mt-4">
              <Button asChild variant="outline">
                <Link to="/suppliers">بازگشت به لیست</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        title={data.name}
        description={`ایجاد: ${formatDateTimeFa(data.created_at)} | آخرین به‌روزرسانی: ${formatDateTimeFa(data.updated_at)}`}
        actions={
          <Button variant="outline" onClick={() => navigate({ to: "/suppliers" })}>
            <ArrowRight className="ml-2 h-4 w-4" /> بازگشت
          </Button>
        }
      />

      {data.status === "pending" && canManage && (
        <Card className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex flex-col items-start justify-between gap-3 py-4 sm:flex-row sm:items-center">
            <div>
              <Badge className="bg-amber-500 text-white hover:bg-amber-500">در انتظار تأیید</Badge>
              <p className="mt-1 text-sm text-muted-foreground">
                این تأمین‌کننده هنوز تأیید نشده است.
              </p>
            </div>
            <div className="flex gap-2">
              <ConfirmAction
                title="تأیید تأمین‌کننده"
                description={`آیا از تأیید «${data.name}» اطمینان دارید؟`}
                actionLabel="تأیید"
                onConfirm={() => setStatus.mutate("active")}
                trigger={
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700"
                    disabled={setStatus.isPending}
                  >
                    <Check className="ml-2 h-4 w-4" /> تأیید
                  </Button>
                }
              />
              <ConfirmAction
                title="رد تأمین‌کننده"
                description={`آیا از رد «${data.name}» اطمینان دارید؟`}
                actionLabel="رد"
                onConfirm={() => setStatus.mutate("rejected")}
                trigger={
                  <Button variant="destructive" disabled={setStatus.isPending}>
                    <X className="ml-2 h-4 w-4" /> رد
                  </Button>
                }
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* P1.3 — the same person can be a customer too; without this the two
          sides of one human are invisible to each other. */}
      <PersonRoleCrossLinks personId={data.person_id} currentSide="supplier" />

      <Card>
        <CardContent className="pt-6">
          <SupplierForm
            supplierId={data.id}
            personId={data.person_id}
            hideStatus
            defaultValues={{
              name: data.name,
              contact_name: data.contact_name ?? "",
              phone: data.phone ?? "",
              city: data.city ?? "",
              notes: data.notes ?? "",
              accounting_code: asanCode ?? "",
              trust_level: data.trust_level,
              status: data.status,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ConfirmAction({
  title,
  description,
  actionLabel,
  onConfirm,
  trigger,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onConfirm: () => void;
  trigger: React.ReactNode;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>انصراف</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{actionLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
