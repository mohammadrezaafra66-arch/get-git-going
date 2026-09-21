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
import { groupCallsByCardKey } from "@/lib/calls/call-card-key";
import {
  loadCallDraft,
  saveCallDraft,
} from "@/lib/calls/call-drafts";
import {
  CALLER_ID_SETTINGS_QUERY_KEY,
  DEFAULT_CALLER_ID_SETTINGS,
  callerIdCardTtlMs,
  fetchCallerIdSettings,
} from "@/lib/calls/caller-id-settings";
import {
  openCallerBroadcast,
  shouldPresentCallCard,
  type CallerBroadcastHandle,
} from "@/lib/calls/caller-broadcast";
import {
  filterCallsForCallerId,
  passesOnlyMyCustomers,
} from "@/lib/calls/filter-calls-for-caller-id";
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
const MAX_CARDS = 4;

type CallContext = {
  callKey: string;
  call: RecentInboundCall;
  extensions: string[];
  displayName: string;
  responsibleName: string | null;
  responsibleUserId: string | null;
  personId: string | null;
  customerId: string | null;
  phoneHint: string | null;
  isUnknown: boolean;
  isOutbound: boolean;
  dealId: string | null;
};

type ToastCard = {
  key: string;
  call: RecentInboundCall;
  extensions: string[];
  displayName: string;
  phoneHint: string | null;
  isUnknown: boolean;
  isOutbound: boolean;
  expiresAt: number;
};

async function resolveCallContext(
  call: RecentInboundCall,
  callKey: string,
  extensions: string[],
): Promise<CallContext> {
  const meta = call.metadata ?? {};
  const phoneHint =
    (typeof meta.raw_number === "string" && meta.raw_number) ||
    (typeof meta.stripped_number === "string" && meta.stripped_number) ||
    null;
  const unknownFlag = meta.unknown_number === true;
  const isOutbound = call.direction === "outbound";
  const linkedPersonId = call.customer_id;
  const draft = loadCallDraft(callKey);

  if (!linkedPersonId) {
    return {
      callKey,
      call,
      extensions,
      displayName: phoneHint ? toFaDigits(phoneHint) : "شماره ناشناس",
      responsibleName: null,
      responsibleUserId: null,
      personId: null,
      customerId: null,
      phoneHint,
      isUnknown: true,
      isOutbound,
      dealId: draft?.dealId ?? null,
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
        responsible_id: string | null;
        responsible: { full_name: string | null } | null;
      }
    | undefined;

  return {
    callKey,
    call,
    extensions,
    displayName:
      person?.display_name ||
      firstCustomer?.name ||
      (phoneHint ? toFaDigits(phoneHint) : "تماس‌گیرنده"),
    responsibleName: firstCustomer?.responsible?.full_name ?? null,
    responsibleUserId: firstCustomer?.responsible_id ?? null,
    personId: person?.id ?? linkedPersonId,
    customerId: firstCustomer?.id ?? null,
    phoneHint,
    isUnknown: unknownFlag || !person,
    isOutbound,
    dealId: draft?.dealId ?? null,
  };
}

/**
 * Caller ID: compact cards bottom-right; click opens full form sheet.
 * B1 group by call key · B2 BroadcastChannel · B3 TTL/settings · B4 drafts · B5 deal.
 */
export function CallerInboundPopup() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const shownRef = useRef<Set<string>>(new Set());
  const remoteClaimedRef = useRef<Set<string>>(new Set());
  const remoteDismissedRef = useRef<Set<string>>(new Set());
  const bcRef = useRef<CallerBroadcastHandle | null>(null);
  const mountAtMsRef = useRef(Date.now());
  const primedRef = useRef(false);
  const [cards, setCards] = useState<ToastCard[]>([]);
  /** Open sheet contexts keyed by call key — switching never discards drafts */
  const [openCalls, setOpenCalls] = useState<Record<string, CallContext>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dealFormKey, setDealFormKey] = useState<string | null>(null);

  const settingsQ = useQuery({
    enabled: !!userId,
    queryKey: [...CALLER_ID_SETTINGS_QUERY_KEY, userId],
    queryFn: () => fetchCallerIdSettings(userId!),
    staleTime: 30_000,
  });

  const settings = settingsQ.data ?? DEFAULT_CALLER_ID_SETTINGS;
  const pollingOn = !!userId && settings.enabled;
  const cardTtlMs = callerIdCardTtlMs(settings);

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

  // B2 — cross-tab sync
  useEffect(() => {
    const handle = openCallerBroadcast((msg) => {
      if (msg.type === "dismiss" || msg.type === "open") {
        remoteDismissedRef.current.add(msg.key);
        shownRef.current.add(msg.key);
        setCards((prev) => prev.filter((c) => c.key !== msg.key));
      } else if (msg.type === "claim" || msg.type === "shown") {
        remoteClaimedRef.current.add(msg.key);
        shownRef.current.add(msg.key);
        setCards((prev) => prev.filter((c) => c.key !== msg.key));
      }
    });
    bcRef.current = handle;
    return () => {
      handle?.close();
      bcRef.current = null;
    };
  }, []);

  // Expire cards every ~400ms
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
      { currentUserId: userId },
    );

    // B1 — one card per logical call
    const groups = groupCallsByCardKey(filtered);

    const mountAt = mountAtMsRef.current;

    if (!primedRef.current) {
      for (const g of groups) {
        const createdMs =
          Date.parse(g.primary.created_at ?? g.primary.started_at ?? "") || 0;
        if (createdMs > 0 && createdMs < mountAt - 500) {
          shownRef.current.add(g.key);
        }
      }
      primedRef.current = true;
    }

    let cancelled = false;

    (async () => {
      for (const g of groups) {
        if (
          !shouldPresentCallCard({
            key: g.key,
            localShown: shownRef.current,
            remoteClaimed: remoteClaimedRef.current,
            remoteDismissed: remoteDismissedRef.current,
          })
        ) {
          continue;
        }

        const createdMs =
          Date.parse(g.primary.created_at ?? g.primary.started_at ?? "") || 0;
        if (createdMs > 0 && createdMs < mountAt - 500) {
          shownRef.current.add(g.key);
          continue;
        }

        // Claim primary before async resolve so other tabs skip
        shownRef.current.add(g.key);
        bcRef.current?.post({
          type: "claim",
          key: g.key,
          tabId: bcRef.current.tabId,
        });

        try {
          const ctx = await resolveCallContext(g.primary, g.key, g.extensions);
          if (cancelled) return;

          if (
            !passesOnlyMyCustomers(settings, userId, ctx.responsibleUserId)
          ) {
            continue;
          }

          const card: ToastCard = {
            key: g.key,
            call: g.primary,
            extensions: g.extensions,
            displayName: ctx.displayName,
            phoneHint: ctx.phoneHint,
            isUnknown: ctx.isUnknown,
            isOutbound: ctx.isOutbound,
            expiresAt: Date.now() + cardTtlMs,
          };

          setCards((prev) => {
            const without = prev.filter((c) => c.key !== card.key);
            const next = [...without, card];
            while (next.length > MAX_CARDS) next.shift();
            return next;
          });

          bcRef.current?.post({
            type: "shown",
            key: g.key,
            tabId: bcRef.current.tabId,
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
    cardTtlMs,
    userId,
    extensionsQ.data,
    ringQ.data,
    ringQ.isLoading,
    inboundQ.data,
    inboundQ.isLoading,
  ]);

  const dismissCard = (key: string, broadcast = true) => {
    setCards((prev) => prev.filter((c) => c.key !== key));
    shownRef.current.add(key);
    if (broadcast && bcRef.current) {
      bcRef.current.post({
        type: "dismiss",
        key,
        tabId: bcRef.current.tabId,
      });
    }
  };

  const openCard = async (card: ToastCard) => {
    dismissCard(card.key, true);
    try {
      const ctx = await resolveCallContext(
        card.call,
        card.key,
        card.extensions,
      );
      setOpenCalls((prev) => ({ ...prev, [ctx.callKey]: ctx }));
      setActiveKey(ctx.callKey);
      setDealFormKey(null);
      setPanelOpen(true);
      bcRef.current?.post({
        type: "open",
        key: card.key,
        tabId: bcRef.current.tabId,
      });
    } catch {
      /* ignore */
    }
  };

  const active = activeKey ? openCalls[activeKey] ?? null : null;
  const openKeys = Object.keys(openCalls);
  const TitleIcon = active?.isOutbound ? PhoneOutgoing : PhoneIncoming;

  const callLogIdFor = (ctx: CallContext) =>
    ctx.call.id.startsWith("ring:") ? undefined : ctx.call.id;

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
                  {card.extensions.length > 0 ? (
                    <p className="text-[11px] text-muted-foreground" dir="ltr">
                      داخلی: {card.extensions.join(", ")}
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
                    {active.extensions.length > 0 ? (
                      <p className="text-xs text-muted-foreground" dir="ltr">
                        داخلی‌ها: {active.extensions.join(", ")}
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

          {/* B4 — active-call switcher; drafts survive */}
          {openKeys.length > 1 ? (
            <div className="flex flex-wrap gap-1.5" dir="rtl">
              {openKeys.map((k) => {
                const c = openCalls[k]!;
                const label = c.displayName || k.slice(0, 12);
                return (
                  <Button
                    key={k}
                    type="button"
                    size="sm"
                    variant={k === activeKey ? "default" : "outline"}
                    className="max-w-[9rem] truncate"
                    onClick={() => {
                      setActiveKey(k);
                      setDealFormKey(null);
                    }}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          ) : null}

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
                      setOpenCalls((prev) => {
                        const cur = prev[active.callKey];
                        if (!cur) return prev;
                        return {
                          ...prev,
                          [active.callKey]: {
                            ...cur,
                            customerId: data?.id ?? c.id,
                            personId: data?.person_id ?? cur.personId,
                            displayName: data?.name ?? c.name,
                            isUnknown: false,
                          },
                        };
                      });
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
                dealFormKey === active.callKey ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">افزودن معامله</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setDealFormKey(null)}
                      >
                        بازگشت به خلاصه تماس
                      </Button>
                    </div>
                    <QuickRequestForm
                      compact
                      initialPersonId={active.personId}
                      initialPersonName={active.displayName}
                      customerId={active.customerId}
                      callLogId={callLogIdFor(active)}
                      submitLabel="ثبت معامله"
                      onCreated={(dealId) => {
                        const existing = loadCallDraft(active.callKey);
                        saveCallDraft(active.callKey, {
                          kind: existing?.kind ?? "call",
                          body: existing?.body ?? "",
                          title: existing?.title ?? "",
                          followUpDate: existing?.followUpDate ?? null,
                          followUpTime: existing?.followUpTime ?? "09:00",
                          dealId,
                        });
                        setOpenCalls((prev) => {
                          const cur = prev[active.callKey];
                          if (!cur) return prev;
                          return {
                            ...prev,
                            [active.callKey]: { ...cur, dealId },
                          };
                        });
                        setDealFormKey(null);
                      }}
                    />
                  </div>
                ) : (
                  <Tabs defaultValue="note">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="note">خلاصه تماس</TabsTrigger>
                      <TabsTrigger value="request">ثبت درخواست</TabsTrigger>
                    </TabsList>
                    <TabsContent value="note" className="mt-3">
                      <CallNoteForm
                        compact
                        personId={active.personId}
                        personName={active.displayName}
                        customerId={active.customerId}
                        callLogId={callLogIdFor(active)}
                        defaultKind="call"
                        draftKey={active.callKey}
                        dealId={active.dealId}
                        showAddDeal
                        onAddDeal={() => setDealFormKey(active.callKey)}
                        onDealIdChange={(id) => {
                          setOpenCalls((prev) => {
                            const cur = prev[active.callKey];
                            if (!cur) return prev;
                            return {
                              ...prev,
                              [active.callKey]: { ...cur, dealId: id },
                            };
                          });
                        }}
                        onCreated={() => {
                          const closedKey = active.callKey;
                          setOpenCalls((prev) => {
                            const next = { ...prev };
                            delete next[closedKey];
                            const rest = Object.keys(next);
                            setActiveKey(rest[0] ?? null);
                            if (rest.length === 0) setPanelOpen(false);
                            return next;
                          });
                        }}
                      />
                    </TabsContent>
                    <TabsContent value="request" className="mt-3">
                      <QuickRequestForm
                        compact
                        initialPersonId={active.personId}
                        initialPersonName={active.displayName}
                        customerId={active.customerId}
                        callLogId={callLogIdFor(active)}
                        onCreated={() => setPanelOpen(false)}
                      />
                    </TabsContent>
                  </Tabs>
                )
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
