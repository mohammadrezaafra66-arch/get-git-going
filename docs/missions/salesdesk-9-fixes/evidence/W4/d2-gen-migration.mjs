/**
 * Generate ASCII-safe migration + expected hex map for D2 seeds.
 * Titles are UTF-8 in this Node source; SQL output uses U&\xxxx only.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, "../../../../../");

const titles = [
  "یادداشت ساده",
  "تماس ورودی",
  "تماس خروجی",
  "اعلام قیمت",
  "پیگیری و فعالیت یا حساب رسانی",
  "ویدئو چک",
  "تماس خروجی نا موفق",
  "وظیفه",
  "فیش چک",
  "پیام واتس اپ یا sms",
  "برسی اعتبار و مانده معوق مشتری برای اعلام قیمت",
  "خرید و چک کالا",
  "ارسال فاکتور در گروه مشتری و فاکتور دستی",
  "اکسل اجناس ارسال نشده",
  "ارسال نهایی",
  "ارسال بیجک یا رسید در گروه مشتری",
  "ثبت حسابداری",
  "فاکتورلاین",
];

function toUEscape(s) {
  return (
    "U&'" +
    [...s].map((ch) => {
      const cp = ch.codePointAt(0);
      if (cp <= 0x7f && ch !== "'" && ch !== "\\") return ch;
      return "\\" + cp.toString(16).toUpperCase().padStart(4, "0");
    }).join("") +
    "'"
  );
}

const hexMap = titles.map((t, i) => ({
  sort_order: i,
  title: t,
  hex: Buffer.from(t, "utf8").toString("hex"),
  u: toUEscape(t),
}));

writeFileSync(
  join(dir, "d2-expected-hex.json"),
  JSON.stringify(hexMap, null, 2) + "\n",
  "utf8",
);

const values = titles
  .map((t, i) => `  (${toUEscape(t)}, ${i}, true)`)
  .join(",\n");

const migration = `SET client_encoding='UTF8';

-- ============================================================================
-- 572 - sales_activity_types seed (Didar 17 + simple note) -- Wave 4 D2
-- ============================================================================
-- Schema: id uuid PK, title text NOT NULL, sort_order int NOT NULL,
--         is_active boolean NOT NULL DEFAULT true
-- Seed titles via Unicode escapes (ASCII-only source; AGENTS.md).
-- RLS: SELECT all authenticated; INSERT/UPDATE admin/manager.
-- No DELETE policy (deactivate never delete).
--
-- Rollback: docs/missions/salesdesk-9-fixes/revert/572_sales_activity_types.sql
-- ============================================================================

SET lock_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.sales_activity_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

COMMENT ON TABLE public.sales_activity_types IS
  'Catalog of sales activity types (Didar seed + simple note). Deactivate never delete. Migration 572.';

CREATE UNIQUE INDEX IF NOT EXISTS sales_activity_types_sort_order_uidx
  ON public.sales_activity_types (sort_order);

INSERT INTO public.sales_activity_types (title, sort_order, is_active)
SELECT v.title, v.sort_order, v.is_active
FROM (
  VALUES
${values}
) AS v(title, sort_order, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.sales_activity_types t WHERE t.sort_order = v.sort_order
);

ALTER TABLE public.sales_activity_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_activity_types_select ON public.sales_activity_types;
CREATE POLICY sales_activity_types_select ON public.sales_activity_types
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS sales_activity_types_insert ON public.sales_activity_types;
CREATE POLICY sales_activity_types_insert ON public.sales_activity_types
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
  );

DROP POLICY IF EXISTS sales_activity_types_update ON public.sales_activity_types;
CREATE POLICY sales_activity_types_update ON public.sales_activity_types
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
  )
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
  );

REVOKE ALL ON TABLE public.sales_activity_types FROM PUBLIC;
REVOKE ALL ON TABLE public.sales_activity_types FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sales_activity_types TO authenticated;
GRANT ALL ON TABLE public.sales_activity_types TO service_role;
`;

const migPath = join(
  root,
  "supabase/migrations/20260922050000_572_sales_activity_types.sql",
);
writeFileSync(migPath, migration, "utf8");

const revert = `SET client_encoding='UTF8';

-- 572-down: reverse sales_activity_types (copy/staging only).

DROP POLICY IF EXISTS sales_activity_types_select ON public.sales_activity_types;
DROP POLICY IF EXISTS sales_activity_types_insert ON public.sales_activity_types;
DROP POLICY IF EXISTS sales_activity_types_update ON public.sales_activity_types;

DROP INDEX IF EXISTS public.sales_activity_types_sort_order_uidx;

DROP TABLE IF EXISTS public.sales_activity_types;

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260922050000';
`;

const revertPath = join(
  root,
  "docs/missions/salesdesk-9-fixes/revert/572_sales_activity_types.sql",
);
writeFileSync(revertPath, revert, "utf8");

console.log("wrote", migPath);
console.log("wrote", revertPath);
console.log("titles", titles.length);
console.log("sample0_hex", hexMap[0].hex);
console.log("sample17_hex", hexMap[17].hex);
