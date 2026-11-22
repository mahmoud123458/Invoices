# MongoDB to Supabase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all backend persistence to Supabase, import existing MongoDB business data, and remove MongoDB/local JSON from application runtime.

**Architecture:** Keep the current Express API and custom JWTs. Controllers use the existing server-only Supabase client, normalized tables, and SQL RPCs for atomic multi-row operations. A separate idempotent CLI imports MongoDB records before a maintenance-window cutover.

**Tech Stack:** TypeScript, Express, `@supabase/supabase-js`, PostgreSQL/pgTAP, Node.js test runner, MongoDB Node driver for the one-time importer.

**Spec:** `docs/superpowers/specs/2026-11-21-supabase-persistence-design.md`

## Global Constraints

- Preserve existing HTTP routes, response shapes, `_id` references, roles, and custom JWT authentication.
- Import existing MongoDB records and retain their IDs and relationships.
- Use only the backend `SUPABASE_SERVICE_ROLE_KEY`; never expose it to the frontend.
- Do not dual-write. Stop application writes for the final import and traffic switch.
- MongoDB is authoritative for conflicting `external_id` values during import.
- Rollback is supported only before Supabase accepts new writes.
- Keep multi-row invoice and purchase-order operations atomic in SQL.
- Never delete MongoDB source rows or automatically clear Supabase rows.

## Review Focus

- **Missing production Supabase credentials:** startup fails with a clear configuration error; test in Task 4.
- **Duplicate/parallel purchase-order approval:** inventory is updated exactly once; test in Task 1.
- **Partially imported nested records or broken references:** retry is safe and invalid relations are reported without silently losing records; test in Task 3.
- **Conflicting Supabase rows:** imported Mongo values win without deleting unrelated Supabase rows; test in Task 3.
- **Legacy API mapping for payments, optional references, and date boundaries:** response contracts and finance totals remain correct; tests in Tasks 1 and 2.

---

### Task 1: Finish Supabase Purchase-Order Operations

**Files:**
- Modify: `backend/supabase/schema.sql`
- Create: `backend/supabase/migrations/202611210002_purchase_order_creation.sql`
- Create: `backend/supabase/tests/purchase_orders.pgtap.sql`
- Modify: `backend/src/controllers/purchaseOrderController.ts`
- Create: `backend/test/purchase-order-controller.test.cjs`

**Interfaces:**
- Consume: `supabase` from `backend/src/config/supabase.ts`; `AuthRequest.user._id` as the actor's `external_id`.
- Produce: SQL RPC `public.create_purchase_order_with_items(p_order jsonb, p_items jsonb) returns jsonb`; use existing `public.approve_purchase_order(text, text)` and return the current API's nested purchase-order shape.

- [ ] **Step 1: Add failing pgTAP cases** for successful order/item creation, missing product rollback, approval adding stock once, and rejection of a repeated approval.
- [ ] **Step 2: Run the focused pgTAP file** against a local Supabase/Postgres test database and confirm the new RPC tests fail because the creation function is missing.
- [ ] **Step 3: Implement the creation RPC** in the incremental migration and mirror it in `schema.sql`; keep inserts and sequence-backed order numbering in one transaction.
- [ ] **Step 4: Add failing controller tests** for list/detail/create/approve/reject response shape, status filtering, and missing orders.
- [ ] **Step 5: Rewrite `purchaseOrderController.ts`** to use Supabase queries/RPCs, map snake_case fields and child items to existing camelCase API records, and map database errors to existing HTTP responses.
- [ ] **Step 6: Run `npm test` and the focused pgTAP file**; verify order creation and approval do not partially modify inventory.

### Task 2: Move Expenses and Finance Summary to Supabase

**Files:**
- Modify: `backend/src/controllers/expenseController.ts`
- Modify: `backend/src/controllers/financeController.ts`
- Create: `backend/test/expense-controller.test.cjs`
- Create: `backend/test/finance-controller.test.cjs`

**Interfaces:**
- Consume: `supabase` from `backend/src/config/supabase.ts`; `expenses` and `invoice_payments` tables.
- Produce: Existing expense API response shape (`_id`, `paymentMethod`, populated `createdBy`) and unchanged financial-summary response fields.

- [ ] **Step 1: Add failing expense tests** for date/category filters, CRUD, populated actor, invalid dates, and missing IDs.
- [ ] **Step 2: Run the focused expense tests** and confirm they fail against the current Mongoose implementation.
- [ ] **Step 3: Rewrite expense queries** using `external_id`, `expense_date`, and snake_case columns; preserve validation and API mapping.
- [ ] **Step 4: Add failing finance tests** for invoice-date totals, payment-date cashflow, sent outstanding invoices, expense totals/categories, and inclusive date boundaries.
- [ ] **Step 5: Run the focused finance tests** and confirm they exercise the current Mongoose-only data path.
- [ ] **Step 6: Rewrite finance data loading** to fetch invoices with related clients/payments and date-filtered expenses from Supabase, then preserve existing aggregation and output shape.
- [ ] **Step 7: Run expense and finance tests plus `npm test`**; verify errors are surfaced and no Mongo model imports remain in these controllers.

### Task 3: Add a Safe, Repeatable MongoDB Importer

**Files:**
- Create: `backend/scripts/migrateMongoToSupabase.cjs`
- Create: `backend/scripts/mongoImportMapping.cjs`
- Create: `backend/test/mongo-import.test.cjs`
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`

**Interfaces:**
- Consume: `MONGODB_URI`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` from the process environment.
- Produce: CLI `npm run migrate:mongodb`; mapping functions exported by `mongoImportMapping.cjs` for deterministic, fixture-based tests.

- [ ] **Step 1: Add failing importer mapping tests** for all ten tables, Mongo ObjectId/string ID preservation, nested invoice/PO children, payments, and nullable references.
- [ ] **Step 2: Add failing importer behavior tests** for Mongo-authoritative conflicts, repeat runs, invalid references, bounded batches, and sanitized progress/error output.
- [ ] **Step 3: Run the focused importer tests** and confirm missing mappings and unsafe conflict behavior fail.
- [ ] **Step 4: Implement table and relationship mapping** for users, clients, products, shipping companies, invoices/items/payments, purchase orders/items, and expenses.
- [ ] **Step 5: Implement the CLI** with credential validation, dependency-ordered batches, upserts on `external_id`, per-parent child replacement, sequence alignment, and source/imported/skipped/failed counts; never delete from MongoDB or unrelated Supabase rows.
- [ ] **Step 6: Register `migrate:mongodb` and the MongoDB driver as migration-only tooling**; keep the importer separate from backend startup.
- [ ] **Step 7: Run importer tests** and verify a second import produces no duplicate children and conflicting imported rows match MongoDB.

### Task 4: Replace Startup/Seed with Supabase and Remove Runtime MongoDB

**Files:**
- Modify: `backend/src/index.ts`
- Modify: `backend/src/seed.ts`
- Modify: `backend/src/config/supabase.ts`
- Delete after references are removed: `backend/src/config/db.ts`
- Delete after references are removed: `backend/src/models/*.ts`
- Delete after references are removed: `backend/src/storage/localStore.ts`
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Modify: `backend/test/db.test.cjs`
- Modify: `backend/test/supabase-seed.test.ts`
- Create: `backend/test/startup-supabase.test.cjs`

**Interfaces:**
- Consume: `isSupabaseConfigured` and the server-only Supabase client; `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` for empty-production bootstrap.
- Produce: Idempotent `seedData(clean?: boolean)` backed by Supabase and production startup that refuses missing/invalid Supabase configuration without falling back to local JSON.

- [ ] **Step 1: Add failing startup/config tests** for missing production URL/service key, successful configured startup, and idempotent initial administrator creation.
- [ ] **Step 2: Run the focused tests** and confirm production still permits the current Mongo/local fallback.
- [ ] **Step 3: Move startup and seed operations to Supabase**; preserve development demo data and create the configured initial administrator only when no users exist.
- [ ] **Step 4: Replace Mongo-specific tests** with Supabase configuration/startup tests and ensure all CommonJS and TypeScript tests are included by `npm test`.
- [ ] **Step 5: Remove model proxies, local JSON runtime storage, Mongo connection setup, Mongoose, and `mongodb-memory-server` from application dependencies.** Keep MongoDB driver tooling only for the importer.
- [ ] **Step 6: Run `npm run build` and `npm test`**; use ripgrep to confirm application startup, controllers, and runtime dependencies no longer reference Mongoose or `localStore`.

### Task 5: Document Configuration, Import, and Cutover

**Files:**
- Modify: `README.md`
- Modify: `DEPLOYMENT.md`
- Modify: `backend/.env.example`
- Review: `run-backend.bat`
- Review: `seed-db.bat`

**Interfaces:**
- Document the required production variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, and the optional initial-admin values.
- Document `npm run migrate:mongodb`, a short write-freeze/import/verification/switch sequence, and the pre-write rollback boundary.

- [ ] **Step 1: Replace MongoDB setup instructions** with Supabase project/schema/migration and backend environment configuration.
- [ ] **Step 2: Document the import procedure** including credential handling, source MongoDB preservation, count/reference verification, and the maintenance window.
- [ ] **Step 3: Document cutover and rollback**; state that no automatic rollback is available after new Supabase writes begin.
- [ ] **Step 4: Run `git diff --check`, `npm run build`, and `npm test`**; verify documentation does not instruct users to expose the service-role key or run production with local JSON.
