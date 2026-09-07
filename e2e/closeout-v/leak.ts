/**
 * "Refused" has to mean the protected content NEVER painted — not that it painted and
 * was then swept away. A screenshot taken afterwards cannot tell those two apart, so the
 * page is instrumented before its first byte: a MutationObserver records every moment a
 * marker appears, into sessionStorage so the record survives a client-side route change.
 *
 * Each hit carries WHERE it was found. A page heading and a sidebar link can share a
 * string, and calling a visible menu entry "the protected page rendered" would be a false
 * positive that discredits the real ones.
 */
import type { Page } from "@playwright/test";

export type LeakHit = { at: number; marker: string; where: string; path: string };

export async function armLeakDetector(page: Page, markers: string[]): Promise<void> {
  await page.addInitScript((ms: string[]) => {
    const KEY = "__v_leak__";
    const push = (hit: unknown) => {
      try {
        const prev = JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as unknown[];
        if (prev.length < 40) {
          prev.push(hit);
          sessionStorage.setItem(KEY, JSON.stringify(prev));
        }
      } catch {
        /* storage unavailable */
      }
    };
    const seen = new Set<string>();
    const locate = (marker: string): string => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        if ((n.textContent ?? "").includes(marker)) {
          const parts: string[] = [];
          let el: Element | null = n.parentElement;
          while (el && parts.length < 8) {
            const id = el.getAttribute("data-testid");
            const side = el.getAttribute("data-sidebar");
            parts.push(
              el.tagName.toLowerCase() +
                (id ? `[testid=${id}]` : "") +
                (side ? `[sidebar=${side}]` : ""),
            );
            el = el.parentElement;
          }
          return parts.join(" < ");
        }
      }
      return "(not located)";
    };
    const scan = () => {
      const t = document.body?.innerText ?? "";
      for (const m of ms) {
        if (t.includes(m) && !seen.has(m)) {
          seen.add(m);
          push({ at: Date.now(), marker: m, where: locate(m), path: location.pathname });
        }
      }
    };
    const start = () => {
      scan();
      new MutationObserver(scan).observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    };
    if (document.body) start();
    else document.addEventListener("DOMContentLoaded", start, { once: true });
  }, markers);
}

export async function readLeaks(page: Page): Promise<LeakHit[]> {
  return page.evaluate(() => {
    try {
      return JSON.parse(sessionStorage.getItem("__v_leak__") ?? "[]") as LeakHit[];
    } catch {
      return [];
    }
  });
}
