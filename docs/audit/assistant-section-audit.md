# دستیار (Assistant) section — full audit

**Date:** 2026-08-07 · **HEAD at start:** `738aad6924160aba4c5b7b31fa817c4313488fb3` · Read-only, no code changed.

Scope: the live sidebar section labelled `دستیار`, its direct routes, its reachable subroutes/actions, and assistant/AI-adjacent capabilities discovered outside the section. The only repository change made for this task is this report file.

## 1. Section inventory

The actual visible sidebar section is not driven directly by `src/lib/navigation/registry.ts`; it is driven by `PRIMARY_MODULES` in `src/components/layout/primary-modules.ts`. The `assistant` module is labelled `دستیار`, uses `Sparkles`, defaults to `/pricing/market-intelligence`, and lists nine paths: `src/components/layout/primary-modules.ts:45` through `src/components/layout/primary-modules.ts:58`. `AppSidebar` builds the visible submenu with `itemsForModule(activeModule, visible)`: `src/components/layout/AppSidebar.tsx:103`, and `itemsForModule` preserves `PRIMARY_MODULES.paths` order while filtering against visible registry entries: `src/components/layout/primary-modules.ts:193` through `src/components/layout/primary-modules.ts:206`.

| Label | Sidebar route | Registry module / visibility | Route file |
|---|---|---|---|
| هوشمند بازار | `/pricing/market-intelligence` | `pricing`; role allowlist `admin, manager, accountant` (`src/lib/navigation/registry.ts:193`, `src/lib/navigation/registry.ts:1295`) | `src/routes/_app.pricing.market-intelligence.tsx` |
| پیشنهاد محصولات | `/pricing/product-recommendations` | `products`; `adminOnly: true` plus role allowlist `admin, manager` (`src/lib/navigation/registry.ts:201`, `src/lib/navigation/registry.ts:1296`) | `src/routes/_app.pricing.product-recommendations.tsx` |
| هشدارهای قیمت | `/pricing/price-alerts` | `pricing`; dynamic permission (`src/lib/navigation/registry.ts:185`) | `src/routes/_app.pricing.price-alerts.tsx` |
| پیشنهادهای تبلیغاتی | `/marketing/suggestions` | `reports`; dynamic permission (`src/lib/navigation/registry.ts:594`) | `src/routes/_app.marketing.suggestions.tsx` |
| تاریخچه پیشنهادها | `/marketing/suggestions-history` | `reports`; dynamic permission (`src/lib/navigation/registry.ts:601`) | `src/routes/_app.marketing.suggestions-history.tsx` |
| وظایف بازاریابی من | `/marketing/my-tasks` | `reports`; dynamic permission (`src/lib/navigation/registry.ts:613`) | `src/routes/_app.marketing.my-tasks.tsx` |
| پیام‌رسان | `/messages` | `messages`; dynamic permission (`src/lib/navigation/registry.ts:648`) | `src/routes/_app.messages.tsx` |
| دانش سازمانی | `/knowledge` | `knowledge`; dynamic permission (`src/lib/navigation/registry.ts:622`) | `src/routes/_app.knowledge.tsx` |
| آکادمی | `/academy` | `academy`; dynamic permission (`src/lib/navigation/registry.ts:629`) | `src/routes/_app.academy.tsx` |

Registry drift: `src/lib/navigation/registry.ts` also assigns `/updates` to the assistant primary module (`src/lib/navigation/registry.ts:1111` through `src/lib/navigation/registry.ts:1121`), but the visible sidebar list in `PRIMARY_MODULES` omits it. `/updates` exists and is registered (`src/lib/navigation/registry.ts:636`, `src/routes/_app.updates.tsx:24`), so this is a discoverability/ownership mismatch rather than a 404.

Live permission verification: every module touched by the direct assistant section has explicit `role_permissions` rows. Read-only SQL result on test LAN returned seven rows each for `academy`, `knowledge`, `messages`, `platform-releases`, `pricing`, `products`, and `reports`. This matters because the live `has_dynamic_permission(uuid,text,text)` falls back broadly for a module with no rows: for `view`, it returns true for `admin, manager, accountant, sales, viewer` after `_exists` is false.

## 2. Per-page backend map

| Page | Backend calls and dependencies | Live existence / render risk |
|---|---|---|
| `/pricing/market-intelligence` | `fetchSalePriceTypes(true)` reads `sale_price_types`; market cards call `mi_get_trending_products`, `mi_get_price_movers`, `mi_get_market_index`, `mi_get_top_checked_today`, `mi_get_demand_growth`, `mi_get_emerging_products`, `mi_get_hot_brands`, `mi_get_hot_categories`, `mi_get_seller_top_products`: `src/lib/management/market-intelligence.ts:60` through `src/lib/management/market-intelligence.ts:204`. Summary cards read `market_rate_ticks`, `product_computed_prices_public`, and `purchase_prices`: `src/routes/_app.pricing.market-intelligence.tsx:178`, `src/routes/_app.pricing.market-intelligence.tsx:253`, `src/routes/_app.pricing.market-intelligence.tsx:310`. WhatsApp card calls server functions `fetchWhatsappTopProducts` and `fetchWhatsappMentioners`: `src/components/management/market-intelligence/WhatsappTopProductsCard.tsx:49`, `src/components/management/market-intelligence/WhatsappTopProductsCard.tsx:241`. | Live SQL found all `mi_*` RPCs, `market_rate_ticks`, `product_interaction_events`, `product_computed_prices_public`, `purchase_prices`, and `sale_price_types`. WhatsApp base is server-side and defaults/overrides via `WHATSAPP_PLATFORM_BASE_URL`: `src/lib/management/whatsapp-top-products.functions.ts:15`; live probe returned `WA_TOP_PRODUCTS_STATUS=200` and one row for `limit=1`. Page should render if the authenticated user has pricing/report permissions; WhatsApp degrades to a warning if the bridge is unavailable. |
| `/pricing/product-recommendations` | Product search reads `products` with `brands`/`categories`; recommendations call RPC `get_product_recommendations`; overrides read/write/delete `product_recommendation_overrides` and insert `audit_logs`: `src/lib/products/recommendations.ts:29`, `src/lib/products/recommendations.ts:97`, `src/lib/products/recommendations.ts:136`, `src/lib/products/recommendations.ts:147`, `src/lib/products/recommendations.ts:168`, `src/lib/products/recommendations.ts:185`, `src/lib/products/recommendations.ts:210`. | Live SQL found `get_product_recommendations`, `product_recommendation_overrides`, `products`, `brands`, `categories`, and `audit_logs`; RLS enabled on `product_recommendation_overrides`. Route has `requireAnyRole(["admin","manager"])`: `src/routes/_app.pricing.product-recommendations.tsx:40`. |
| `/pricing/price-alerts` | Rules and notifications use `price_alert_rules`, `price_alert_notifications`, joined `products` and `sale_price_types`, and audit inserts: `src/lib/pricing/price-alerts.ts:123`, `src/lib/pricing/price-alerts.ts:143`, `src/lib/pricing/price-alerts.ts:226`, `src/lib/pricing/price-alerts.ts:245`, `src/lib/pricing/price-alerts.ts:257`, `src/lib/pricing/price-alerts.ts:277`. Dialog searches products and price types: `src/components/pricing/price-alerts/PriceAlertDialog.tsx:89`, `src/components/pricing/price-alerts/PriceAlertDialog.tsx:216`. | Live SQL found both alert tables and supporting tables; RLS enabled. Route guard allows `admin, manager, accountant, sales`: `src/routes/_app.pricing.price-alerts.tsx:30`. |
| `/marketing/suggestions` | Reads `marketing_channels`; calls RPC `compute_promotion_scores`; marks a row used through server function `markPromotionSuggestionUsed`: `src/routes/_app.marketing.suggestions.tsx:91`, `src/routes/_app.marketing.suggestions.tsx:123`, `src/routes/_app.marketing.suggestions.tsx:148`. | Live SQL found `marketing_channels` and `compute_promotion_scores`; active channel count is 56. Render/action risk is permission mismatch: navigation is `reports.view`, while component allows only `admin, manager, accountant`: `src/routes/_app.marketing.suggestions.tsx:80` through `src/routes/_app.marketing.suggestions.tsx:82`; live `reports` row grants `viewer` and `sales` view. |
| `/marketing/suggestions-history` | Reads `marketing_channels`, `audit_logs` where `action='promotion_suggestion_used'`, then `profiles`: `src/routes/_app.marketing.suggestions-history.tsx:51`, `src/routes/_app.marketing.suggestions-history.tsx:75`, `src/routes/_app.marketing.suggestions-history.tsx:101`. | Live SQL found all tables; RLS enabled on `marketing_channels` and `audit_logs`. Same permission mismatch: component allows only `admin, manager`: `src/routes/_app.marketing.suggestions-history.tsx:33` through `src/routes/_app.marketing.suggestions-history.tsx:34`, while navigation uses broad `reports.view`. |
| `/marketing/my-tasks` | Reads current user rows from `tasks`; completes via RPC `complete_marketing_task`: `src/routes/_app.marketing.my-tasks.tsx:67`, `src/routes/_app.marketing.my-tasks.tsx:97`. | Live SQL found `tasks` and `complete_marketing_task`; RLS enabled on `tasks`. Route has no `beforeLoad` permission guard, but it queries `assigned_to=user.id` and the app shell is auth-gated. |
| `/messages` | Reads/writes `messenger_groups`, `messenger_messages`, `messenger_group_members`, `messenger_attachments`, `messenger_read_receipts`, `inquiries`, `ai_conversations`, `message_embeddings`, `profiles`; calls RPCs `create_messenger_group`, `deactivate_messenger_group`, `add_messenger_group_member`, `set_messenger_group_member_role`, `is_messenger_group_member`, `send_messenger_message`, `attach_messenger_file`, `create_inquiry`, `reply_inquiry`, `transfer_inquiry`, `search_messenger_messages_semantic`; uses Storage bucket `messenger-attachments`; uses Realtime subscription on `messenger_messages`: examples at `src/hooks/messenger/useMessengerGroups.ts:22`, `src/hooks/messenger/useMessengerMessages.ts:31`, `src/hooks/messenger/useMessengerMessages.ts:48`, `src/components/messenger/MessageComposer.tsx:44`, `src/components/messenger/MessageComposer.tsx:84`, `src/lib/messenger/inquiries.functions.ts:38`, `src/lib/messenger/embeddings.functions.ts:186`. | Live SQL found the tables and the listed RPCs; RLS enabled on messenger/inquiry/AI tables. `afrakala-lan-web`, `afrakala-lan-db`, `afrakala-lan-rest`, `afrakala-lan-auth`, `afrakala-lan-storage`, and `afrakala-lan-kong` were up, with web healthy. The route guard is `requirePermission("messages","view")`: `src/routes/_app.messages.tsx:25`. Feature risk: semantic search is likely disabled/broken because `message_embeddings` requires 1536 dimensions while the only active embeddings-capable live provider is Ollama `bge-m3:latest`; code explicitly states LAN Ollama returns 1024 and requires 1536 for messenger embeddings: `src/lib/messenger/embeddings.functions.ts:35` through `src/lib/messenger/embeddings.functions.ts:45`. Live provider rows show GPT lacks `embeddings` capability and Ollama has `embeddings`; the usage route `messenger_semantic_search.embeddings` is enabled with fallback and no pinned provider. |
| `/knowledge` | Reads `knowledge_documents`; `KnowledgeAskBox` calls `askKnowledge`; RAG embeds with `aiEmbed`, calls `search_knowledge_chunks_semantic`, then answers with `aiChat`: `src/routes/_app.knowledge.tsx:72`, `src/components/knowledge/KnowledgeAskBox.tsx:55`, `src/lib/knowledge/rag.functions.ts:162`, `src/lib/knowledge/rag.functions.ts:175`, `src/lib/knowledge/rag.functions.ts:207`. Manage/detail subroutes read/write `knowledge_documents`, `knowledge_confirmations`, `audit_logs`, and call `reindexKnowledgeDocuments` / `replace_knowledge_document_chunks`: `src/routes/_app.knowledge_.manage.tsx:55`, `src/routes/_app.knowledge_.manage.tsx:93`, `src/routes/_app.knowledge_.manage.tsx:182`, `src/routes/_app.knowledge_.$documentId.tsx:61`, `src/routes/_app.knowledge_.$documentId.tsx:74`. | Live SQL found `knowledge_documents`, `knowledge_document_chunks`, `knowledge_confirmations`, `replace_knowledge_document_chunks`, and `search_knowledge_chunks_semantic`; 139 chunks and one published document exist. Route guard is `requirePermission("knowledge","view")`: `src/routes/_app.knowledge.tsx:45`; management subroute uses `requireAnyRole(["admin","manager"])`: `src/routes/_app.knowledge_.manage.tsx:29`. |
| `/academy` | Reads `academy_courses`, `academy_lessons`, `academy_user_progress`; detail/lesson/quiz subroutes read `academy_quizzes`, `academy_quiz_questions_public`, and call `submit_quiz_attempt`; lesson completion upserts `academy_user_progress` and inserts `audit_logs`: `src/routes/_app.academy.tsx:32`, `src/routes/_app.academy.tsx:47`, `src/routes/_app.academy.tsx:60`, `src/routes/_app.academy_.$courseId_.$lessonId.tsx:61`, `src/routes/_app.academy_.$courseId_.$lessonId.tsx:72`, `src/routes/_app.academy_.$courseId_.$lessonId_.quiz.tsx:37`, `src/routes/_app.academy_.$courseId_.$lessonId_.quiz.tsx:55`. Manage subroute writes `academy_courses`, `academy_lessons`, `academy_quizzes`, `academy_quiz_questions`, and `audit_logs`: `src/routes/_app.academy_.manage.tsx:108`, `src/routes/_app.academy_.manage.tsx:184`, `src/routes/_app.academy_.manage.tsx:229`, `src/routes/_app.academy_.manage.tsx:248`. | Live SQL found academy tables, `academy_quiz_questions_public`, and `submit_quiz_attempt`; RLS enabled on academy tables. Route guard is `requirePermission("academy","view")`: `src/routes/_app.academy.tsx:18`; management subroute uses `requireAnyRole(["admin","manager"])`: `src/routes/_app.academy_.manage.tsx:20`. Live data has zero published courses, so the user-facing academy currently renders an empty state rather than content. |
| Registry-only `/updates` | Reads `platform_releases`; admin link reaches `/admin/platform-releases`, which creates/updates/deletes drafts and calls `publish_platform_release` / `archive_platform_release`: `src/routes/_app.updates.tsx:39`, `src/routes/_app.updates.tsx:52`, `src/lib/platform-releases/api.ts:65`, `src/lib/platform-releases/api.ts:115`, `src/lib/platform-releases/api.ts:145`, `src/lib/platform-releases/api.ts:167`, `src/lib/platform-releases/api.ts:173`, `src/lib/platform-releases/api.ts:180`. | Live SQL found `platform_releases`, `publish_platform_release`, and `archive_platform_release`; six published releases exist. Route guard is `requirePermission("platform-releases","view")`: `src/routes/_app.updates.tsx:26`. It is not visible under the actual sidebar `دستیار` section because of the inventory mismatch above. |

## 3. Button/action inventory

### Market intelligence

- Refresh button invalidates MI queries: `src/routes/_app.pricing.market-intelligence.tsx:64`.
- Range buttons change `days`: `src/routes/_app.pricing.market-intelligence.tsx:77` through `src/routes/_app.pricing.market-intelligence.tsx:82`.
- Sale price type select filters price movers through `fetchPriceMovers`: `src/lib/management/market-intelligence.ts:74`.
- WhatsApp search, limit, scope, and seller dialog controls call the upstream reporting server functions or local state only: `src/components/management/market-intelligence/WhatsappTopProductsCard.tsx:106`, `src/components/management/market-intelligence/WhatsappTopProductsCard.tsx:111`, `src/components/management/market-intelligence/WhatsappTopProductsCard.tsx:138`, `src/components/management/market-intelligence/WhatsappTopProductsCard.tsx:204`.

### Product recommendations

- Product picker searches `products`; select/clear is local state: `src/routes/_app.pricing.product-recommendations.tsx:90`, `src/routes/_app.pricing.product-recommendations.tsx:115`, `src/routes/_app.pricing.product-recommendations.tsx:161`.
- Pin/disable/delete/manual-add actions write `product_recommendation_overrides` and audit logs: `src/routes/_app.pricing.product-recommendations.tsx:211`, `src/routes/_app.pricing.product-recommendations.tsx:221`, `src/routes/_app.pricing.product-recommendations.tsx:230`, with DB functions in `src/lib/products/recommendations.ts:124` through `src/lib/products/recommendations.ts:187`.

### Price alerts

- Create/edit dialog saves rules through `createAlertRule` / `updateAlertRule`: `src/routes/_app.pricing.price-alerts.tsx:110`, `src/components/pricing/price-alerts/PriceAlertDialog.tsx:292`.
- Toggle, delete, mark-all-read, mark-read, and pagination are wired: `src/routes/_app.pricing.price-alerts.tsx:174`, `src/routes/_app.pricing.price-alerts.tsx:182`, `src/routes/_app.pricing.price-alerts.tsx:216`, `src/routes/_app.pricing.price-alerts.tsx:253`, `src/routes/_app.pricing.price-alerts.tsx:295`.

### Marketing

- Suggestions filters call `marketing_channels` and `compute_promotion_scores`; "ثبت به‌عنوان استفاده‌شده" calls `markPromotionSuggestionUsed`: `src/routes/_app.marketing.suggestions.tsx:91`, `src/routes/_app.marketing.suggestions.tsx:123`, `src/routes/_app.marketing.suggestions.tsx:148`.
- History filters page through `audit_logs`; previous/next buttons only move local page state: `src/routes/_app.marketing.suggestions-history.tsx:75`, `src/routes/_app.marketing.suggestions-history.tsx:217`, `src/routes/_app.marketing.suggestions-history.tsx:225`.
- My tasks "انجام شد" calls RPC `complete_marketing_task`: `src/routes/_app.marketing.my-tasks.tsx:97`, `src/routes/_app.marketing.my-tasks.tsx:178`.

### Messages

- New group calls `create_messenger_group`: `src/components/messenger/NewGroupDialog.tsx:28`.
- Select group is local state; admin deactivate calls `deactivate_messenger_group`: `src/components/messenger/ConversationsSidebar.tsx:73`, `src/hooks/messenger/useMessengerGroups.ts:87`.
- AI drawer opens locally, sends to `/api/messenger/ai-chat`, and clears `ai_conversations`: `src/components/messenger/ChatWindow.tsx:57`, `src/components/messenger/AiAssistantDrawer.tsx:76`, `src/hooks/messenger/useAiConversation.ts:39`.
- Members dialog reads `messenger_group_members`/`profiles`, adds/removes/role-changes via RPC/table writes: `src/components/messenger/GroupMembersDialog.tsx:81`, `src/components/messenger/GroupMembersDialog.tsx:133`, `src/components/messenger/GroupMembersDialog.tsx:150`, `src/components/messenger/GroupMembersDialog.tsx:166`.
- Composer sends text via `send_messenger_message`, uploads to Storage bucket `messenger-attachments`, attaches via `attach_messenger_file`, and removes Storage object on attach failure: `src/components/messenger/MessageComposer.tsx:44`, `src/components/messenger/MessageComposer.tsx:84`, `src/components/messenger/MessageComposer.tsx:102`, `src/components/messenger/MessageComposer.tsx:117`.
- Audio recorder is local capture UI; transcription is server-side optional and currently disabled live because `WHISPER_API_URL=UNSET`: `src/lib/messenger/transcribe.functions.ts:24` through `src/lib/messenger/transcribe.functions.ts:30`.
- Inquiry buttons create/reply/transfer inquiries through server functions and RPCs: `src/lib/messenger/inquiries.functions.ts:32`, `src/lib/messenger/inquiries.functions.ts:51`, `src/lib/messenger/inquiries.functions.ts:69`.
- Semantic search calls `semanticSearchMessenger`; target exists, but see the 1536/1024 provider mismatch in the issue list.

### Knowledge, academy, updates

- Knowledge ask calls `askKnowledge`; source links route to `/knowledge/$documentId`: `src/components/knowledge/KnowledgeAskBox.tsx:55`, `src/components/knowledge/KnowledgeAskBox.tsx:79`.
- Knowledge manage button routes to `/knowledge/manage`, whose create/edit/reindex actions write `knowledge_documents`, `audit_logs`, and `knowledge_document_chunks`: `src/routes/_app.knowledge.tsx:96`, `src/routes/_app.knowledge_.manage.tsx:93`, `src/routes/_app.knowledge_.manage.tsx:132`, `src/routes/_app.knowledge_.manage.tsx:182`.
- Knowledge document confirmation writes `knowledge_confirmations` and `audit_logs`: `src/routes/_app.knowledge_.$documentId.tsx:74`, `src/routes/_app.knowledge_.$documentId.tsx:79`.
- Academy manage button routes to `/academy/manage`; create/edit/delete course/lesson/quiz actions are wired to academy tables and audit logs: `src/routes/_app.academy.tsx:86`, `src/routes/_app.academy_.manage.tsx:108`, `src/routes/_app.academy_.manage.tsx:154`, `src/routes/_app.academy_.manage.tsx:184`, `src/routes/_app.academy_.manage.tsx:229`.
- Academy lesson completion writes `academy_user_progress` and `audit_logs`; quiz submit calls `submit_quiz_attempt`: `src/routes/_app.academy_.$courseId_.$lessonId.tsx:61`, `src/routes/_app.academy_.$courseId_.$lessonId_.quiz.tsx:55`.
- Updates retry refetches; admin management button routes to `/admin/platform-releases`; card expand is local state: `src/routes/_app.updates.tsx:52`, `src/routes/_app.updates.tsx:72`, `src/components/platform-releases/PlatformReleaseCard.tsx:49`.

## 4. Cross-cutting findings

### Duplicated or split capabilities

- Marketing suggestions and product recommendations are conceptually similar "assistant recommends what to push next" features, but they are not duplicate implementations: product recommendations use product-to-product override/RPC tables, while marketing suggestions score channel/product rows and audit "used" actions.
- `/marketing/my-tasks` and `/operations/tasks` are intentionally two views over the same `tasks` table. The page comment says this explicitly and forbids a second task table: `src/routes/_app.marketing.my-tasks.tsx:10` through `src/routes/_app.marketing.my-tasks.tsx:17`.
- AI provider management is outside the Assistant sidebar under administration: `/admin/ai-providers` is in navigation registry at `src/lib/navigation/registry.ts:998` and in the settings primary module at `src/components/layout/primary-modules.ts:158`. This is reasonable for admin-only configuration, but it is a scattered assistant dependency.
- Purchase advisor is outside the Assistant sidebar under operations even though its title is `دستیار هوشمند خرید` and it calls `generatePurchaseAdvice`: `src/routes/_app.operations.purchase-advisor.tsx:26`, `src/routes/_app.operations.purchase-advisor.tsx:87`, `src/lib/ai-tools/purchase-advisor.functions.ts:211`.
- Ad copy generation exists outside the direct section in `src/lib/ai-tools/ad-copy.functions.ts:47`; it is assistant-like capability but currently not inventoried by the Assistant sidebar.
- OCR/vision assistant capabilities exist outside the section in receipt OCR functions: `src/lib/receipt-ocr.functions.ts:199`, `src/lib/receipt-ocr-bytes.functions.ts:158`.
- WhatsApp demand data appears in market intelligence and is implemented as a read-only proxy to a separate platform: `src/lib/management/whatsapp-top-products.functions.ts:6` through `src/lib/management/whatsapp-top-products.functions.ts:16`.

### Broken navigation / inaccessible controls

- No direct 404 targets were found for the assistant routes and their visible internal links. The linked subroutes `/knowledge/manage`, `/knowledge/$documentId`, `/academy/manage`, `/academy/$courseId`, `/academy/$courseId/$lessonId`, `/academy/$courseId/$lessonId/quiz`, and `/admin/platform-releases` all have route files.
- The broken navigation risk is permission mismatch, not missing routes: marketing suggestions routes are visible through `reports.view`, but component-level guards reject roles that still receive the sidebar item.

### Permission gaps

- Direct assistant modules have explicit `role_permissions` rows. Live result: `academy=7`, `knowledge=7`, `messages=7`, `platform-releases=7`, `pricing=7`, `products=7`, `reports=7`.
- The risk model is real: live `has_dynamic_permission` grants broad fallback access when no module row exists. This audit did not find a missing row for the assistant modules, but any future assistant module must seed every role or it can accidentally open to broad roles.

### Service dependencies

- Web health check: `http://192.168.170.8:3100/api/healthz` returned HTTP 200 and body `{"ok":true,"status":"healthy",...}`.
- Docker state: `afrakala-lan-web` was `Up ... (healthy)`; `afrakala-lan-db`, `afrakala-lan-kong`, `afrakala-lan-storage`, `afrakala-lan-auth`, and `afrakala-lan-rest` were up.
- Ollama probe: `http://192.168.170.8:11434/api/tags` returned HTTP 200 with models `qwen2.5:14b`, `qwen2.5:7b`, `bge-m3:latest`, `qwen3.6:latest`.
- AI provider rows: live DB has active `gpt-messenger` (`openai_compatible`, priority 1, capabilities `{chat,vision}`, secret present) and active `ollama` (`ollama`, priority 10, capabilities `{chat,embeddings}`, no secret). No secret value was printed.
- WhatsApp reporting: `WHATSAPP_PLATFORM_BASE_URL=SET`; direct probe to `/api/v1/reporting/top-products?days=30&limit=1` returned HTTP 200 and one product row.
- Whisper transcription: `WHISPER_API_URL=UNSET`, so server function returns `{ ok:false, reason:"disabled" }` by design.

## 5. Prioritized issue list

### 🟠 Significant — `/updates` is assigned to Assistant in the registry but omitted from the actual Assistant sidebar

Evidence: `PRIMARY_MODULES.assistant.paths` stops at `/academy`: `src/components/layout/primary-modules.ts:50` through `src/components/layout/primary-modules.ts:58`. `PRIMARY_MODULE_PATHS.assistant` includes `/updates`: `src/lib/navigation/registry.ts:1111` through `src/lib/navigation/registry.ts:1121`. `/updates` itself exists and is guarded: `src/routes/_app.updates.tsx:24` through `src/routes/_app.updates.tsx:27`.

Impact: users and future agents get two contradictory truths about whether release notes belong to Assistant. Active module/search/grouping can diverge from visible navigation.

Fix direction: decide ownership. Either add `/updates` to `PRIMARY_MODULES.assistant.paths`, or remove it from `PRIMARY_MODULE_PATHS.assistant` and keep it only in its real visible module.

### 🟠 Significant — Marketing suggestion routes are visible to roles that the page immediately rejects

Evidence: registry seeds `/marketing/suggestions` and `/marketing/suggestions-history` as `reports` routes without route-specific allowlists: `src/lib/navigation/registry.ts:594`, `src/lib/navigation/registry.ts:601`. Live `role_permissions` grants `reports.can_view=true` to `viewer`, `sales`, and `purchase_specialist`. The suggestions page allows only `admin`, `manager`, `accountant`: `src/routes/_app.marketing.suggestions.tsx:80` through `src/routes/_app.marketing.suggestions.tsx:82`. The history page allows only `admin`, `manager`: `src/routes/_app.marketing.suggestions-history.tsx:33` through `src/routes/_app.marketing.suggestions-history.tsx:34`.

Impact: some users can see assistant menu entries that lead to `/unauthorized`. This is a UX break and a permissions-model smell.

Fix direction: align registry visibility with the component rules using route-specific allowlists or dedicated modules/permissions, then move the guard to `beforeLoad` for consistency with the rest of the section.

### 🟠 Significant — Messenger semantic search is wired but likely cannot produce/store embeddings in the current live provider configuration

Evidence: messenger semantic search requires `MESSAGE_EMBEDDING_DIMENSION = 1536`: `src/lib/messenger/embeddings.functions.ts:35` through `src/lib/messenger/embeddings.functions.ts:45`. Live AI rows show only Ollama has `embeddings`, with model `bge-m3:latest`; the same code comment states LAN Ollama `bge-m3` returns 1024 and is tried first. GPT has `text-embedding-3-small` in the row but its live `capabilities` are only `{chat,vision}`, so it is not selected for embeddings.

Impact: the search box and server function exist, but the feature likely returns `dimension_mismatch`/disabled instead of useful results. This does not block chat rendering.

Fix direction: either enable an embeddings-capable 1536-dimension provider for `messenger_semantic_search.embeddings`, or migrate/rebuild `message_embeddings` to the chosen local model dimension with explicit reindexing.

### 🟡 Minor — `/marketing/my-tasks` has no route `beforeLoad` guard

Evidence: route declaration only provides `component: MyMarketingTasksPage`: `src/routes/_app.marketing.my-tasks.tsx:219`; it reads `user?.id` and filters `tasks.assigned_to`: `src/routes/_app.marketing.my-tasks.tsx:40`, `src/routes/_app.marketing.my-tasks.tsx:73`. By contrast, messages/knowledge/academy use route guards: `src/routes/_app.messages.tsx:25`, `src/routes/_app.knowledge.tsx:45`, `src/routes/_app.academy.tsx:18`.

Impact: the app shell likely prevents anonymous access, and RLS/RPC should protect data, but the route is inconsistent with the section's stronger guard pattern.

Fix direction: add an explicit route guard matching the intended audience, or encode the intended visibility in registry/role permissions and document that every authenticated role may view only their own tasks.

### 🟡 Minor — Academy is structurally wired but currently has no published content

Evidence: live SQL count returned `academy_courses_published = 0`. The page handles this with an empty state: `src/routes/_app.academy.tsx:95` through `src/routes/_app.academy.tsx:100`.

Impact: not a code failure, but the Assistant section contains a visible capability that currently has no user-facing content.

Fix direction: either publish initial course content or hide/soft-label the module until content exists.

### 🟡 Minor — Voice transcription button path is optional and currently disabled

Evidence: live `WHISPER_API_URL=UNSET`. Server function returns disabled when the variable is absent: `src/lib/messenger/transcribe.functions.ts:24` through `src/lib/messenger/transcribe.functions.ts:30`.

Impact: audio messages can still be sent, but transcription will not work. This is an expected manual/optional fallback, not a page blocker.

Fix direction: configure a self-hosted or approved OpenAI-compatible Whisper endpoint if transcription is desired, and keep the disabled fallback visible/non-fatal.

## Summary — overall health + top 3 things to fix first

Overall health: **mostly wired, with two real navigation/permission drifts and one live AI capability mismatch**. The direct Assistant section routes exist, their main tables/RPCs exist live, RLS is enabled on sensitive tables checked, the test LAN web and Ollama services are reachable, and no missing route file/404 was found among direct assistant links.

Top 3 fixes:

1. Align `/updates` ownership between `PRIMARY_MODULES` and `PRIMARY_MODULE_PATHS`.
2. Align `/marketing/suggestions*` sidebar visibility with their actual role checks, preferably with `beforeLoad` route guards.
3. Fix messenger semantic search provider/dimension configuration so a visible search control does not silently degrade.

Validation not run by design: no typecheck, build, lint, e2e, migrations, deploy, or data mutations were run because this was a read-only audit. Live checks were limited to read-only catalog SQL, health probes, service reachability, and environment-variable presence checks without printing secret values.
