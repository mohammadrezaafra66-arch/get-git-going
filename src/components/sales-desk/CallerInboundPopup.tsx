import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PhoneIncoming, PhoneOutgoing, UserRound, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuickAddCustomerDialog } from "@/shared/components/QuickAddCustomerDialog";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  CALLER_ID_SETTINGS_QUERY_KEY,
  DEFAULT_CALLER_ID_SETTINGS,
  fetchCallerIdSettings,
} from "@/lib/calls/caller-id-settings";
import { filterCallsForCallerId } from "@/lib/calls/filter-calls-for-caller-id";
import {
  fetchRecentInboundForPopup,
  fetchRecentRingEventsForPopup,
  listExtensionsForUser,
  type RecentInboundCall,
} from "@/lib/sales-desk";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTimeFa, toFaDigits } from "@/lib/i18n/formatters";
import { CallNoteForm } from "./CallNoteForm";
import { QuickRequestForm } from "./QuickRequestForm";

const RING_POLL_MS = 1_000;
const CDR_POLL_MS = 5_000;
const CARD_TTL_MS = 5_000;
const MAX_CARDS = 4;

type CallContext = {
  call: RecentInboundCall;
  displayName: string;
  responsibleName: string | null;
  personId: string | null;
  customerId: string | null;
  phoneHint: string | null;
  isUnknown: boolean;
  isOutbound: boolean;
};

type ToastCard = {
  key: string;
  call: RecentInboundCall;
  displayName: string;
  phoneHint: string | null;
  isUnknown: boolean;
  isOutbound: boolean;
  expiresAt: number;
};

async function resolveCallContext(call: RecentInboundCall): Promise<CallContext> {
  const meta = call.metadata ?? {};
  const phoneHint =
    (typeof meta.raw_number === "string" && meta.raw_number) ||
    (typeof meta.stripped_number === "string" && meta.stripped_number) ||
    null;
  const unknownFlag = meta.unknown_number === true;
  const isOutbound = call.direction === "outbound";
  const linkedPersonId = call.customer_id;

  if (!linkedPersonId) {
    return {
      call,
      displayName: phoneHint ? toFaDigits(phoneHint) : "شماره ناشناس",
      responsibleName: null,
      personId: null,
      customerId: null,
      phoneHint,
      isUnknown: true,
      isOutbound,
    };
  }

  const [{ data: person }, { data: customers }] = await Promise.all([
    supabase
      .from("persons")
      .select("id, display_name")
      .eq("id", linkedPersonId)
      .maybeSingle(),
    supabase
      .from("customers")
      .select(
        "id, name, responsible_id, responsible:profiles!customers_responsible_id_fkey(id, full_name)",
      )
      .eq("person_id", linkedPersonId)
      .limit(5),
  ]);

  const firstCustomer = (customers ?? [])[0] as
    | {
        id: string;
        name: string | null;
        responsible: { full_name: string | null } | null;
      }
    | undefined;

  return {
    call,
    displayName:
      person?.display_name ||
      firstCustomer?.name ||
      (phoneHint ? toFaDigits(phoneHint) : "تماس‌گیرنده"),
    responsibleName: firstCustomer?.responsible?.full_name ?? null,
    personId: person?.id ?? linkedPersonId,
    customerId: firstCustomer?.id ?? null,
    phoneHint,
    isUnknown: unknownFlag || !person,
    isOutbound,
  };
}

/**
 * Caller ID: compact cards bottom-right; click opens full form sheet.
 */
export function CallerInboundPopup() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const shownRef = useRef<Set<string>>(new Set());
  const mountAtMsRef = useRef(Date.now());
  const primedRef = useRef(false);
  const [cards, setCards] = useState<ToastCard[]>([]);
  const [active, setActive] = useState<CallContext | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const settingsQ = useQuery({
    enabled: !!userId,
    queryKey: [...CALLER_ID_SETTINGS_QUERY_KEY, userId],
    queryFn: () => fetchCallerIdSettings(userId!),
    staleTime: 30_000,
  });

  const settings = settingsQ.data ?? DEFAULT_CALLER_ID_SETTINGS;
  const pollingOn = !!userId && settings.enabled;

  const extensionsQ = useQuery({
    enabled: pollingOn,
    queryKey: ["sales-desk", "my-extensions", userId],
    queryFn: () => listExtensionsForUser(userId!),
    staleTime: 60_000,
  });

  const ringQ = useQuery({
    enabled: pollingOn,
    queryKey: ["sales-desk", "ring-popup", userId],
    queryFn: () => fetchRecentRingEventsForPopup({ userId }),
    refetchInterval: RING_POLL_MS,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const inboundQ = useQuery({
    enabled: pollingOn,
    queryKey: ["sales-desk", "inbound-popup", userId],
    queryFn: () => fetchRecentInboundForPopup({ userId }),
    refetchInterval: CDR_POLL_MS,
    staleTime: CDR_POLL_MS,
    refetchOnWindowFocus: true,
  });

  // Expire cards every second
  useEffect(() => {
    const t = window.setInterval(() => {
      const now = Date.now();
      setCards((prev) => prev.filter((c) => c.expiresAt > now));
    }, 400);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!pollingOn) return;
    const ringRows = ringQ.data ?? [];
    const cdrRows = inboundQ.data ?? [];
    if (ringQ.isLoading && inboundQ.isLoading) return;
    if (ringQ.data === undefined && inboundQ.data === undefined) return;

    const myExts = extensionsQ.data ?? [];
    const filtered = filterCallsForCallerId(
      [...ringRows, ...cdrRows],
      settings,
      myExts,
    );

    const mountAt = mountAtMsRef.current;

    if (!primedRef.current) {
      for (const call of filtered) {
        const createdMs = Date.parse(call.created_at ?? call.started_at ?? "") || 0;
        if (createdMs > 0 && createdMs < mountAt - 500) {
          shownRef.current.add(call.id);
        }
      }
      primedRef.current = true;
    }

    let cancelled = false;

    (async () => {
      for (const call of filtered) {
        if (shownRef.current.has(call.id)) continue;

        const createdMs = Date.parse(call.created_at ?? call.started_at ?? "") || 0;
        if (createdMs > 0 && createdMs < mountAt - 500) {
          shownRef.current.add(call.id);
          continue;
        }

        shownRef.current.add(call.id);
        try {
          const ctx = await resolveCallContext(call);
          if (cancelled) return;

          const card: ToastCard = {
            key: call.id,
            call,
            displayName: ctx.displayName,
            phoneHint: ctx.phoneHint,
            isUnknown: ctx.isUnknown,
            isOutbound: ctx.isOutbound,
            expiresAt: Date.now() + CARD_TTL_MS,
          };

          setCards((prev) => {
            const without = prev.filter((c) => c.key !== card.key);
            // Newer at bottom: append; drop oldest from top if > MAX
            const next = [...without, card];
            while (next.length > MAX_CARDS) next.shift();
            return next;
          });
        } catch {
          /* marked shown */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    pollingOn,
    settings,
    extensionsQ.data,
    ringQ.data,
    ringQ.isLoading,
    inboundQ.data,
    inboundQ.isLoading,
  ]);

  const dismissCard = (key: string) => {
    setCards((prev) => prev.filter((c) => c.key !== key));
  };

  const openCard = async (card: ToastCard) => {
    dismissCard(card.key);
    try {
      const ctx = await resolveCallContext(card.call);
      setActive(ctx);
      setPanelOpen(true);
    } catch {
      /* ignore */
    }
  };

  const TitleIcon = active?.isOutbound ? PhoneOutgoing : PhoneIncoming;

  return (
    <>
      {cards.length > 0 ? (
        <div
          className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2"
          dir="rtl"
        >
          {cards.map((card) => {
            const Icon = card.isOutbound ? PhoneOutgoing : PhoneIncoming;
            return (
              <div
                key={card.key}
                className="pointer-events-auto flex items-start gap-2 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/90"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 space-y-0.5 text-right"
                  onClick={() => void openCard(card)}
                >
                  <div className="flex items-center justify-end gap-1.5 text-xs font-medium text-muted-foreground">
                    <span>{card.isOutbound ? "تماس خروجی" : "تماس ورودی"}</span>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                  </div>
                  <p className="truncate text-sm font-semibold text-foreground">
                    {card.displayName}
                    {card.isUnknown ? (
                      <span className="mr-1 text-xs font-normal text-amber-700 dark:text-amber-400">
                        (ناشناس)
                      </span>
                    ) : null}
                  </p>
                  {card.phoneHint ? (
                    <p className="text-xs text-muted-foreground" dir="ltr">
                      {toFaDigits(card.phoneHint)}
                    </p>
                  ) : null}
                </button>
                <button
                  type="button"
                  aria-label="بستن"
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissCard(card.key);
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent
          side="left"
          dir="rtl"
          className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-md"
        >
          <SheetHeader className="space-y-2 text-right">
            <SheetTitle className="flex items-center gap-2 text-right">
              <TitleIcon className="h-5 w-5 shrink-0" />
              {active?.isOutbound ? "تماس خروجی" : "تماس ورودی"}
            </SheetTitle>
            <SheetDescription asChild>
              <div className="space-y-1 text-right">
                {active ? (
                  <>
                    <p className="text-base font-medium text-foreground">
                      {active.displayName}
                      {active.isUnknown ? (
                        <span className="mr-2 text-xs text-amber-700 dark:text-amber-400">
                          (ناشناس)
                        </span>
                      ) : null}
                    </p>
                    {active.responsibleName ? (
                      <p className="flex items-center justify-end gap-1 text-xs">
                        <UserRound className="h-3 w-3" />
                        مسئول: {active.responsibleName}
                      </p>
                    ) : null}
                    {active.phoneHint ? (
                      <p className="text-xs">
                        شماره:{" "}
                        <span dir="ltr" className="inline-block tabular-nums">
                          {toFaDigits(active.phoneHint)}
                        </span>
                      </p>
                    ) : null}
                    {active.call.started_at ? (
                      <p className="text-xs text-muted-foreground">
                        زمان تماس: {formatDateTimeFa(active.call.started_at)}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p>تماس جدید</p>
                )}
              </div>
            </SheetDescription>
          </SheetHeader>

          {active ? (
            <div className="space-y-4 pb-6">
              <div className="flex flex-wrap gap-2">
                <QuickAddCustomerDialog
                  buttonLabel="ثبت شخص"
                  buttonSize="sm"
                  onCreated={(c) => {
                    void (async () => {
                      const { data } = await supabase
                        .from("customers")
                        .select("id, person_id, name")
                        .eq("id", c.id)
                        .maybeSingle();
                      setActive((prev) =>
                        prev
                          ? {
                              ...prev,
                              customerId: data?.id ?? c.id,
                              personId: data?.person_id ?? prev.personId,
                              displayName: data?.name ?? c.name,
                              isUnknown: false,
                            }
                          : prev,
                      );
                    })();
                  }}
                />
                {active.customerId ? (
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to="/sales/customers/$customerId/dossier"
                      params={{ customerId: active.customerId }}
                    >
                      پرونده مشتری
                    </Link>
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1"
                  onClick={() => setPanelOpen(false)}
                >
                  <X className="h-3.5 w-3.5" />
                  بستن
                </Button>
              </div>

              {active.personId ? (
                <Tabs defaultValue="request">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="request">ثبت درخواست</TabsTrigger>
                    <TabsTrigger value="note">خلاصه تماس</TabsTrigger>
                  </TabsList>
                  <TabsContent value="request" className="mt-3">
                    <QuickRequestForm
                      compact
                      initialPersonId={active.personId}
                      initialPersonName={active.displayName}
                      customerId={active.customerId}
                      callLogId={
                        active.call.id.startsWith("ring:")
                          ? undefined
                          : active.call.id
                      }
                      onCreated={() => setPanelOpen(false)}
                    />
                  </TabsContent>
                  <TabsContent value="note" className="mt-3">
                    <CallNoteForm
                      compact
                      personId={active.personId}
                      personName={active.displayName}
                      customerId={active.customerId}
                      callLogId={
                        active.call.id.startsWith("ring:")
                          ? undefined
                          : active.call.id
                      }
                      defaultKind="call"
                      onCreated={() => setPanelOpen(false)}
                    />
                  </TabsContent>
                </Tabs>
              ) : (
                <p className="text-sm text-muted-foreground">
                  ابتدا «ثبت شخص» را بزنید تا بتوانید درخواست یا خلاصه تماس ثبت کنید.
                </p>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

export const CallerInboundListener = CallerInboundPopup;
