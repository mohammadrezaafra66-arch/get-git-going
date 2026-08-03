import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "نصب برنامه" button — Phase 8.3 (D8-7).
 *
 * Renders NOTHING unless the browser has actually offered an install, which it
 * signals by firing `beforeinstallprompt`. Over plain http (the LAN deployment
 * today) that event never fires, so there is no button to be broken and no
 * console noise — exactly what requirement 8.3 asks for. When the owner puts
 * the app behind the internal HTTPS domain the button appears on its own, with
 * no code change.
 *
 * Safari/iOS never fires this event at all; installation there is "Add to Home
 * Screen" from the share sheet. That is documented for the owner in
 * docs/deployment/https-readiness.md rather than faked with a custom dialog.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      // Suppress Chrome's own mini-infobar so the app decides where the
      // affordance lives, then keep the event to replay on click.
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => setPromptEvent(null);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!promptEvent) return null;

  const handleClick = async () => {
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } catch {
      /* the user dismissed it, or the event already went stale */
    } finally {
      // A prompt event can only be used once, whatever the outcome.
      setPromptEvent(null);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      className="gap-2"
      title="نصب برنامه روی دستگاه"
    >
      <Download className="h-4 w-4" />
      <span className="hidden sm:inline">نصب برنامه</span>
    </Button>
  );
}
