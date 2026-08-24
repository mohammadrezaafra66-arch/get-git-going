import fs from "node:fs";
import path from "node:path";

/**
 * M6 — derive the guarded accounting routes from the filesystem instead of hardcoding them.
 *
 * The first version of `m6-route-guard.spec.ts` listed thirteen paths by hand. An independent
 * review defeated it with the obvious move: **add a new route that calls a guard but carries no
 * `staticData`, and every assertion stays green while the route is fail-open.** Demonstrated on
 * routes that already exist — `sales` cold-loads `/admin/audit` and `/admin/documents` in full.
 *
 * A hand-written list can only ever assert about routes someone remembered to add to it. This
 * module reads the route directory instead, so a new `_app.accounting.*` route is covered the
 * moment it exists rather than the moment someone updates a test.
 *
 * Scope is deliberately `_app.accounting.*`. The other 136 guarded routes are OG-41/OG-42 and
 * are knowingly still fail-open; asserting over them here would make this gate red for a
 * decision the owner has not taken.
 */

const ROUTES_DIR = path.resolve(process.cwd(), "src/routes");
const ACCOUNTING = /^_app\.accounting\..+\.tsx$/;

export interface AccountingRoute {
  file: string;
  /** URL path, or null when the route takes a parameter and cannot be cold-loaded blind */
  url: string | null;
  /** roles named in the route's own `requireAnyRole(...)`, resolved through any local const */
  guardRoles: string[] | null;
  /** roles named in the route's `staticData.gate.allowed` */
  staticRoles: string[] | null;
  /** true when the file calls any guard at all */
  guarded: boolean;
}

function fileToUrl(file: string): string | null {
  const base = file.replace(/\.tsx$/, "");
  if (base.includes("$")) return null; // parameterised — needs a real id, handled separately
  const segments = base
    .split(".")
    .slice(1) // drop the leading `_app`
    .map((s) => s.replace(/_$/, "")); // `receipts_` is a layout-escape marker, not a path segment
  return "/" + segments.join("/");
}

function listFromMatch(src: string, raw: string): string[] | null {
  const inner = raw.trim();
  if (inner.startsWith("...")) {
    // e.g. `[...CREATE_ROLES]` — resolve the local const rather than giving up
    const name = inner.slice(3).trim();
    const m = src.match(new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`));
    if (!m) return null;
    raw = m[1];
  }
  return raw
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

export function readAccountingRoutes(): AccountingRoute[] {
  return fs
    .readdirSync(ROUTES_DIR)
    .filter((f) => ACCOUNTING.test(f))
    .sort()
    .map((file) => {
      const src = fs.readFileSync(path.join(ROUTES_DIR, file), "utf8");
      const guarded = /require(AnyRole|Permission|Admin)\s*\(/.test(src);
      const g = src.match(/requireAnyRole\(\[([^\]]*)\]/);
      const s = src.match(/staticData:\s*\{\s*gate:\s*\{\s*kind:\s*"anyRole",\s*allowed:\s*\[([^\]]*)\]/);
      return {
        file,
        url: fileToUrl(file),
        guardRoles: g ? listFromMatch(src, g[1]) : null,
        staticRoles: s ? listFromMatch(src, s[1]) : null,
        guarded,
      };
    });
}
