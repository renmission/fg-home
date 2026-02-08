# FG Homes

Internal management platform for **FG Home Builders and Construction Supply** — inventory, payroll, and delivery tracking.

## Setup

This project uses **pnpm**.

### Environment

Create `.env.local` (or use `.env`) with:

- `DATABASE_URL` — Neon (or other Postgres) connection string
- `AUTH_SECRET` — secret for NextAuth sessions (e.g. `openssl rand -base64 32`)

Optional for seed script (`pnpm db:seed`):

- `ADMIN_EMAIL` — default `admin@fghomes.local`
- `ADMIN_PASSWORD` — default `admin123`

### Commands

```bash
# Install dependencies
pnpm install

# Push DB schema (after DATABASE_URL is set)
pnpm db:push

# Seed roles and admin user
pnpm db:seed

# Development
pnpm dev

# Build
pnpm build

# Start production server
pnpm start

# Lint
pnpm lint
```

## Tech stack

- Next.js 15 (App Router), TypeScript, Tailwind CSS
- Shadcn UI, Neon (PostgreSQL), Drizzle ORM
- NextAuth.js, RBAC

See `docs/` for project plan and phase status (docs are gitignored).
