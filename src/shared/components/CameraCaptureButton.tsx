import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { prepareCameraImages, toFileList } from "@/lib/images/prepare-image";

interface Props {
  /** Same accept string as the sibling gallery input. */
  accept: string;
  onFiles: (files: FileList | null) => void;
  disabled?: boolean;
  multiple?: boolean;
  label?: string;
  /** "environment" = rear camera (documents, receipts, products). */
  facing?: "environment" | "user";
  className?: string;
  testId?: string;
  /**
   * Compress and de-rotate captured photos before handing them on
   * (Phase 8.4). On by default: every caller of this button is capturing a
   * phone photo, which is exactly the case that needs it. Set false only where
   * the original bytes must be preserved.
   */
  optimize?: boolean;
}

/**
 * A camera button that sits NEXT TO an existing file input, never replacing it.
 *
 * `capture` makes the browser open the camera directly, which on iOS Safari and
 * Android Chrome removes the gallery option — so putting it on the main input
 * would trade one capability for another rather than adding one. Owner decision
 * 27 asks for capture AND upload, hence two entry points.
 *
 * Desktop browsers ignore `capture` and fall back to a normal file picker, so
 * this degrades harmlessly.
 */
export function CameraCaptureButton({
  accept,
  onFiles,
  disabled,
  multiple = false,
  label = "دوربین",
  facing = "environment",
  className,
  testId,
  optimize = true,
}: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);

  const handleChange = async (input: HTMLInputElement) => {
    const selected = input.files;
    // Reset immediately so the same shot can be retaken after a failed upload,
    // and so re-selecting the identical file still fires `change`.
    input.value = "";

    if (!selected || selected.length === 0) {
      onFiles(selected);
      return;
    }

    if (!optimize) {
      onFiles(selected);
      return;
    }

    setPreparing(true);
    try {
      const results = await prepareCameraImages(Array.from(selected));
      // prepareCameraImage never throws — a file it could not process comes
      // back as the original, so this list is always complete.
      onFiles(toFileList(results.map((r) => r.file)));
    } finally {
      setPreparing(false);
    }
  };

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        capture={facing}
        multiple={multiple}
        className="hidden"
        data-testid={testId ? `${testId}-input` : undefined}
        onChange={(e) => {
          void handleChange(e.currentTarget);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || preparing}
        data-testid={testId}
        className={cn("gap-1", className)}
        onClick={(e) => {
          // The parent drop zones open the gallery input on click; without this
          // a tap on the camera button would open both pickers.
          e.stopPropagation();
          ref.current?.click();
        }}
      >
        {preparing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> در حال آماده‌سازی…
          </>
        ) : (
          <>
            <Camera className="h-4 w-4" /> {label}
          </>
        )}
      </Button>
    </>
  );
}
