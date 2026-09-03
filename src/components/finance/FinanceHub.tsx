import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { NAVIGATION_REGISTRY } from "@/lib/navigation/registry";
import { isNavigationEntryPermitted } from "@/lib/navigation/selectors";
import { hasPermissionEx } from "@/lib/rbac/roles";
import type { AppRole, ExtendedAction, ModuleKey } from "@/lib/rbac/roles";

/**
 * مرکز مالی — one page that replaces a sidebar section.
 *
 * ROLE FIDELITY. Every destination is filtered through the SAME source the sidebar reads.
 * For destinations that have a navigation-registry entry we call
 * `isNavigationEntryPermitted(entry, roles)` — that is `isNavigationEntryVisible` minus the
 * `hiddenFromMenu` clause, because a destination is deliberately absent from the menu here and
 * must still appear on the hub. That single call carries `adminOnly`, `allowedRoles` AND the
 * `role_permissions` rows `hasPermissionEx` reads at runtime; a hand-written role list would
 * miss all three.
 *
 * Four destinations have no registry entry — `/accounting/receipts/create` and
 * `/purchases/create` were never in it. For those, and only those, the permission below mirrors
 * the route's own `beforeLoad` guard, quoted beside each.
 */

type HubTarget =
  | { kind: "registry"; route: string }
  | { kind: "explicit"; module: ModuleKey; action: ExtendedAction; allowedRoles?: AppRole[] };

type HubItem = {
  to: string;
  label: string;
  target: HubTarget;
};

type HubOp = HubItem & {
  glyph: string;
  ax: string;
  tone: "a" | "b" | "c" | "d";
  blurb: string;
  effect: string;
};

/** _app.accounting.receipts.create.tsx:17 — requireAnyRole(["admin","accountant","manager"]) */
const LEDGER_TARGET: HubTarget = {
  kind: "explicit",
  module: "accounting",
  action: "create",
  allowedRoles: ["admin", "accountant", "manager"],
};

/** The four daily operations. */
const OPS: readonly HubOp[] = [
  {
    to: "/accounting/receipts/create?branch=receipt",
    label: "دریافت",
    glyph: "+",
    ax: "IN",
    tone: "a",
    blurb: "پول مستقیم به دست ما رسیده",
    effect: "صندوق ↑ · طرف حساب ↓",
    target: LEDGER_TARGET,
  },
  {
    to: "/accounting/receipts/create?branch=payment",
    label: "پرداخت",
    glyph: "−",
    ax: "OUT",
    tone: "b",
    blurb: "پول مستقیم از دست ما رفته",
    effect: "صندوق ↓ · طرف حساب ↑",
    target: LEDGER_TARGET,
  },
  {
    to: "/accounting/receipts/create?branch=dual",
    label: "سند دوبل",
    glyph: "⇄",
    ax: "BALANCE",
    tone: "c",
    blurb: "پول از یکی به دیگری، ما فقط ثبت‌کننده",
    effect: "Δ A = − Δ B",
    target: LEDGER_TARGET,
  },
  {
    to: "/purchases/create",
    label: "خرید",
    glyph: "∑",
    ax: "STOCK",
    tone: "d",
    blurb: "کالا وارد شد و بدهی تأمین‌کننده بالا رفت",
    effect: "موجودی ↑ · تأمین‌کننده ↑",
    // _app.purchases_.create.tsx:11 — requirePermission("purchases","create")
    target: { kind: "explicit", module: "purchases", action: "create" },
  },
];

/** The three reference columns. */
const COLUMNS: readonly { sign: string; title: string; items: readonly HubItem[] }[] = [
  {
    sign: "≡",
    title: "پرونده‌ها",
    items: [
      {
        to: "/accounting/documents",
        label: "دفتر اسناد",
        target: { kind: "registry", route: "/accounting/documents" },
      },
      { to: "/persons", label: "اشخاص", target: { kind: "registry", route: "/persons" } },
      { to: "/warehouses", label: "انبار", target: { kind: "registry", route: "/warehouses" } },
      {
        to: "/accounting/treasury",
        label: "خزانه و مانده صندوق",
        target: { kind: "registry", route: "/accounting/treasury" },
      },
      {
        to: "/accounting/purchase-payments",
        label: "پرداخت خرید",
        target: { kind: "registry", route: "/accounting/purchase-payments" },
      },
    ],
  },
  {
    sign: "ƒ",
    title: "سنجش و امتیاز",
    items: [
      {
        to: "/sales/credit-customers",
        label: "اعتبار مشتریان",
        target: { kind: "registry", route: "/sales/credit-customers" },
      },
      {
        to: "/accounting/salesperson-scoring",
        label: "امتیاز کارشناسان فروش",
        target: { kind: "registry", route: "/accounting/salesperson-scoring" },
      },
      {
        to: "/accounting/dynamic-capital",
        label: "تخصیص سرمایه",
        target: { kind: "registry", route: "/accounting/dynamic-capital" },
      },
    ],
  },
  {
    sign: "∂",
    title: "تنظیمات",
    items: [
      {
        to: "/sales/credit-rules",
        label: "قوانین اعتبار",
        target: { kind: "registry", route: "/sales/credit-rules" },
      },
      {
        to: "/sales/customers/credit-training",
        label: "آموزش اعتبار مشتریان",
        target: { kind: "registry", route: "/sales/customers/credit-training" },
      },
      {
        to: "/accounting/bank-accounts",
        label: "حساب‌های بانکی",
        target: { kind: "registry", route: "/accounting/bank-accounts" },
      },
      {
        // Registry allowlist is ["admin","accountant"] — narrower than the accounting
        // module, so manager is excluded here without the hub restating anything.
        to: "/accounting/mutual-settlement",
        label: "تسویهٔ متقابل",
        target: { kind: "registry", route: "/accounting/mutual-settlement" },
      },
    ],
  },
  {
    // ∫ — both of these are balances accumulated over time rather than a single record.
    sign: "∫",
    title: "مانده‌ها و گزارش",
    items: [
      {
        to: "/accounting/receivables",
        label: "مطالبات مشتریان",
        target: { kind: "registry", route: "/accounting/receivables" },
      },
      {
        to: "/accounting/payables",
        label: "بدهی تأمین‌کنندگان",
        target: { kind: "registry", route: "/accounting/payables" },
      },
    ],
  },
];

function useCanSee() {
  const { roles } = useAuth();
  return useMemo(() => {
    const registryByRoute = new Map(NAVIGATION_REGISTRY.map((e) => [e.route, e] as const));
    return (target: HubTarget): boolean => {
      if (target.kind === "registry") {
        const entry = registryByRoute.get(target.route);
        // A destination that vanished from the registry is hidden rather than shown: failing
        // closed is the only safe default for a permission check.
        if (!entry) return false;
        return isNavigationEntryPermitted(entry, roles);
      }
      if (target.allowedRoles && !target.allowedRoles.some((r) => roles.includes(r))) return false;
      return hasPermissionEx(roles, target.module, target.action);
    };
  }, [roles]);
}

const CSS = `
.fh{--paper:#f5f8f7;--grid-fine:#e5edec;--grid-bold:#d4e1df;--rule:#c4d4d2;
  --ink:#0d1b1a;--ink-2:#3d5250;--ink-3:#7b8e8c;
  --brand:#007d7e;--brand-deep:#004f50;
  --in:#0b6e46;--in-t:#e2f2ea;--out:#a82a26;--out-t:#f8e8e7;
  --bal:#007d7e;--bal-t:#e3f0f0;--goods:#8a5a0c;--goods-t:#f6eddc;--cfg:#4a5b73;
  color:var(--ink);line-height:1.7;
  background:
    repeating-linear-gradient(to right,var(--grid-fine) 0 1px,transparent 1px 8px),
    repeating-linear-gradient(to bottom,var(--grid-fine) 0 1px,transparent 1px 8px),
    repeating-linear-gradient(to right,var(--grid-bold) 0 1px,transparent 1px 48px),
    repeating-linear-gradient(to bottom,var(--grid-bold) 0 1px,transparent 1px 48px),
    var(--paper);
}
.fh .wrap{max-width:1200px;margin:0 auto;padding:0 20px 72px}
.fh .titleblock{background:#fff;border:1px solid var(--rule);border-top:3px solid var(--brand);
  margin-top:28px;display:grid;grid-template-columns:1fr auto}
.fh .titleblock .lft{padding:22px 26px 20px}
.fh .eyebrow{font-size:10.5px;letter-spacing:.16em;color:var(--ink-3);margin-bottom:9px}
.fh .titleblock h1{font-size:27px;font-weight:800;letter-spacing:-.6px;line-height:1.25}
.fh .titleblock .lede{font-size:13.5px;color:var(--ink-2);margin-top:7px;max-width:46ch}
.fh .identity{border-inline-start:1px solid var(--rule);padding:22px 30px;display:flex;
  flex-direction:column;justify-content:center;background:linear-gradient(180deg,#fbfdfd,#f1f7f7)}
.fh .identity .eq{font-size:19px;font-weight:500;color:var(--brand-deep);white-space:nowrap}
.fh .identity .eq b{color:var(--brand);font-weight:700;padding:0 7px}
.fh .identity .cap{font-size:11px;color:var(--ink-3);margin-top:8px;text-align:center}
.fh .memo{background:#fffdf5;border:1px solid #e8dcb4;border-inline-start:3px solid #c9a227;
  padding:13px 17px;font-size:13px;color:#5c4a12;margin-top:18px}
.fh .sec{margin-top:38px}
.fh .sechead{display:flex;align-items:center;gap:13px;margin-bottom:15px}
.fh .sechead .idx{font-size:11px;color:var(--ink-3);border:1px solid var(--rule);background:#fff;
  padding:2px 7px}
.fh .sechead h2{font-size:15.5px;font-weight:700}
.fh .sechead::after{content:"";flex:1;height:1px;background:var(--rule)}
.fh .ops{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;border:1px solid var(--rule);
  background:var(--rule)}
.fh .op{background:#fff;display:flex;flex-direction:column;text-align:start;color:inherit;
  text-decoration:none;transition:background .15s}
.fh .op:hover{background:var(--t)}
.fh .op:focus-visible{outline:2px solid var(--c);outline-offset:-3px}
.fh .op .glyph{height:58px;display:flex;align-items:center;justify-content:center;
  background:var(--t);border-bottom:1px solid var(--rule);font-size:30px;font-weight:700;
  color:var(--c);line-height:1;position:relative}
.fh .op .glyph::after{content:attr(data-ax);position:absolute;bottom:6px;inset-inline-end:10px;
  font-size:9px;font-weight:400;letter-spacing:.1em;opacity:.6}
.fh .op .body{padding:17px 19px 20px;flex:1}
.fh .op h3{font-size:16.5px;font-weight:700;margin-bottom:5px}
.fh .op p{font-size:12.5px;color:var(--ink-2);line-height:1.6;margin-bottom:12px}
.fh .op .eff{font-size:10.5px;color:var(--c);background:var(--t);border:1px solid var(--c);
  padding:4px 8px;display:inline-block}
.fh .op.a{--c:var(--in);--t:var(--in-t)}
.fh .op.b{--c:var(--out);--t:var(--out-t)}
.fh .op.c{--c:var(--bal);--t:var(--bal-t)}
.fh .op.d{--c:var(--goods);--t:var(--goods-t)}
.fh .cols{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;border:1px solid var(--rule);
  background:var(--rule)}
.fh .col{background:#fff;padding:18px 20px 20px}
.fh .col .ch{display:flex;align-items:center;gap:9px;margin-bottom:13px;padding-bottom:10px;
  border-bottom:1px solid var(--rule)}
.fh .col .sign{font-size:17px;color:var(--cfg);width:22px;text-align:center}
.fh .col h3{font-size:14px;font-weight:700}
.fh .lnk{display:block;padding:9px 0;font-size:13.5px;color:var(--ink);text-decoration:none;
  border-bottom:1px dotted var(--rule)}
.fh .lnk:last-child{border-bottom:none}
.fh .lnk:hover{color:var(--brand)}
.fh .lnk b{font-weight:600}
/* Four reference columns need one more step down than the operation row does, or they go
   from 300px each straight to full width. */
@media(max-width:1100px){.fh .cols{grid-template-columns:repeat(2,1fr)}}
@media(max-width:900px){
  .fh .ops{grid-template-columns:repeat(2,1fr)}
  .fh .titleblock{grid-template-columns:1fr}
  .fh .identity{border-inline-start:none;border-top:1px solid var(--rule)}
}
@media(max-width:700px){.fh .cols{grid-template-columns:1fr}}
@media(max-width:560px){.fh .ops{grid-template-columns:1fr}}
`;

export function FinanceHub() {
  const canSee = useCanSee();
  const ops = OPS.filter((o) => canSee(o.target));
  const cols = COLUMNS.map((c) => ({
    ...c,
    items: c.items.filter((i) => canSee(i.target)),
  })).filter((c) => c.items.length > 0);

  return (
    <div className="fh" dir="rtl" data-testid="finance-hub">
      <style>{CSS}</style>
      <div className="wrap">
        <div className="titleblock">
          <div className="lft">
            <div className="eyebrow font-mono">AFRAKALA · FINANCE</div>
            <h1>مرکز مالی</h1>
            <p className="lede">
              هر عملیات مالی از همین‌جا شروع می‌شود. هر سند دو طرف دارد و همیشه متوازن است.
            </p>
          </div>
          <div className="identity">
            <div className="eq font-mono">
              Σ بدهکار <b>=</b> Σ بستانکار
            </div>
            <div className="cap">اتحادی که هیچ سندی نقضش نمی‌کند</div>
          </div>
        </div>

        <div className="memo">
          <b>پیش از ثبت:</b> طرف حساب باید در سیستم موجود باشد. هر شخصی که ثبت می‌شود پروندهٔ
          مشتری دارد، پس می‌توانید مستقیم انتخابش کنید.
        </div>

        {ops.length > 0 ? (
          <section className="sec">
            <div className="sechead">
              <span className="idx font-mono">01</span>
              <h2>ثبت سند</h2>
            </div>
            <div className="ops">
              {ops.map((o) => (
                <Link
                  key={o.to}
                  to={o.to}
                  className={`op ${o.tone}`}
                  data-testid={`hub-op-${o.ax.toLowerCase()}`}
                >
                  <div className="glyph font-mono" data-ax={o.ax}>
                    {o.glyph}
                  </div>
                  <div className="body">
                    <h3>{o.label}</h3>
                    <p>{o.blurb}</p>
                    <span className="eff font-mono">{o.effect}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {cols.length > 0 ? (
          <section className="sec">
            <div className="sechead">
              <span className="idx font-mono">02</span>
              <h2>پرونده‌ها، سنجش و تنظیمات</h2>
            </div>
            <div className="cols">
              {cols.map((c) => (
                <div className="col" key={c.title}>
                  <div className="ch">
                    <span className="sign font-mono">{c.sign}</span>
                    <h3>{c.title}</h3>
                  </div>
                  {c.items.map((i) => (
                    <Link key={i.to} to={i.to} className="lnk" data-testid={`hub-link-${i.to}`}>
                      <b>{i.label}</b>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
