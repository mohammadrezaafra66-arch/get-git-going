import type { CSSProperties, ReactNode } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { MobileBottomNav } from "./MobileBottomNav";
import { NavigationBreadcrumbs } from "./NavigationBreadcrumbs";
import { NavigationCommandPalette } from "./NavigationCommandPalette";
import { PopupCenterProvider } from "@/lib/popups/PopupCenterProvider";
import { PriceChangePopupListener } from "@/shared/components/PriceChangePopupListener";
import { OwnerRemindersListener } from "@/shared/components/OwnerRemindersListener";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <PopupCenterProvider>
      <PriceChangePopupListener />
      <OwnerRemindersListener />
      {/* Item 209 — 16rem truncated most Persian menu labels, which is what
          made options hard to find. Overridden here rather than in
          components/ui/sidebar.tsx so the generated shadcn file stays clean;
          the provider merges this into its own style. */}
      <SidebarProvider style={{ "--sidebar-width": "20rem" } as CSSProperties}>
        <div dir="rtl" className="flex min-h-screen w-full bg-background">
          <AppSidebar />
          <SidebarInset className="flex min-w-0 flex-1 flex-col">
            <AppHeader />
            <main className="flex-1 px-3 py-4 pb-20 sm:px-6 sm:py-6 md:pb-6">
              <NavigationBreadcrumbs />
              {children}
            </main>
            <NavigationCommandPalette />
            <MobileBottomNav />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </PopupCenterProvider>
  );
}
