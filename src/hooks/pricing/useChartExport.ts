import { useState, useCallback } from "react";

import { toast } from "sonner";

interface UseChartExportOptions {
  filename?: string;
  backgroundColor?: string;
  scale?: number;
}

interface UseChartExportReturn {
  isCapturing: boolean;
  downloadPng: (element: HTMLElement | null) => Promise<void>;
  copyToClipboard: (element: HTMLElement | null) => Promise<void>;
}

export function useChartExport(options?: UseChartExportOptions): UseChartExportReturn {
  const [isCapturing, setIsCapturing] = useState(false);

  const captureCanvas = useCallback(
    async (element: HTMLElement): Promise<HTMLCanvasElement> => {
      const html2canvas = (await import("html2canvas")).default;
      return html2canvas(element, {
        scale: options?.scale ?? 2,
        backgroundColor: options?.backgroundColor ?? "#ffffff",
        useCORS: true,
        logging: false,
      });
    },
    [options?.scale, options?.backgroundColor],
  );

  const downloadPng = useCallback(
    async (element: HTMLElement | null): Promise<void> => {
      if (!element) return;
      setIsCapturing(true);
      try {
        const canvas = await captureCanvas(element);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        if (!blob) throw new Error("blob_null");
        const filename = `${options?.filename ?? "chart"}-${new Date().toISOString().slice(0, 10)}.png`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 1000);
        toast.success("نمودار دانلود شد");
      } catch {
        toast.error("خطا در ذخیره نمودار");
      } finally {
        setIsCapturing(false);
      }
    },
    [captureCanvas, options?.filename],
  );

  const copyToClipboard = useCallback(
    async (element: HTMLElement | null): Promise<void> => {
      if (!element) return;
      setIsCapturing(true);
      try {
        const canvas = await captureCanvas(element);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        if (!blob) throw new Error("blob_null");
        if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
          throw new Error("clipboard_unsupported");
        }
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast.success("تصویر کپی شد — می‌توانید در واتساپ یا تلگرام Paste کنید");
      } catch (err) {
        const isUnsupported =
          err instanceof Error &&
          (err.message === "clipboard_unsupported" || err.message === "blob_null");
        if (isUnsupported) {
          toast.info("مرورگر شما کپی مستقیم را پشتیبانی نمی‌کند — فایل دانلود شد");
        } else {
          toast.info("مرورگر شما کپی مستقیم را پشتیبانی نمی‌کند — فایل دانلود شد");
        }
        await downloadPng(element);
      } finally {
        setIsCapturing(false);
      }
    },
    [captureCanvas, downloadPng],
  );

  return { isCapturing, downloadPng, copyToClipboard };
}