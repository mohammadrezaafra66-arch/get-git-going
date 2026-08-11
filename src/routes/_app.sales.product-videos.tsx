import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Send, Upload, Video } from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CameraCaptureButton } from "@/shared/components/CameraCaptureButton";
import { uploadWithProgress } from "@/lib/storage/upload-with-progress";
import { toFaDigits } from "@/lib/i18n/formatters";
import { isoToJalaliDisplay } from "@/lib/i18n/jalali";

/**
 * M5.1 — the product video chain, operated by a human.
 *
 * Migration 296 built the chain and has the rules; this page is the call site, because a chain
 * nobody can operate is the "built and never wired up" pattern mission control section 3 names
 * as this project's recurring failure — and `tasks` sitting at 0 rows with
 * `proof_requirement='product_video'` already defined was exactly that.
 *
 * The page shows every stage and offers only the action whose turn it is. It re-implements no
 * rule: the transition guard is a trigger in 296, so a control the backend would refuse is never
 * rendered rather than rendered-and-rejected.
 *
 * **The camera button runs with `optimize={false}` on purpose.** That flag routes files through
 * `prepareCameraImages`, which compresses and de-rotates *photographs*. Handing a video to an
 * image pipeline would corrupt it, and the failure would look like a bad upload rather than a
 * wrong flag.
 */

export const Route = createFileRoute("/_app/sales/product-videos")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "sales", "accountant"]);
  },
  component: ProductVideosPage,
});

const BUCKET = "delivery-receipts";
/** Exactly the video types the bucket allows (verified in migration 296's gate). */
const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm";

const STAGE_LABEL: Record<string, string> = {
  required: "نیاز به ویدئو",
  task_created: "کار ساخته شد — منتظر ضبط",
  video_uploaded: "ویدئو بارگذاری شد",
  salesperson_notified: "به فروشنده اطلاع داده شد",
  sent_to_customer: "برای مشتری ارسال شد",
  confirmed_sent: "ارسال تأیید شد",
};

interface WaitingRow {
  chain_id: string;
  quote_id: string;
  quote_number: string | null;
  customer_name: string | null;
  product_name: string | null;
  stage: string;
  task_id: string | null;
  accepted: boolean;
  created_at: string;
}

function ProductVideosPage() {
  const { roles } = useAuth();
  const qc = useQueryClient();
  const canAct = roles.includes("admin") || roles.includes("manager") || roles.includes("sales");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});

  const waiting = useQuery({
    queryKey: ["product-videos-waiting"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("product_videos_waiting");
      if (error) throw error;
      return (data ?? []) as unknown as WaitingRow[];
    },
  });

  const rows = useMemo(() => waiting.data ?? [], [waiting.data]);
  const sold = rows.filter((r) => r.accepted);

  const advance = useMutation({
    mutationFn: async ({ chainId, to }: { chainId: string; to: string }) => {
      const { data, error } = await supabase.rpc("product_video_advance", {
        _chain_id: chainId,
        _to_stage: to,
        _note: null,
      });
      if (error) throw error;
      return data as { changed?: boolean };
    },
    onSuccess: (res) => {
      toast.success(res?.changed === false ? "این مرحله قبلاً ثبت شده بود." : "مرحله ثبت شد.");
      qc.invalidateQueries({ queryKey: ["product-videos-waiting"] });
    },
    onError: (e: Error) => toast.error(e.message || "ثبت مرحله ناموفق بود"),
  });

  const handleUpload = useCallback(
    async (row: WaitingRow, files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      setBusy(row.chain_id);
      setProgress((p) => ({ ...p, [row.chain_id]: 0 }));
      try {
        const ext = file.name.split(".").pop() || "mp4";
        const path = `product-videos/${row.quote_id}/${row.chain_id}.${ext}`;
        await uploadWithProgress({
          bucket: BUCKET,
          path,
          file,
          contentType: file.type || "video/mp4",
          upsert: true,
          onProgress: (p) => setProgress((prev) => ({ ...prev, [row.chain_id]: p.percent })),
        });

        // The database decides what this means. The upload only puts bytes in a bucket.
        const { error } = await supabase.rpc("product_video_mark_uploaded", {
          _chain_id: row.chain_id,
          _storage_path: path,
          _file_name: file.name,
          _file_size: file.size,
          _mime_type: file.type || "video/mp4",
        });
        if (error) throw error;

        toast.success("ویدئو بارگذاری شد و به فروشنده اطلاع داده شد.");
        qc.invalidateQueries({ queryKey: ["product-videos-waiting"] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "بارگذاری ویدئو ناموفق بود");
      } finally {
        setBusy(null);
        setProgress((p) => {
          const next = { ...p };
          delete next[row.chain_id];
          return next;
        });
      }
    },
    [qc],
  );

  return (
    <div className="space-y-5 p-4 md:p-6" dir="rtl">
      <PageHeader
        title="ویدئوی محصول"
        description="کالاهایی که باید برایشان ویدئو ضبط و برای مشتری ارسال شود"
      />

      <Card>
        <CardContent className="p-4 text-sm">
          <span>
            <strong>{toFaDigits(String(sold.length))}</strong> کالای فروخته‌شده در انتظار ویدئو، از{" "}
            <strong>{toFaDigits(String(rows.length))}</strong> مورد باز.
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>پیش‌فاکتور</TableHead>
                  <TableHead>مشتری</TableHead>
                  <TableHead>کالا</TableHead>
                  <TableHead>تاریخ</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>اقدام</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waiting.isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    </TableCell>
                  </TableRow>
                )}
                {!waiting.isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      هیچ کالایی در انتظار ویدئو نیست.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.chain_id}>
                    <TableCell className="font-medium">{r.quote_number ?? "—"}</TableCell>
                    <TableCell>{r.customer_name ?? "—"}</TableCell>
                    <TableCell>{r.product_name ?? "—"}</TableCell>
                    <TableCell>{isoToJalaliDisplay(r.created_at.slice(0, 10))}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={r.accepted ? "default" : "secondary"}>
                          {STAGE_LABEL[r.stage] ?? r.stage}
                        </Badge>
                        {!r.accepted && (
                          <span className="text-xs text-muted-foreground">هنوز فروخته نشده</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {/* Only the action whose turn it is. The trigger in 296 is the authority;
                          rendering a control it would refuse teaches distrust of the page. */}
                      {r.stage === "required" && (
                        <span className="text-xs text-muted-foreground">
                          پس از قطعی‌شدن پیش‌فاکتور، کار ضبط ساخته می‌شود
                        </span>
                      )}
                      {r.stage === "task_created" && canAct && (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <CameraCaptureButton
                              accept={VIDEO_ACCEPT}
                              label="ضبط ویدئو"
                              // Videos must NOT go through the image pipeline.
                              optimize={false}
                              disabled={busy === r.chain_id}
                              onFiles={(f) => handleUpload(r, f)}
                              testId={`video-capture-${r.chain_id}`}
                            />
                            <label className="inline-flex">
                              <input
                                type="file"
                                accept={VIDEO_ACCEPT}
                                className="hidden"
                                disabled={busy === r.chain_id}
                                onChange={(e) => handleUpload(r, e.target.files)}
                              />
                              <Button size="sm" variant="outline" asChild>
                                <span>
                                  <Upload className="ml-1 h-3.5 w-3.5" /> بارگذاری فایل
                                </span>
                              </Button>
                            </label>
                          </div>
                          {busy === r.chain_id && (
                            <Progress value={progress[r.chain_id] ?? 0} className="h-1.5" />
                          )}
                        </div>
                      )}
                      {r.stage === "salesperson_notified" && canAct && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={advance.isPending}
                          onClick={() =>
                            advance.mutate({ chainId: r.chain_id, to: "sent_to_customer" })
                          }
                        >
                          <Send className="ml-1 h-3.5 w-3.5" /> ارسال شد برای مشتری
                        </Button>
                      )}
                      {r.stage === "sent_to_customer" && canAct && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={advance.isPending}
                          onClick={() =>
                            advance.mutate({ chainId: r.chain_id, to: "confirmed_sent" })
                          }
                        >
                          <CheckCircle2 className="ml-1 h-3.5 w-3.5" /> تأیید ارسال
                        </Button>
                      )}
                      {r.stage === "video_uploaded" && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Video className="h-3.5 w-3.5" /> در حال اطلاع‌رسانی
                        </span>
                      )}
                      {!canAct && r.stage !== "required" && (
                        <span className="text-xs text-muted-foreground">فقط مشاهده</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
