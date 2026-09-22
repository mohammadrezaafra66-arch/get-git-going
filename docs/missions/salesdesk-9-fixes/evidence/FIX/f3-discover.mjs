/**
 * F3 discovery — users, products, settlement, schema for C9/C5.
 * node docs/missions/salesdesk-9-fixes/evidence/FIX/f3-discover.mjs
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const CONTAINER = process.env.E2E_DB_CONTAINER ?? "afrakala-lan-db";
const OUT = join(fileURLToPath(new URL(".", import.meta.url)), "f3-discover.txt");

function scalar(sql) {
  return execFileSync(
    "docker",
    ["exec", CONTAINER, "psql", "-U", "postgres", "-d", "afrakala", "-A", "-t", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function table(sql) {
  return execFileSync(
    "docker",
    ["exec", CONTAINER, "psql", "-U", "postgres", "-d", "afrakala", "-A", "-F", "|", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

const parts = [];

parts.push("===== test users =====");
parts.push(
  table(
    `SELECT u.email, u.id::text, coalesce(string_agg(ur.role, ','), '') AS roles
     FROM auth.users u
     LEFT JOIN public.user_roles ur ON ur.user_id = u.id
     WHERE u.email LIKE 'test.%@afrakala.local'
     GROUP BY u.email, u.id
     ORDER BY u.email`,
  ),
);

parts.push("===== products sample =====");
parts.push(
  table(
    `SELECT id::text, coalesce(sku,''), left(name,40)
     FROM products
     WHERE coalesce(is_active, true) = true
     ORDER BY created_at DESC NULLS LAST
     LIMIT 8`,
  ),
);

parts.push("===== sale_price_types =====");
parts.push(
  table(
    `SELECT id::text, code, title FROM sale_price_types
     WHERE is_active = true AND coalesce(is_quick_price_only,false)=false
     ORDER BY sort_order NULLS LAST LIMIT 5`,
  ),
);

parts.push("===== settlement_types =====");
parts.push(
  table(
    `SELECT id::text, code, title FROM settlement_types
     WHERE is_active = true ORDER BY sort_order NULLS LAST LIMIT 5`,
  ),
);

parts.push("===== warehouses =====");
parts.push(
  table(
    `SELECT id::text, name FROM warehouses WHERE coalesce(is_active,true)=true LIMIT 5`,
  ),
);

parts.push("===== sales_quotes cols (interaction) =====");
parts.push(
  table(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name='sales_quotes'
       AND column_name IN ('interaction_id','salesperson_id','status','customer_id')
     ORDER BY column_name`,
  ),
);

parts.push("===== tehran_today =====");
parts.push(scalar(`SELECT public.tehran_today()::text`));

parts.push("===== C5 aggregate today (all authors) =====");
parts.push(
  table(
    `SELECT author_id::text, count(*)::text
     FROM sales_interactions
     WHERE kind='request'
       AND salesperson_id IS NOT NULL
       AND author_id <> salesperson_id
       AND (created_at AT TIME ZONE 'Asia/Tehran')::date = public.tehran_today()
     GROUP BY author_id
     ORDER BY count(*) DESC
     LIMIT 10`,
  ),
);

parts.push("===== KPI today (accepted quotes by accepted_at) =====");
parts.push(
  scalar(
    `SELECT coalesce(sum(final_amount),0)::text || '|' || count(*)::text
     FROM sales_quotes
     WHERE status='accepted'
       AND accepted_at IS NOT NULL
       AND (accepted_at AT TIME ZONE 'Asia/Tehran')::date = public.tehran_today()`,
  ),
);

parts.push("===== score fingerprint (salesperson accepted draft-safe) =====");
parts.push(
  scalar(
    `SELECT coalesce(sum(final_amount),0)::text || '|' || count(*)::text
     FROM sales_quotes
     WHERE status='accepted' AND salesperson_id IS NOT NULL`,
  ),
);

parts.push("===== compute_employee_score exists =====");
parts.push(
  scalar(
    `SELECT proname || '|' || length(prosrc)::text
     FROM pg_proc WHERE proname='compute_employee_score' LIMIT 1`,
  ),
);

parts.push("===== sales_interactions required cols =====");
parts.push(
  table(
    `SELECT column_name, is_nullable
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='sales_interactions'
       AND column_name IN ('person_id','customer_id','author_id','salesperson_id','kind','title','body','status')
     ORDER BY column_name`,
  ),
);

parts.push("===== persons/customers sample cols =====");
parts.push(
  table(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='persons'
       AND column_name IN ('id','full_name','name','primary_phone','code')
     ORDER BY 1`,
  ),
);

const text = parts.join("\n") + "\n";
writeFileSync(OUT, text, { encoding: "utf8" });
console.log(text);
console.log("WROTE", OUT);
