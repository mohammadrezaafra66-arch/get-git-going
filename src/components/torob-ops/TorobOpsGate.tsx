import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  clearTorobOpsSessionToken,
  getTorobOpsSessionToken,
  setTorobOpsSessionToken,
} from "@/lib/torob-ops/client-session";
import { torobOpsLock, torobOpsUnlock } from "@/lib/torob-ops/functions";

export function TorobOpsGate({ children }: { children: ReactNode }) {
  const unlockFn = useServerFn(torobOpsUnlock);
  const lockFn = useServerFn(torobOpsLock);
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUnlocked(Boolean(getTorobOpsSessionToken()));
    setReady(true);
  }, []);

  async function onUnlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await unlockFn({ data: { password } });
      setTorobOpsSessionToken(res.sessionToken);
      setUnlocked(true);
      setPassword("");
      toast.success("ورود به ماژول ترب انجام شد.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ورود ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  async function onLock() {
    const token = getTorobOpsSessionToken();
    if (!token) {
      clearTorobOpsSessionToken();
      setUnlocked(false);
      return;
    }
    setBusy(true);
    try {
      await lockFn({ data: { opsSession: token } });
    } catch {
      /* still clear locally */
    } finally {
      clearTorobOpsSessionToken();
      setUnlocked(false);
      setBusy(false);
      toast.message("خروج از ماژول ترب.");
    }
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground" dir="rtl">
        <Loader2 className="h-5 w-5 animate-spin" />
        در حال آماده‌سازی…
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="mx-auto max-w-md p-4" dir="rtl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lock className="h-5 w-5" />
              ورود به عملیات ترب
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              این بخش رمز جدا از ورود دستیار دارد. رمز را از مدیر کل بگیرید. با بستن این تب، نشست
              ماژول پاک می‌شود.
            </p>
            <form className="space-y-4" onSubmit={onUnlock}>
              <div className="space-y-2">
                <Label htmlFor="torob-ops-password">رمز ماژول</Label>
                <Input
                  id="torob-ops-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy || !password}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "ورود"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div dir="rtl">
      <div className="mb-3 flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onLock} disabled={busy}>
          قفل مجدد ماژول
        </Button>
      </div>
      {children}
    </div>
  );
}
