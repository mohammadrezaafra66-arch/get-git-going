import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import moment from "moment-jalaali";
import { ClockInOutButton } from "@/components/attendance/ClockInOutButton";

let momentLoaded = false;
function todayJalali(): string {
  if (!momentLoaded) {
    moment.loadPersian({ usePersianDigits: true, dialect: "persian-modern" });
    momentLoaded = true;
  }
  return moment().format("dddd jD jMMMM jYYYY");
}

export function DashboardHeader() {
  const { user } = useAuth();
  const [online, setOnline] = useState<boolean>(true);

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email ||
    "همکار گرامی";

  useEffect(() => {
    let alive = true;
    const ch = supabase.channel("dashboard-presence");
    ch.subscribe((status) => {
      if (!alive) return;
      setOnline(status === "SUBSCRIBED");
    });
    const onOff = () => alive && setOnline(false);
    const onOn = () => alive && setOnline(true);
    window.addEventListener("offline", onOff);
    window.addEventListener("online", onOn);
    return () => {
      alive = false;
      window.removeEventListener("offline", onOff);
      window.removeEventListener("online", onOn);
      supabase.removeChannel(ch);
    };
  }, []);

  return (
    <div dir="rtl" className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-foreground md:text-2xl">
          سلام، {displayName} 👋
        </h1>
        <p className="mt-1 text-xs text-muted-foreground md:text-sm">{todayJalali()}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ClockInOutButton />
        <div
          className={`flex items-center gap-2 rounded-full px-3 py-1 text-[11px] ${
            online
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}
          />
          {online ? "اتصال زنده برقرار است" : "اتصال زنده قطع است"}
        </div>
      </div>
    </div>
  );
}