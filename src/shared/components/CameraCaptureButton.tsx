import { useRef } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
}: Props) {
  const ref = useRef<HTMLInputElement>(null);

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
          onFiles(e.target.files);
          // Let the same shot be retaken after a failed upload.
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        data-testid={testId}
        className={cn("gap-1", className)}
        onClick={(e) => {
          // The parent drop zones open the gallery input on click; without this
          // a tap on the camera button would open both pickers.
          e.stopPropagation();
          ref.current?.click();
        }}
      >
        <Camera className="h-4 w-4" /> {label}
      </Button>
    </>
  );
}
