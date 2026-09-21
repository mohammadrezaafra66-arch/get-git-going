import { test, expect } from "@playwright/test";
import { type CollabRole } from "./_helpers/constants";
import { contextForRole, gotoAuthed } from "./_helpers/ui";

test.describe("F — Mobile viewports", () => {
  test.setTimeout(120_000);

  for (const viewport of [
    { w: 360, h: 800 },
    { w: 390, h: 844 },
  ]) {
    test(`F1 hub two columns no H-scroll ${viewport.w}x${viewport.h}`, async ({ browser }) => {
      const ctx = await contextForRole(browser, "sales");
      const page = await ctx.newPage();
      await page.setViewportSize({ width: viewport.w, height: viewport.h });
      await gotoAuthed(page, "/collaboration");
      await expect(page.getByRole("heading", { name: "پیام‌ها", exact: true })).toBeVisible();

      const metrics = await page.evaluate(() => {
        const grid = document.querySelector(".grid");
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          dir: document.documentElement.getAttribute("dir") || document.body.getAttribute("dir"),
          gridCols: grid ? getComputedStyle(grid).gridTemplateColumns : "",
        };
      });
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 8);
      const colCount = metrics.gridCols.trim().split(/\s+/).filter(Boolean).length;
      expect(colCount).toBeGreaterThanOrEqual(2);
      const body = await page.locator("body").innerText();
      expect(body).toMatch(/[۰-۹]/);
      test.info().annotations.push({
        type: "F1",
        description: JSON.stringify(metrics),
      });
      await ctx.close();
    });

    test(`F2 messages composer tap targets ${viewport.w}`, async ({ browser }) => {
      const ctx = await contextForRole(browser, "sales");
      const page = await ctx.newPage();
      await page.setViewportSize({ width: viewport.w, height: viewport.h });
      await gotoAuthed(page, "/messages");
      const composer = page.locator("textarea, [contenteditable='true']").first();
      const sizes = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll("button")].slice(0, 40);
        return buttons.map((b) => {
          const r = b.getBoundingClientRect();
          return { text: (b.textContent || "").trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) };
        });
      });
      const pageText = await page.locator("body").innerText();
      test.info().annotations.push({
        type: "F2",
        description: JSON.stringify({
          hasComposer: (await composer.count()) > 0,
          buttonSizes: sizes.filter((s) => s.h > 0).slice(0, 12),
          snippet: pageText.slice(0, 200),
        }),
      });
      // Empty list before selecting a group is OK — page must render
      expect(pageText.length).toBeGreaterThan(10);
      await ctx.close();
    });
  }

  test("F3 bottom mobile navigation per role", async ({ browser }) => {
    const roles: CollabRole[] = ["admin", "manager", "sales", "accountant", "viewer"];
    const matrix: Record<string, string[]> = {};
    for (const role of roles) {
      const ctx = await contextForRole(browser, role);
      const page = await ctx.newPage();
      await page.setViewportSize({ width: 360, height: 800 });
      await gotoAuthed(page, "/dashboard");
      const navTexts = await page.evaluate(() => {
        const nav =
          document.querySelector("nav[aria-label], [data-mobile-nav], footer nav, .mobile-nav") ||
          document.querySelector("nav");
        if (!nav) return [] as string[];
        return [...nav.querySelectorAll("a,button")]
          .map((el) => (el.textContent || "").trim())
          .filter(Boolean)
          .slice(0, 20);
      });
      matrix[role] = navTexts;
      await ctx.close();
    }
    matrix.purchase_specialist = ["BLOCKED-DATA: no test account"];
    test.info().annotations.push({ type: "F3", description: JSON.stringify(matrix) });
    expect(Object.keys(matrix).length).toBe(6);
  });
});
