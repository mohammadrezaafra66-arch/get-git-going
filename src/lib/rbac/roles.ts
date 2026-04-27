export type AppRole = "admin" | "manager" | "sales" | "accountant" | "viewer";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "مدیر کل",
  manager: "مدیر بخش",
  sales: "فروشنده",
  accountant: "حسابدار",
  viewer: "بیننده",
};

export const ALL_ROLES: AppRole[] = ["admin", "manager", "sales", "accountant", "viewer"];

export type ModuleKey =
  | "products"
  | "pricing"
  | "purchases"
  | "sales"
  | "invoices"
  | "price-lists"
  | "users"
  | "roles"
  | "reports"
  | "knowledge"
  | "feedback"
  | "messages"
  | "dashboard"
  | "audit-logs"
  | "data-tables"
  | "bot-api-keys"
  | "suppliers"
  | "academy";

export type Action = "view" | "create" | "update" | "delete";

/** ماتریس دسترسی نقش-محور. */
export const PERMISSIONS: Record<ModuleKey, Record<Action, AppRole[]>> = {
  dashboard:    { view: ALL_ROLES, create: [], update: [], delete: [] },
  products:     { view: ALL_ROLES, create: ["admin","manager"], update: ["admin","manager"], delete: ["admin"] },
  pricing:      { view: ["admin","manager","accountant"], create: ["admin","manager","accountant"], update: ["admin","manager","accountant"], delete: ["admin"] },
  purchases:    { view: ["admin","manager","accountant","viewer"], create: ["admin","manager"], update: ["admin","manager"], delete: ["admin"] },
  sales:        { view: ALL_ROLES, create: ["admin","manager","sales"], update: ["admin","manager","sales"], delete: ["admin"] },
  invoices:     { view: ALL_ROLES, create: ["admin","manager","sales"], update: ["admin","manager","sales"], delete: ["admin"] },
  "price-lists":{ view: ALL_ROLES, create: ["admin","manager"], update: ["admin","manager"], delete: ["admin"] },
  users:        { view: ["admin"], create: ["admin"], update: ["admin"], delete: ["admin"] },
  roles:        { view: ["admin"], create: ["admin"], update: ["admin"], delete: ["admin"] },
  reports:      { view: ALL_ROLES, create: [], update: [], delete: [] },
  knowledge:    { view: ALL_ROLES, create: ["admin","manager"], update: ["admin","manager"], delete: ["admin"] },
  feedback:     { view: ALL_ROLES, create: ALL_ROLES, update: ["admin"], delete: ["admin"] },
  messages:     { view: ALL_ROLES, create: ALL_ROLES, update: ALL_ROLES, delete: ["admin"] },
  "audit-logs": { view: ["admin"], create: [], update: [], delete: [] },
  "data-tables": {
    view: ["admin","manager","accountant","viewer"],
    create: ["admin","manager"],
    update: ["admin","manager"],
    delete: ["admin"],
  },
  "bot-api-keys": {
    view: ["admin","manager"],
    create: ["admin","manager"],
    update: ["admin","manager"],
    delete: ["admin","manager"],
  },
  suppliers: {
    view: ["admin","manager","accountant"],
    create: ["admin","accountant"],
    update: ["admin","accountant"],
    delete: ["admin"],
  },
  academy: {
    view: ALL_ROLES,
    create: ["admin","manager"],
    update: ["admin","manager"],
    delete: ["admin","manager"],
  },
};

export function hasPermission(roles: AppRole[], module: ModuleKey, action: Action): boolean {
  if (roles.includes("admin")) return true;
  return PERMISSIONS[module][action].some((r) => roles.includes(r));
}

export function hasAnyRole(roles: AppRole[], allowed: AppRole[]): boolean {
  return roles.some((r) => allowed.includes(r));
}