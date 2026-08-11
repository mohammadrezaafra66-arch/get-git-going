import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ImageIcon, CheckCircle2, XCircle, Clock } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatCurrency, formatDateFa } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/operations/receipts")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: OcrReceiptsPage,
});

type ReceiptStatus = "pending" | "approved" | "rejected";

interface OcrReceipt {
  id: string;
  image_url: string | null;
  raw_ocr_text: string | null;
  parsed_amount: number | null;
  parsed_date: string | null;
  parsed_reference: string | null;
  parsed_payer_name: string | null;
  status: ReceiptStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

interface FetchResult {
  tableMissing: boolean;
  rows: OcrReceipt[];
}

async function fetchReceipts(status: ReceiptStatus): Promise<FetchResult> {
  const { data, error } = await (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          k: string,
          v: string,
        ) => {
          order: (
            k: string,
            o: { ascending: boolean },
          ) => Promise<{ data: OcrReceipt[] | null; error: { code?: string; message: string } | null }>;
        };
      };
    };
  })
    .from("ocr_receipts")
    .select(
      "id,image_url,raw_ocr_text,parsed_amount,parsed_date,parsed_reference,parsed_payer_name,status,reviewed_by,reviewed_at,review_note,created_at",
    )
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (error) {
    // Postgres 42P01 = undefined_table, PostgREST PGRST205 = table not found in schema cache
    if (error.code === "42P01" || error.code === "PGRST205" || /ocr_receipts/i.test(error.message)) {
      return { tableMissing: true, rows: [] };
    }
    throw new Error(error.message);
  }
  return { tableMissing: false, rows: data ?? [] };
}

function OcrReceiptsPage() {
  const [tab, setTab] = useState<ReceiptStatus>("pending");

  return (
    <div dir="rtl" className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="مرور فیش‌های OCR"
        description="بررسی و تأیید فیش‌های واریزی پردازش‌شده توسط pipeline"
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as ReceiptStatus)}>
        <TabsList className="grid w-full grid-cols-3 md:w-auto">
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            در انتظار بررسی
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            تأیید شده
          </TabsTrigger>
          <TabsTrigger value="rejected" className="gap-2">
            <XCircle className="h-4 w-4" />
            رد شده
          </TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-4">
          <ReceiptList status="pending" />
        </TabsContent>
        <TabsContent value="approved" className="mt-4">
          <ReceiptList status="approved" />
        </TabsContent>
        <TabsContent value="rejected" className="mt-4">
          <ReceiptList status="rejected" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReceiptList({ status }: { status: ReceiptStatus }) {
  const query = useQuery({
    queryKey: ["ocr_receipts", status],
    queryFn: () => fetchReceipts(status),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{(query.error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  const data = query.data!;
  if (data.tableMissing) {
    return (
      <Alert>
        <AlertDescription>
          pipeline OCR هنوز فعال نشده است. جدول ocr_receipts هنوز ساخته نشده — پس از راه‌اندازی
          سرویس Python/FastAPI، فیش‌ها اینجا ظاهر می‌شوند.
        </AlertDescription>
      </Alert>
    );
  }

  if (data.rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          هیچ فیشی برای بررسی وجود ندارد
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {data.rows.map((r) => (
        <ReceiptCard key={r.id} receipt={r} />
      ))}
    </div>
  );
}

const STATUS_BADGE: Record<ReceiptStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "در انتظار", variant: "secondary" },
  approved: { label: "تأیید شده", variant: "default" },
  rejected: { label: "رد شده", variant: "destructive" },
};

function ReceiptCard({ receipt }: { receipt: OcrReceipt }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [imgOpen, setImgOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState("");

  const approve = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("کاربر شناسایی نشد");
      const { error } = await (supabase as unknown as {
        from: (t: string) => {
          update: (v: Record<string, unknown>) => {
            eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      })
        .from("ocr_receipts")
        .update({
          status: "approved",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", receipt.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("فیش تأیید شد");
      qc.invalidateQueries({ queryKey: ["ocr_receipts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("کاربر شناسایی نشد");
      const trimmed = note.trim();
      if (trimmed.length < 5) throw new Error("یادداشت رد باید حداقل ۵ کاراکتر باشد");
      const { error } = await (supabase as unknown as {
        from: (t: string) => {
          update: (v: Record<string, unknown>) => {
            eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      })
        .from("ocr_receipts")
        .update({
          status: "rejected",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_note: trimmed,
        })
        .eq("id", receipt.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("فیش رد شد");
      setRejectOpen(false);
      setNote("");
      qc.invalidateQueries({ queryKey: ["ocr_receipts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const badge = STATUS_BADGE[receipt.status];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 md:flex-row">
          <button
            type="button"
            onClick={() => receipt.image_url && setImgOpen(true)}
            className="relative flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted"
            disabled={!receipt.image_url}
          >
            {receipt.image_url ? (
              <img
                src={receipt.image_url}
                alt="فیش واریزی"
                className="h-full w-full object-cover"
              />
            ) : (
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            )}
          </button>

          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground">مبلغ: </span>
                  <span className="font-semibold">
                    {receipt.parsed_amount != null ? formatCurrency(receipt.parsed_amount) : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">تاریخ: </span>
                  <span>{receipt.parsed_date ? formatDateFa(receipt.parsed_date) : "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">شماره مرجع: </span>
                  <span dir="ltr" className="font-mono">
                    {receipt.parsed_reference ?? "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">واریزکننده: </span>
                  <span>{receipt.parsed_payer_name ?? "—"}</span>
                </div>
              </div>
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>

            {receipt.status === "rejected" && receipt.review_note && (
              <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                یادداشت رد: {receipt.review_note}
              </div>
            )}

            <Accordion type="single" collapsible>
              <AccordionItem value="raw" className="border-b-0">
                <AccordionTrigger className="py-2 text-xs text-muted-foreground">
                  متن خام OCR
                </AccordionTrigger>
                <AccordionContent>
                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                    {receipt.raw_ocr_text ?? "—"}
                  </pre>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {receipt.status === "pending" && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  size="sm"
                  onClick={() => approve.mutate()}
                  disabled={approve.isPending}
                >
                  {approve.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  تأیید
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setRejectOpen(true)}
                  disabled={approve.isPending}
                >
                  رد
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>

      {receipt.image_url && (
        <Dialog open={imgOpen} onOpenChange={setImgOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>تصویر فیش</DialogTitle>
            </DialogHeader>
            <img src={receipt.image_url} alt="فیش واریزی" className="w-full rounded-md" />
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رد فیش</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm">دلیل رد (حداقل ۵ کاراکتر)</label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="مثلاً: تصویر ناخوانا، مبلغ نامطابق و ..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              انصراف
            </Button>
            <Button
              variant="destructive"
              onClick={() => reject.mutate()}
              disabled={reject.isPending || note.trim().length < 5}
            >
              {reject.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              ثبت رد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}