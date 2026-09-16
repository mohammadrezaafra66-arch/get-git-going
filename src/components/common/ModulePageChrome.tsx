import { type ReactNode, useEffect, useRef, useState } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PRIMARY_MODULES, resolveActiveModule } from "@/components/layout/primary-modules";
import { NAVIGATION_REGISTRY } from "@/lib/navigation/registry";
import { resolveNavigationMetadata } from "@/lib/navigation/metadata";
import { cn } from "@/lib/utils";

function cleanPathname(pathname: string): string {
  return pathname.split("?")[0]?.replace(/\/$/, "") || "/";
}

function isAccountingPath(pathname: string): boolean {
  return pathname === "/accounting" || pathname.startsWith("/accounting/");
}

/**
 * Routes with their own full visual shell (atmosphere / dedicated back).
 * Skip shared chrome entirely so we neither double the back nor clash grids.
 */
function hasOwnPageShell(pathname: string): boolean {
  if (pathname === "/operations/sales-desk" || pathname.startsWith("/operations/sales-desk/")) {
    return true;
  }
  if (
    pathname === "/operations/call-activity" ||
    pathname.startsWith("/operations/call-activity/")
  ) {
    return true;
  }
  if (pathname.startsWith("/sales/customers/") && pathname.endsWith("/dossier")) {
    return true;
  }
  return false;
}

function resolveModuleFallback(pathname: string): string {
  const key = resolveActiveModule(pathname);
  const mod = PRIMARY_MODULES.find((m) => m.key === key);
  if (mod?.defaultTo && mod.defaultTo !== pathname) return mod.defaultTo;
  return "/dashboard";
}

/** Prefer registered parent over blind history.back() (deep-link safe). */
function resolveBackTarget(pathname: string): string {
  const meta = resolveNavigationMetadata(pathname);

  const parentCrumb = [...meta.breadcrumbs].reverse().find((b) => b.route && b.route !== pathname);
  if (parentCrumb?.route) return parentCrumb.route;

  if (meta.dynamic && meta.route && meta.route !== pathname) {
    return meta.route;
  }

  let candidate = pathname;
  while (candidate.includes("/") && candidate !== "/") {
    candidate = candidate.replace(/\/[^/]+$/, "") || "/";
    if (NAVIGATION_REGISTRY.some((e) => e.route === candidate)) {
      return candidate;
    }
  }

  return resolveModuleFallback(pathname);
}

function pageAlreadyHasBackControl(root: HTMLElement | null): boolean {
  if (!root) return false;
  const nodes = root.querySelectorAll("a, button");
  for (const node of nodes) {
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    // Prefer real nav backs («بازگشت», «بازگشت به …») — ignore prose like «قابل بازگشت نیست»
    if (!(text === "بازگشت" || text.startsWith("بازگشت "))) continue;
    if (node.getAttribute("data-testid") === "module-back-button") continue;
    return true;
  }
  return false;
}

function ModuleBackButton({ pathname }: { pathname: string }) {
  const router = useRouter();

  const goBack = () => {
    const target = resolveBackTarget(pathname);
    if (target === pathname) return;
    router.history.push(target);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={goBack}
      data-testid="module-back-button"
      aria-label="بازگشت به صفحهٔ بالاتر"
      className={cn(
        "gap-1.5 border-[color:var(--grid-bold,#d4e1df)] bg-white/80 shadow-sm backdrop-blur-[1px]",
        "hover:bg-white focus-visible:ring-2 focus-visible:ring-[color:var(--module-brand,#007d7e)]",
      )}
    >
      <ArrowRight className="h-4 w-4" aria-hidden />
      بازگشت
    </Button>
  );
}

/**
 * Shared non-accounting page chrome: mint checkered paper grid + optional Back.
 * Accounting and dedicated shells (sales-desk) render children unchanged.
 */
export function ModulePageChrome({ children }: { children: ReactNode }) {
  const location = useLocation();
  const pathname = cleanPathname(location.pathname);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Start hidden until first measure to avoid a one-frame double-back flash.
  const [backGateOpen, setBackGateOpen] = useState(false);
  const [hideChromeBack, setHideChromeBack] = useState(false);

  const skipChrome = isAccountingPath(pathname) || hasOwnPageShell(pathname);
  const showBackBase = pathname !== "/" && pathname !== "/dashboard";

  useEffect(() => {
    setBackGateOpen(false);
    setHideChromeBack(false);

    if (skipChrome || !showBackBase) {
      setBackGateOpen(true);
      return;
    }

    const root = bodyRef.current;
    const measure = () => {
      setHideChromeBack(pageAlreadyHasBackControl(root));
      setBackGateOpen(true);
    };
    measure();

    if (!root || typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => {
      setHideChromeBack(pageAlreadyHasBackControl(root));
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [pathname, skipChrome, showBackBase, children]);

  if (skipChrome) {
    return <>{children}</>;
  }

  const showBack = showBackBase && backGateOpen && !hideChromeBack;

  return (
    <div className="module-paper-grid" data-testid="module-page-chrome">
      {showBack ? (
        <div className="module-chrome-toolbar">
          <ModuleBackButton pathname={pathname} />
        </div>
      ) : null}
      <div ref={bodyRef} className="module-chrome-body">
        {children}
      </div>
    </div>
  );
}
