# MongoDB to Supabase Migration Design

## Status

Approved by user.

## Intent

Complete the backend cutover from MongoDB and the local JSON fallback to
Supabase Postgres. This addresses production auth failures caused by ephemeral
Vercel storage while preserving existing business data and the current frontend
API.

## Goals

- Store users, clients, products, shipping companies, invoices, invoice items,
  invoice payments, purchase orders, purchase-order items, and expenses in
  Supabase.
- Preserve existing HTTP routes, response shapes, `_id` references, roles,
  and custom JWT authentication so the frontend does not need a rewrite.
- Import existing MongoDB records and retain their IDs and relationships.
- Keep multi-row business operations atomic: invoice creation/update with stock,
  payment recording, and purchase-order approval with stock updates.
- Require the server-only Supabase service-role key in production; never expose
  it to the frontend.
- Remove MongoDB and local JSON storage from application runtime paths after
  the import tool is available.

## Non-goals

- Replacing the custom JWT login flow with Supabase Auth.
- Changing frontend behavior or redesigning the API.
- Deleting source MongoDB data or automatically clearing Supabase rows.
- Changing invoice, inventory, shipping, purchasing, or finance business rules
  except where needed to preserve them in Postgres.

## Current State and Constraints

- Supabase schema, seed data, relational RPCs, and RLS are already present.
- Auth, clients, products, shipping, and invoices have partially moved to
  Supabase. Expenses, finance summaries, purchase orders, startup
  initialization, and seeding still use Mongoose/local storage.
- The database uses `external_id` values for application references and
  snake_case columns. The API uses `_id` and camelCase fields.
- Invoice items/payments and purchase-order items are normalized into child
  tables, so API mapping must preserve their existing nested response shape.
- Invoice stock changes and purchase-order approvals must happen in SQL
  transactions rather than separate client requests.
- Tables have RLS enabled and forced with no public policies. The backend must
  use only the Supabase service-role key; browser clients must never receive it.
- Existing production MongoDB may be unavailable from this workspace. The
  import command must therefore be independently runnable in an environment
  that has both the source MongoDB URI and Supabase credentials.

## Approaches

1. **Native Supabase queries and transaction RPCs (selected).** Continue the
   existing migration style: controllers use Supabase queries, SQL functions
   own cross-row atomic operations, and API mappers preserve frontend contracts.
   This is the direct fit for the existing normalized schema and partial work.
2. **Mongoose-compatible adapter over Supabase (rejected).** This would retain
   Mongo-shaped query APIs, obscure relational transactions, and add an adapter
   layer while still requiring substantial behavioral emulation.

## Design

### Application persistence

- Configure one Supabase client in the backend using `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY`; fail clearly if either is missing in production.
- Convert remaining expense, finance, purchase-order, startup, and seed code to
  Supabase. Keep mapping of API IDs/field names consistent across all endpoints.
- Use SQL RPCs for state changes that span multiple rows. Preserve the existing
  invoice RPCs and add/use an atomic purchase-order creation/approval path where
  needed. Map expected database errors to the existing HTTP status/messages.
- Remove MongoDB model proxies, local JSON storage, MongoDB connection setup,
  and runtime dependency use once no application code depends on them.
- Keep the existing JWT signing and roles. Use imported Mongo `_id` strings as
  Supabase `external_id` values so existing account IDs and references remain
  stable; users may need to sign in again if JWT signing configuration changes.

### Data import

- Provide a separate, explicitly invoked CLI importer; application startup must
  never migrate or delete source data.
- Use a short maintenance window: stop application writes for the final import
  and switch traffic to Supabase before reopening writes. Do not add dual writes.
- Read the source MongoDB URI and Supabase credentials from environment
  variables. Do not log either credential or password hashes.
- Import in dependency order: users, clients, products, shipping companies,
  invoices and purchase orders, then invoice items/payments, purchase-order
  items, and expenses.
- Map Mongo `_id` values to `external_id`, references to matching external IDs,
  Mongo field names to SQL columns, and nested items/payments to child tables.
- Treat MongoDB as authoritative for matching `external_id` values in Supabase.
  Use bounded batches and upsert on stable identifiers so a failed import can
  be safely rerun; replace each imported parent's child rows from its Mongo
  source. Validate required references and report per-table source, imported,
  skipped, and failed counts. Never delete source MongoDB rows.
- Align invoice/order number sequences after import, then verify table counts
  and representative relationships before switching production traffic.
- Keep MongoDB unchanged as the rollback source until validation is complete.
  Rollback is supported before Supabase accepts new writes; after writes resume,
  any rollback requires a separate reconciliation and is not automatic.

### Initialization and seeding

- Replace Mongoose startup initialization with Supabase connectivity checks and
  an idempotent production administrator bootstrap using `ADMIN_NAME`,
  `ADMIN_EMAIL`, and `ADMIN_PASSWORD` only when no user exists.
- Keep development demo seeding available through the existing seed command,
  backed by Supabase and safe to rerun.
- Document SQL schema/migration application, seed setup, required environment
  variables, import execution, verification, and cutover/rollback expectations.

## Confirmed Decisions

- Preserve all existing MongoDB records by importing them.
- Use a short maintenance window and do not dual-write.
- MongoDB is authoritative for conflicting imported records.
- Support rollback only before writes resume on Supabase; retain MongoDB as an
  unchanged backup through that verification point.
- Keep the current custom JWT flow and use native Supabase queries/RPCs.

## Validation

- Backend TypeScript build and test suite.
- Focused API tests for auth, CRUD, finance summaries, purchase-order stock
  updates, invoice item/payment mapping, and database error translation.
- pgTAP coverage for schema constraints, RLS/grants, sequence alignment, and
  transaction rollback/atomicity of RPCs.
- Importer tests for nested relations, stable IDs, repeatable upserts, invalid
  references, and partial-run retry behavior.
- No live migration or deployment is performed by tests.