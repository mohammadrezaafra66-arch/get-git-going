import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Trash2, ImageIcon, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { safeRandomUUID } from "@/lib/utils/safe-uuid";
import { CameraCaptureButton } from "@/shared/components/CameraCaptureButton";

interface ProductImageRow {
  id: string;
  path: string;
  is_primary: boolean;
  sort_order: number;
  signedUrl: string | null;
}

const BUCKET = "product-images";
const SIGNED_TTL = 3600;
/** حداکثر تعداد تصویر برای هر محصول. */
const MAX_IMAGES = 15;

interface Props {
  productId: string | null | undefined;
}

/**
 * مدیریت تصاویر محصول: نمایش تصاویر فعلی، آپلود تصویر جدید و حذف تصویر.
 * فقط در حالت ویرایش (وقتی productId وجود دارد) فعال است.
 */
export function ProductImagesSection({ productId }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const imagesQ = useQuery({
    enabled: !!productId,
    queryKey: ["product-images", productId],
    queryFn: async (): Promise<ProductImageRow[]> => {
      const { data, error } = await supabase
        .from("product_images")
        .select("id, url, is_primary, sort_order")
        .eq("product_id", productId as string)
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []).map((r: any) => ({
        id: r.id as string,
        path: r.url as string,
        is_primary: !!r.is_primary,
        sort_order: Number(r.sort_order ?? 0),
        signedUrl: null as string | null,
      }));
      if (rows.length === 0) return rows;
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(
        rows.map((r) => r.path),
        SIGNED_TTL,
      );
      const byPath = new Map<string, string>();
      (signed ?? []).forEach((s: any) => {
        if (s.path && s.signedUrl) byPath.set(s.path, s.signedUrl);
      });
      return rows.map((r) => ({ ...r, signedUrl: byPath.get(r.path) ?? null }));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (img: ProductImageRow) => {
      // ترتیب مهم است: اول فایل از storage حذف شود، بعد ردیف دیتابیس.
      // قبلاً خطای remove نادیده گرفته می‌شد؛ نتیجه‌اش ۱۳ فایل یتیم بود که
      // ردیف متناظری نداشتند و از UI هم دیگر قابل حذف نبودند. حالا اگر حذف از
      // storage شکست بخورد، ردیف دیتابیس دست‌نخورده می‌ماند تا داده و فایل
      // همگام بمانند و کاربر بتواند دوباره تلاش کند.
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([img.path]);
      if (rmErr) throw rmErr;
      const { error } = await supabase.from("product_images").delete().eq("id", img.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تصویر حذف شد");
      queryClient.invalidateQueries({ queryKey: ["product-images", productId] });
      if (productId) queryClient.invalidateQueries({ queryKey: ["product-thumbnails"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در حذف تصویر"),
  });

  // تعیین تصویر اصلی از طریق RPC تا «پایین آوردن بقیه» و «بالا بردن این یکی»
  // اتمیک انجام شود؛ در غیر این صورت ایندکس یکتای
  // product_images_one_primary_per_product می‌توانست وسط کار رد کند.
  const setPrimaryMutation = useMutation({
    mutationFn: async (img: ProductImageRow) => {
      const { error } = await supabase.rpc("set_primary_product_image", {
        p_image_id: img.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تصویر اصلی تعیین شد");
      queryClient.invalidateQueries({ queryKey: ["product-images", productId] });
      queryClient.invalidateQueries({ queryKey: ["product-thumbnails"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در تعیین تصویر اصلی"),
  });

  const handleFile = async (file: File) => {
    if (!productId) return;
    if ((imagesQ.data ?? []).length >= MAX_IMAGES) {
      toast.error(`حداکثر ${MAX_IMAGES} تصویر برای هر محصول مجاز است`);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("حجم فایل باید کمتر از ۵ مگابایت باشد");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${productId}/${safeRandomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const existing = imagesQ.data ?? [];
      const isFirst = existing.length === 0;
      const nextOrder = existing.length ? Math.max(...existing.map((r) => r.sort_order)) + 1 : 0;
      const { error: insErr } = await supabase.from("product_images").insert({
        product_id: productId,
        url: path,
        sort_order: nextOrder,
        is_primary: isFirst,
      });
      if (insErr) throw insErr;
      toast.success("تصویر بارگذاری شد");
      queryClient.invalidateQueries({ queryKey: ["product-images", productId] });
      queryClient.invalidateQueries({ queryKey: ["product-thumbnails"] });
    } catch (e: any) {
      toast.error(e?.message ?? "خطا در بارگذاری");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!productId) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        پس از ذخیره محصول، امکان بارگذاری تصاویر فراهم می‌شود.
      </div>
    );
  }

  const rows = imagesQ.data ?? [];
  const atLimit = rows.length >= MAX_IMAGES;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">
          تصاویر محصول
          <span className="ms-2 text-xs font-normal text-muted-foreground">
            {rows.length} از {MAX_IMAGES}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || atLimit}
          title={atLimit ? `حداکثر ${MAX_IMAGES} تصویر برای هر محصول مجاز است` : undefined}
        >
          {uploading ? (
            <Loader2 className="ms-1 h-4 w-4 animate-spin" />
          ) : (
            <ImagePlus className="ms-1 h-4 w-4" />
          )}
          افزودن تصویر
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <CameraCaptureButton
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading || atLimit}
          onFiles={(files) => {
            const f = files?.[0];
            if (f) void handleFile(f);
          }}
          testId="product-image-camera"
        />
      </div>
      {imagesQ.isLoading ? (
        <div className="text-xs text-muted-foreground">در حال بارگذاری تصاویر...</div>
      ) : rows.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ImageIcon className="h-4 w-4" />
          هنوز تصویری ثبت نشده است.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {rows.map((img) => (
            <div
              key={img.id}
              className="relative h-16 w-16 overflow-hidden rounded-md border border-border bg-muted"
            >
              {img.signedUrl ? (
                <img
                  src={img.signedUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <ImageIcon className="h-5 w-5" />
                </div>
              )}
              <button
                type="button"
                aria-label="حذف تصویر"
                onClick={() => deleteMutation.mutate(img)}
                disabled={deleteMutation.isPending}
                className="absolute top-0.5 left-0.5 rounded-md bg-destructive/90 p-1 text-destructive-foreground opacity-0 transition group-hover:opacity-100 hover:bg-destructive"
                style={{ opacity: 1 }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
              {!img.is_primary && (
                <button
                  type="button"
                  aria-label="تعیین به‌عنوان تصویر اصلی"
                  title="تعیین به‌عنوان تصویر اصلی"
                  onClick={() => setPrimaryMutation.mutate(img)}
                  disabled={setPrimaryMutation.isPending || deleteMutation.isPending}
                  className="absolute top-0.5 right-0.5 rounded-md bg-background/90 p-1 text-muted-foreground transition hover:bg-primary hover:text-primary-foreground"
                >
                  <Star className="h-3 w-3" />
                </button>
              )}
              {img.is_primary && (
                <span className="absolute bottom-0 left-0 right-0 bg-primary/80 px-1 text-center text-[9px] text-primary-foreground">
                  اصلی
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
