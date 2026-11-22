# Invoice Management System

Full-stack invoice, inventory, shipping, purchase-order, and finance platform built with Next.js, Express, and Supabase Postgres.

## Features

- JWT authentication with admin and staff roles.
- Client directory and product inventory management.
- Invoices with partial payments, shipping details, and PDF printing.
- Purchase orders with atomic inventory updates when approved.
- Finance summaries for invoices, payments, expenses, and cash flow.

## Stack

- Frontend: Next.js, TypeScript, Tailwind CSS
- Backend: Node.js, Express, TypeScript
- Persistence: Supabase Postgres (server-only service-role client)
- Authentication: existing custom JWT flow

## Local development

### Prerequisites

- Node.js 20 or newer
- A Supabase project
- MongoDB access only if you need to run the one-time importer

### Configure Supabase

For a new database, apply `backend/supabase/schema.sql` in the Supabase SQL Editor. For an existing schema, apply the numbered files under `backend/supabase/migrations` in order. Do not apply the demo `seed.sql` to a production database.

Copy `backend/.env.example` to `backend/.env` and set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `JWT_SECRET`. The service-role key belongs only in the backend environment; never put it in a `NEXT_PUBLIC_*` variable or frontend configuration.

```powershell
cd backend
npm install
npm run seed
npm run dev
```

`npm run seed` adds the demo dataset only when the database has no users. Demo credentials:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@invoices.com` | `admin123` |
| Staff | `user@invoices.com` | `user123` |

Use demo credentials only in a non-production project. The explicit `npm run seed -- --clean` option clears Supabase tables before recreating the demo dataset; it refuses to run when `NODE_ENV=production`.

Run the frontend in a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

The backend runs at `http://localhost:5000`; the frontend runs at `http://localhost:3000`.

## Production deployment

Deploy `frontend/` and `backend/` as separate Vercel projects, with those directories as their respective root directories. Set these backend environment variables in Vercel:

| Variable | Required | Purpose |
|---|---:|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only database access; keep secret |
| `JWT_SECRET` | Yes | Private signing secret for the existing API tokens |
| `CORS_ORIGINS` | Yes | Exact frontend origin, without a trailing slash |
| `ADMIN_NAME` | First user only | Initial production administrator name |
| `ADMIN_EMAIL` | First user only | Initial production administrator email |
| `ADMIN_PASSWORD` | First user only | Initial password, at least 8 characters |
| `JWT_EXPIRES_IN` | No | Token lifetime; defaults are defined by the backend |

The backend creates the configured administrator only when the `users` table is empty. The app does not fall back to MongoDB or local JSON storage. Set `NEXT_PUBLIC_API_URL` in the frontend project to the backend URL ending in `/api`; never configure the service-role key in the frontend.

## One-time MongoDB import and cutover

The importer reads `MONGODB_URI`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` from the backend environment (including `backend/.env`). It is a standalone command and is never run by application startup.

1. Back up MongoDB and keep it unchanged. Create/verify the Supabase project and apply the schema or migrations, including `202611210004_nested_record_external_ids.sql`.
2. In a trusted local environment, put the source `MONGODB_URI` and Supabase variables in the untracked `backend/.env`. Do not paste credentials into source files, command output, or frontend settings.
3. Enable a short write-freeze: stop writes to the current application and any other MongoDB writers.
4. From `backend/`, run:

   ```powershell
   npm run migrate:mongodb
   ```

5. Review the per-table `source`, `imported`, `skipped`, and `failed` counts. Resolve failures and invalid references, rerun the importer if needed, and verify table counts, representative relationships, and invoice/order numbering in Supabase.
6. Point production traffic at the Supabase-backed backend. Recheck login and key read/write flows, then reopen writes.

The import is repeatable: MongoDB wins conflicts on matching `external_id` values, and nested invoice and purchase-order rows are replaced from their source parents. The importer uses bounded batches and does not delete MongoDB source rows or unrelated Supabase rows.

Keep MongoDB as the unchanged rollback source until Supabase validation is complete. Rollback is supported only before Supabase accepts new writes. After writes resume, there is no automatic rollback; reconcile new Supabase writes before switching back.

## Repository layout

```text
backend/
  scripts/                 # One-time MongoDB importer and row mappings
  src/controllers/         # Supabase-backed API operations
  src/config/supabase.ts   # Server-only Supabase configuration
  src/seed.ts              # Development demo data
  supabase/                # Schema, migrations, SQL seed, and database tests
frontend/
```
