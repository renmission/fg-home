# FG Homes — Claude Context

## Project Overview

Internal management platform for FG Home Builders and Construction Supply.
Modules: inventory, payroll/HR, deliveries, POS, customers, attendance, users/RBAC, reports.
Version 0.1.0 — actively developed.

## Tech Stack

- **Framework**: Next.js 15 (App Router, Turbopack in dev)
- **Language**: TypeScript 5 (strict mode, `@/*` path alias)
- **Styling**: Tailwind CSS 3.4 + shadcn/ui (Radix UI primitives)
- **State**: Zustand 5 (UI state), TanStack Query 5 (server state)
- **Database**: PostgreSQL (Neon serverless) + Drizzle ORM 0.38
- **Auth**: NextAuth.js v5 — JWT strategy, credentials provider
- **Validation**: Zod — schemas are source of truth for TypeScript types
- **PDF**: pdf-lib | **Charts**: Recharts | **Icons**: Lucide React
- **Package manager**: pnpm 9

## Key Directories

| Path                      | Purpose                                                       |
| ------------------------- | ------------------------------------------------------------- |
| `app/(auth)/`             | Login/auth routes (unprotected)                               |
| `app/dashboard/`          | Protected dashboard pages — one sub-folder per module         |
| `app/api/`                | 70+ REST API routes organized by resource                     |
| `components/ui/`          | shadcn/ui primitives (button, card, table, input…)            |
| `components/dashboard/`   | Dashboard shell, sidebar, nav, role-specific dashboards       |
| `components/{module}/`    | Feature components: inventory, payroll, pos, users, delivery… |
| `lib/db/schema.ts`        | Drizzle ORM schema — 40+ tables, single source of truth       |
| `lib/db/index.ts`         | Database client initialization                                |
| `lib/auth.ts`             | NextAuth config + JWT callbacks                               |
| `lib/auth/permissions.ts` | RBAC: roles → permissions map + `can()` helper                |
| `lib/{module}-api.ts`     | Client-side API wrappers (one file per module)                |
| `lib/errors.ts`           | `AppError`, `apiErrorResponse()`, `withRouteErrorHandling()`  |
| `schemas/`                | Zod validation schemas — one file per module                  |
| `stores/ui-store.ts`      | Zustand UI store (sidebar, modals, filters)                   |
| `types/next-auth.d.ts`    | NextAuth session/JWT type extensions                          |
| `middleware.ts`           | Route protection + auth redirects                             |
| `drizzle/`                | ORM migration files                                           |
| `scripts/`                | DB seeding, backfill, and cleanup scripts                     |

## Essential Commands

```bash
# Development
pnpm dev              # Next.js + Turbopack

# Quality gates (pre-commit runs these in order)
pnpm typecheck        # tsc --noEmit
pnpm lint             # ESLint
pnpm format:check     # Prettier dry-run

# Production
pnpm build
pnpm start

# Database
pnpm db:generate      # Generate migration from schema changes
pnpm db:migrate       # Apply pending migrations
pnpm db:push          # Push schema directly (prototyping only)
pnpm db:studio        # Drizzle Studio visual DB browser
pnpm db:seed          # Seed roles + admin user
```

Pre-commit hook order: Prettier (staged) → typecheck → lint → build.

## Environment Variables

Required in `.env.local`: `DATABASE_URL`, `AUTH_SECRET`.
Seed script requires: `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

## RBAC Roles

Six roles: `admin`, `inventory_manager`, `payroll_manager`, `delivery_staff`, `pos_cashier`, `viewer`.
All permissions are checked via `can(user, permission)` — see [`lib/auth/permissions.ts`](lib/auth/permissions.ts).

## Fixing Bugs

**IMPORTANT:** When you work on a new feature, or bug, create a git branch first.
Then work on changes in the branch for the remainder of the session.
Do not switch branches in the middle of a session.

## Additional Documentation

| Topic                                | File                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| Architectural patterns & conventions | [`.claude/docs/architectural_patterns.md`](.claude/docs/architectural_patterns.md) |
