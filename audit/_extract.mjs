import fs from "node:fs";
import path from "node:path";

const root = "D:/AfraKalaTest/app";
const inv = path.join(root, "audit/inventory");
const types = fs.readFileSync(path.join(root, "src/integrations/supabase/types.ts"), "utf8");

function sliceBetween(src, startNeedle, endNeedle) {
  const s = src.indexOf(startNeedle);
  if (s < 0) return "";
  const from = src.indexOf("{", s);
  const e = src.indexOf(endNeedle, from);
  return src.slice(from, e < 0 ? src.length : e);
}

const tablesBlock = sliceBetween(types, "    Tables: {", "\n    Views: {");
const viewsBlock = sliceBetween(types, "    Views: {", "\n    Functions: {");
const fnsBlock = sliceBetween(types, "    Functions: {", "\n    Enums: {");
const keys = (block) =>
  [...block.matchAll(/^      ([a-z][a-z0-9_]+): \{/gm)].map((m) => m[1]);

const tables = keys(tablesBlock);
const views = keys(viewsBlock);
const fns = keys(fnsBlock);
fs.writeFileSync(path.join(inv, "db-tables-from-types.txt"), tables.join("\n") + "\n");
fs.writeFileSync(path.join(inv, "db-views-from-types.txt"), views.join("\n") + "\n");
fs.writeFileSync(path.join(inv, "db-functions-from-types.txt"), fns.join("\n") + "\n");
fs.writeFileSync(
  path.join(inv, "db-types-count.txt"),
  `tables=${tables.length} views=${views.length} functions=${fns.length}\n`,
);

const from = fs
  .readFileSync(path.join(inv, "orm-from-tables.txt"), "utf8")
  .replace(/^\uFEFF/, "")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
const rpc = fs
  .readFileSync(path.join(inv, "rpc-calls.txt"), "utf8")
  .replace(/^\uFEFF/, "")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
const routes = fs
  .readFileSync(path.join(inv, "routes.txt"), "utf8")
  .replace(/^\uFEFF/, "")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
const nav = fs
  .readFileSync(path.join(inv, "nav-items.txt"), "utf8")
  .replace(/^\uFEFF/, "")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
const primary = fs.existsSync(path.join(inv, "primary-module-paths.txt"))
  ? fs
      .readFileSync(path.join(inv, "primary-module-paths.txt"), "utf8")
      .replace(/^\uFEFF/, "")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
  : [];

function fileRouteToPublic(r) {
  return r
    .replace(/^\/_app/, "")
    .replace(/\/$/, "")
    .replace(/_/g, "")
    .replace(/\$[A-Za-z0-9_]+/g, ":param");
}

const publicAppRoutes = routes
  .filter((r) => r.startsWith("/_app"))
  .map((r) => {
    const p = r
      .replace(/^\/_app/, "")
      .replace(/_/g, "/")
      .replace(/\/+/g, "/")
      .replace(/\/$/, "") || "/";
    return p === "/" ? "/dashboard?" : p;
  });

const navSet = new Set(nav);
const primarySet = new Set(primary);
const navNotInPrimary = nav.filter((n) => !primarySet.has(n));
const primaryNotInNav = primary.filter((p) => !navSet.has(p));

const fromSet = new Set(from);
const tableSet = new Set(tables);
const viewSet = new Set(views);
const queriedMissing = from.filter((t) => !tableSet.has(t) && !viewSet.has(t));
const typesNeverFrom = tables.filter((t) => !fromSet.has(t));
const rpcInTypes = new Set(fns);
const rpcMissingInTypes = rpc.filter((r) => !rpcInTypes.has(r));
const typesRpcNeverCalled = fns.filter((f) => !rpc.includes(f));

fs.writeFileSync(path.join(inv, "orm-tables-not-in-types.txt"), queriedMissing.join("\n") + "\n");
fs.writeFileSync(path.join(inv, "types-tables-never-from.txt"), typesNeverFrom.join("\n") + "\n");
fs.writeFileSync(path.join(inv, "rpc-called-not-in-types.txt"), rpcMissingInTypes.join("\n") + "\n");
fs.writeFileSync(path.join(inv, "types-rpc-never-called.txt"), typesRpcNeverCalled.join("\n") + "\n");
fs.writeFileSync(path.join(inv, "nav-not-in-primary-modules.txt"), navNotInPrimary.join("\n") + "\n");
fs.writeFileSync(path.join(inv, "primary-not-in-nav.txt"), primaryNotInNav.join("\n") + "\n");

const primarySrc = fs.readFileSync(
  path.join(root, "src/components/layout/primary-modules.ts"),
  "utf8",
);
const primaryPaths = [
  ...primarySrc.matchAll(/"(\/[^"]+)"/g),
]
  .map((m) => m[1])
  .filter((v, i, a) => a.indexOf(v) === i);
fs.writeFileSync(path.join(inv, "primary-module-paths.txt"), primaryPaths.join("\n") + "\n");
const primarySet2 = new Set(primaryPaths);
fs.writeFileSync(
  path.join(inv, "nav-not-in-primary-modules.txt"),
  nav.filter((n) => !primarySet2.has(n)).join("\n") + "\n",
);
fs.writeFileSync(
  path.join(inv, "primary-not-in-nav.txt"),
  primaryPaths.filter((p) => !navSet.has(p)).join("\n") + "\n",
);

console.log(
  JSON.stringify(
    {
      tables: tables.length,
      views: views.length,
      fns: fns.length,
      from: from.length,
      rpc: rpc.length,
      routes: routes.length,
      nav: nav.length,
      primary: primary.length,
      invoicesInTypes: tableSet.has("invoices"),
      invoicesFrom: fromSet.has("invoices"),
      queriedMissing: queriedMissing.length,
      typesNeverFrom: typesNeverFrom.length,
      rpcMissingInTypes,
      navNotInPrimary: navNotInPrimary.length,
      primaryNotInNav,
    },
    null,
    2,
  ),
);
