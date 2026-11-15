# Dairy Milk Supply & Financial Management System

Web app replacing the manual/Excel dairy sheets. Implementation of [PLANNING.md](PLANNING.md).

Stack: Next.js 15 (App Router) · TypeScript · PostgreSQL 16 · Prisma 6 · decimal.js · Zod · Tailwind 4 · Recharts · ExcelJS · Vitest + fast-check.

## Run it locally

```bash
npm install
```

Start PostgreSQL, using **one** of these:

```bash
npm run db:up
```

```bash
npm run db:local
```

`db:up` uses Docker Compose. `db:local` runs an embedded PostgreSQL 16 from npm, with no Docker needed; leave it running in its own terminal. Both listen on `localhost:5433`, user `dairy` / `dairy`.

```bash
npx prisma migrate deploy
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Open http://localhost:3000 and sign in as `admin` with the `SEED_ADMIN_PASSWORD` from `.env`. **Change the password** right away (sidebar → Account).

Optional: load the reference sheet data (S.S.N Dairy Farm, 01–05/08/2026). Its statement must show **Rs. 943,577**.

```bash
npm run db:demo
```

### Tests

```bash
npm test
```

- `tests/calc.test.ts`: every §4.4 reference figure, rounding edge cases, Maan↔KG, lakh grouping, and property-based checks.
- `tests/integration.test.ts`: runs against real PostgreSQL. Each run migrates a fresh `test_<timestamp>` schema in `TEST_DATABASE_URL` and drops only that schema afterwards. Covers the golden statement, edit/void reversals, duplicate guard, rate history, payments (partial/full/advance) with FIFO, adjustments, bulk all-or-nothing, the permission matrix, close → carry-forward, reopen → re-close versioning, and the closed-period guard (service + DB trigger).

### Production (Docker)

```bash
docker compose --profile app up -d --build
```

Runs the app, Postgres, and a nightly `pg_dump` backup into `./backups` (30-day retention). Migrations run on container start. Run `npm run db:seed` once against the database to create roles and the admin user. Put HTTPS in front (e.g. Caddy) for production.

## Where things are

| Area | Path |
|---|---|
| Calculation engine (pure, shared client/server) | `src/lib/calc.ts` |
| Ledger: append-only, reversal-based | `src/server/services/ledger.ts` |
| Milk entries (single, bulk, edit/void) | `src/server/services/milkEntries.ts` |
| Payments + FIFO allocation | `src/server/services/payments.ts` |
| Statements (versioned, read-only on the ledger) | `src/server/services/statements.ts` |
| Month close / reopen + reconciliation | `src/server/services/periods.ts` |
| Reports (8 report types) + Excel | `src/server/services/reports.ts`, `src/lib/xlsx.ts` |
| Role → permission matrix | `src/lib/permissions.ts` |
| DB constraints and triggers Prisma can't express | `prisma/migrations/*_constraints`, `*_fix_closed_period_trigger` |

## Open decisions: defaults used

From PLANNING.md §15. Change any of them once the owner confirms.

| ID | Default implemented |
|---|---|
| D2 | Rate/KG auto-derived as Rate/Maan ÷ 40 (and vice versa). Both are stored; a mismatch shows a warning. |
| D3 | Data Entry can change Bandhi quantities, not rates (`milk.override_qty` without `milk.override_rate`). |
| D4 | International grouping, switchable to lakh in Settings. |
| D5 | Western digits; optional Urdu name field on customers and the business. |
| D7 | Bandhi and Mandi on one statement, as two sections. |

## Deviations from the plan

- **Auth:** custom DB-session auth (argon2id, HTTP-only cookie, lockout after 5 failures, session revocation) instead of Auth.js. Auth.js's credentials provider does not support DB sessions.
- **UI kit:** hand-written Tailwind components instead of shadcn/ui and TanStack Table.
- **Mutations** use Next.js server actions (built-in origin/CSRF check). REST routes under `/api/v1` cover exports, attachments and backup only.
- **PDF:** statements, receipts and reports have print stylesheets; the browser's Print → *Save as PDF* produces the PDF. Server-side @react-pdf generation is not done.
- **Payment allocation** is always recomputed FIFO; there is no manual override yet.

## Not done yet (by PLANNING.md phase)

- **Phase 8:** Urdu UI translation (next-intl) and RTL/Nastaliq PDFs. Only Urdu names and labels are supported so far.
- **Phase 9:** Playwright E2E suite, rate limiting beyond login lockout, restore-from-UI (restore is documented as a CLI step on the Backup page), and the user guide.
- **Phase 10:** Excel import tool for customers and opening balances, plus the parallel-run month.
- **Nightly integrity job:** reconciliation currently runs at month close only.
