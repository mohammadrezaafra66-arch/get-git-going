# AfraKala Web App Schematic

این شماتیک بر اساس ساختار فعلی کد در `app/src/routes`، `app/src/lib`، `primary-modules.ts` و اتصال Supabase تهیه شده است.

## 1. High-Level Architecture

```mermaid
flowchart TB
  U["کاربران وب اپ\nAdmin / Manager / Sales / Accountant / Viewer"]
  Browser["Browser / LAN URL\nReact + TanStack Start"]
  Router["TanStack Router\nfile-based routes"]
  Shell["AppShell\nSidebar / Topbar / Mobile Nav"]
  Auth["AuthProvider + Route Guards\nSession / Profile / Roles / Permissions"]
  Query["TanStack Query\nClient cache / invalidation / realtime refresh"]
  UI["UI Components\nRadix + Tailwind + Forms + Dialogs"]
  Lib["Domain Libraries\npricing / products / sales / accounting / automation"]
  SupaClient["Supabase Client\nVITE_SUPABASE_URL + Publishable Key"]
  Supabase["Supabase Backend\nAuth + Postgres + RLS + RPC + Realtime"]
  DB["Postgres Tables\nproducts / prices / sales / accounting / users / dynamic tables"]
  RPC["RPC Functions\nget_sales_search_products / pricing / capital / automation"]
  PublicApi["Public API Routes\nbot products / dynamic tables / market matches"]
  Worker["Automation / Bot / Pricing Worker\nserver hooks + cron-style scripts"]
  Storage["Storage / Files\nproduct images / receipts / docs"]

  U --> Browser
  Browser --> Router
  Router --> Shell
  Router --> Auth
  Shell --> UI
  UI --> Query
  Query --> Lib
  Lib --> SupaClient
  SupaClient --> Supabase
  Supabase --> DB
  Supabase --> RPC
  Supabase --> Storage
  PublicApi --> Supabase
  Worker --> PublicApi
  Worker --> Supabase
```

## 2. Primary Module Map

```mermaid
flowchart LR
  App["AfraKala App"]

  Dashboard["داشبورد\n/dashboard\nnotifications / tasks / daily mood"]
  Assistant["دستیار\nmarket intelligence / recommendations\nmarketing / messages / knowledge / academy"]
  Catalog["کالا\nproducts / categories / brands / labels\npurchase prices / pricing rules / sale lists"]
  Sales["فروش\nsales search / customers / quotes\ninvoices / stock alerts / credit / send queue"]
  Finance["مالی\nreceipts / receivables / payables\nbank accounts / capital allocations"]
  Analytics["تحلیل\nreports / quote logs / gamification\naudit logs / data tables"]
  Admin["مدیریت\nusers / roles / settings\ncurrencies / workflow / bot keys / feedback"]

  App --> Dashboard
  App --> Assistant
  App --> Catalog
  App --> Sales
  App --> Finance
  App --> Analytics
  App --> Admin
```

## 3. Authentication And Authorization Flow

```mermaid
sequenceDiagram
  participant User as کاربر
  participant Route as /_app route guard
  participant Auth as AuthProvider
  participant Supabase as Supabase Auth/Profile/Roles
  participant Page as Protected Page

  User->>Route: open protected route
  Route->>Auth: ensureAuthReady()
  Auth->>Supabase: get session + profile + roles
  Supabase-->>Auth: user/profile/roles/status
  Auth-->>Route: auth snapshot
  alt no user
    Route-->>User: redirect /login
  else inactive profile
    Route-->>User: redirect /pending-approval
  else lacks permission
    Page-->>User: /unauthorized or hidden actions
  else allowed
    Route->>Page: render inside AppShell
  end
```

## 4. Product And Pricing Flow

```mermaid
flowchart TB
  Products["Products\nمحصولات، برند، دسته، ویژگی، برچسب"]
  PurchasePrices["Purchase Prices\nقیمت خرید و تأمین‌کننده"]
  Currency["Currencies + Market Rates\nنرخ ارز / منابع نرخ"]
  Rules["Pricing Rules\nقوانین قیمت‌گذاری / تسویه / حمل"]
  Compute["Price Computation\ncomputed prices + history"]
  SaleTypes["Sale Price Types\nنوع‌های قیمت فروش"]
  SaleLists["Sale Lists\nلیست فروش عمومی/داخلی"]
  SalesSearch["Quick Sales Search\n/sales/search"]
  PublicSaleList["Public Sale List\n/public/sale-lists/:id"]
  Alerts["Price Alerts / Attention\nهشدار قیمت و فرصت جبران"]

  Products --> PurchasePrices
  PurchasePrices --> Compute
  Currency --> Compute
  Rules --> Compute
  SaleTypes --> Compute
  Compute --> SalesSearch
  Compute --> SaleLists
  SaleLists --> PublicSaleList
  Compute --> Alerts
```

## 5. Sales Workflow

```mermaid
flowchart TB
  Search["جستجوی سریع فروش\n/sales/search"]
  Customer["Customers / Persons\nمشتری و اشخاص"]
  Quote["Sales Quotes\nپیش‌فاکتور"]
  Share["Quote Share + Send Queue\nارسال و لاگ اشتراک"]
  Invoice["Invoices\nفاکتور فروش"]
  Waybill["Waybill / Delivery Receipt\nبارنامه و رسید تحویل"]
  StockAlert["Stock Alerts\nدرخواست اطلاع موجودی"]
  Credit["Credit Customers / Credit Rules\nاعتبار مشتری"]
  Accounting["Accounting\nreceivables / receipts"]

  Search --> Quote
  Search --> StockAlert
  Customer --> Quote
  Credit --> Quote
  Quote --> Share
  Quote --> Invoice
  Invoice --> Waybill
  Invoice --> Accounting
```

## 6. Admin And Configuration Surface

```mermaid
flowchart LR
  Admin["Admin / Manager"]
  Users["Users / Pending Users"]
  RBAC["Roles / Permissions"]
  Settings["General Settings"]
  Workflow["Workflow Stages / Validation Rules"]
  Fields["Profile / Receipt / Waybill Fields"]
  PricingConfig["Currency / Settlement / Shipping / Change Reasons"]
  BotKeys["Bot API Keys + Docs + Playground"]
  Reminders["Sales Reminders\n/admin/sales-reminders"]
  Feedback["Feedback / Support"]

  Admin --> Users
  Admin --> RBAC
  Admin --> Settings
  Admin --> Workflow
  Admin --> Fields
  Admin --> PricingConfig
  Admin --> BotKeys
  Admin --> Reminders
  Admin --> Feedback
```

## 7. External And Automation Interfaces

```mermaid
flowchart TB
  Bot["External Bot / Integration Client"]
  ApiKeys["Bot API Keys"]
  PublicRoutes["Public API Routes\n/api/public/bot/*"]
  DynamicTables["Dynamic Tables\nrows / upsert / by slug"]
  MarketMatches["Market Matches\nresolve / candidates"]
  ProductsApi["Products API\nproducts + product detail"]
  Automation["Automation Queue\nTorob / pricing worker hooks"]
  Supabase["Supabase\nRLS + RPC + tables"]

  Bot --> ApiKeys
  ApiKeys --> PublicRoutes
  PublicRoutes --> ProductsApi
  PublicRoutes --> DynamicTables
  PublicRoutes --> MarketMatches
  PublicRoutes --> Supabase
  Automation --> PublicRoutes
  Automation --> Supabase
```

## 8. Main Data Domains

```mermaid
erDiagram
  USERS ||--o{ USER_ROLES : has
  USERS ||--o{ SALES_QUOTES : creates
  USERS ||--o{ RECEIPTS : reviews
  PRODUCTS ||--o{ PURCHASE_PRICES : has
  PRODUCTS ||--o{ PRODUCT_COMPUTED_PRICES : has
  PRODUCTS ||--o{ PRODUCT_SALE_PRICE_HISTORY : logs
  PRODUCTS ||--o{ PRODUCT_LABEL_LINKS : tagged
  PRODUCT_LABELS ||--o{ PRODUCT_LABEL_LINKS : assigned
  BRANDS ||--o{ PRODUCTS : groups
  CATEGORIES ||--o{ PRODUCTS : groups
  CUSTOMERS ||--o{ SALES_QUOTES : receives
  SALES_QUOTES ||--o{ SALES_QUOTE_ITEMS : contains
  SALES_QUOTES ||--o{ SALES_QUOTE_SHARE_LOGS : shared
  SALES_QUOTES ||--o{ SALES_QUOTE_SEND_QUEUE : queued
  SALES_QUOTES ||--o{ INVOICES : converted
  INVOICES ||--o{ RECEIVABLES : creates
  INVOICES ||--o{ WAYBILLS : ships
  PURCHASES ||--o{ PAYABLES : creates
  BANK_ACCOUNTS ||--o{ RECEIPTS : receives
```

## 9. Important Notes From Current Code

- Frontend framework: React 19 + TanStack Start/Router + TanStack Query.
- UI stack: Tailwind CSS, Radix UI, lucide-react, sonner.
- Backend: Supabase Auth, Postgres, RLS policies, RPC functions, realtime subscriptions.
- Protected app routes live under `/_app`.
- Public entry points include `/login`, `/register`, `/public/sale-lists/:listId`, `/api/public/bot/*`.
- Seven primary navigation modules are defined in `src/components/layout/primary-modules.ts`.
- Route-level permissions use `requirePermission` / `requireAnyRole`.
- The pricing/sales pages heavily depend on RPC functions such as `get_sales_search_products`.
- Bot and automation integrations are exposed through API routes and Supabase-backed keys/queues.

