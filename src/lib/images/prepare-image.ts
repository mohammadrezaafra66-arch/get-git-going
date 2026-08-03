/**
 * Camera image preparation — Phase 8.4 (D8-7), gaps 1 and 2 of P0 item 4.
 *
 * A purchasing officer photographing a receipt on a phone produces a 3–8 MB,
 * 12-megapixel JPEG that is very often rotated 90°, because phones record
 * orientation in EXIF rather than rotating the pixels. Over a weak connection
 * that is a slow upload of an unreadable document.
 *
 * This module fixes both before the file ever reaches the uploader:
 *   - re-encodes to at most MAX_EDGE px on the long side, JPEG quality 0.82
 *   - bakes EXIF orientation into the pixels, so the stored file is upright
 *     everywhere (PDF export, print, thumbnails) and not just in viewers that
 *     happen to honour EXIF
 *
 * Deliberately NOT a dependency: `createImageBitmap` + canvas are built into
 * every browser this app targets, and self-host rule 2 discourages adding
 * libraries that solve what the platform already solves.
 */

/** Long-edge cap. A4 at ~200dpi is ~1650px, so 1600 keeps receipts readable. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;
/** Below this, re-encoding usually makes the file BIGGER. Leave it alone. */
const SKIP_BELOW_BYTES = 300 * 1024;

export interface PrepareResult {
  file: File;
  /** False when the original was returned untouched, with `reason` saying why. */
  changed: boolean;
  reason?: string;
  originalBytes: number;
  finalBytes: number;
}

function isProcessableImage(file: File): boolean {
  // HEIC/HEIF are excluded on purpose: canvas cannot decode them in most
  // browsers, so we would silently produce a blank image. iOS converts to JPEG
  // on upload from the camera input anyway.
  return /^image\/(jpeg|png|webp)$/i.test(file.type);
}

/**
 * Decode with EXIF orientation applied.
 *
 * `imageOrientation: "from-image"` is the whole point — it is what rotates the
 * pixels. Where it is unsupported the browser throws or ignores the option, so
 * we fall back to a plain <img> decode and accept that the rotation stays in
 * EXIF rather than guessing at it. Guessing wrong would rotate an already
 * upright photo, which is worse than leaving it.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall through */
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image decode failed"));
    };
    img.src = url;
  });
}

function targetSize(width: number, height: number) {
  const longest = Math.max(width, height);
  if (longest <= MAX_EDGE) return { width, height, resized: false };
  const scale = MAX_EDGE / longest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    resized: true,
  };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
}

/** Swap the extension so the stored name matches the JPEG we actually produced. */
function jpegName(original: string): string {
  const base = original.replace(/\.[^./\\]+$/, "");
  return `${base || "photo"}.jpg`;
}

/**
 * Never throws. Any failure returns the original file with a reason — a photo
 * that uploads un-compressed is a far better outcome than a form that breaks
 * because a canvas call failed on some device.
 */
export async function prepareCameraImage(file: File): Promise<PrepareResult> {
  const originalBytes = file.size;
  const unchanged = (reason: string): PrepareResult => ({
    file,
    changed: false,
    reason,
    originalBytes,
    finalBytes: originalBytes,
  });

  if (typeof document === "undefined") return unchanged("not in a browser");
  if (!isProcessableImage(file)) return unchanged(`unsupported type: ${file.type || "unknown"}`);
  if (file.size < SKIP_BELOW_BYTES) return unchanged("already small");

  try {
    const source = await decode(file);
    const width = "width" in source ? source.width : 0;
    const height = "height" in source ? source.height : 0;
    if (!width || !height) {
      if ("close" in source) source.close();
      return unchanged("zero dimensions");
    }

    const size = targetSize(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      if ("close" in source) source.close();
      return unchanged("no 2d context");
    }
    ctx.drawImage(source as CanvasImageSource, 0, 0, size.width, size.height);
    if ("close" in source) source.close();

    const blob = await canvasToBlob(canvas);
    if (!blob) return unchanged("canvas encode failed");

    // Re-encoding can enlarge an already-optimised JPEG. If nothing was
    // resized and the result is not smaller, keep the original — except when
    // the decode rotated it, which we cannot detect here, so we only apply this
    // guard when no resize happened AND the gain is negative.
    if (!size.resized && blob.size >= originalBytes) {
      return unchanged("re-encode would not shrink it");
    }

    return {
      file: new File([blob], jpegName(file.name), {
        type: "image/jpeg",
        lastModified: file.lastModified,
      }),
      changed: true,
      originalBytes,
      finalBytes: blob.size,
    };
  } catch (error) {
    return unchanged(error instanceof Error ? error.message : "unknown failure");
  }
}

/** Prepare a whole selection, preserving order. */
export async function prepareCameraImages(files: File[]): Promise<PrepareResult[]> {
  const out: PrepareResult[] = [];
  // Sequential on purpose: decoding several 12MP images at once is a reliable
  // way to make a mid-range phone drop the tab.
  for (const file of files) out.push(await prepareCameraImage(file));
  return out;
}

/**
 * Rebuild a FileList so the prepared files can be handed to the existing
 * `onFiles(FileList | null)` callbacks without changing their signatures.
 */
export function toFileList(files: File[]): FileList {
  const dt = new DataTransfer();
  for (const file of files) dt.items.add(file);
  return dt.files;
}
