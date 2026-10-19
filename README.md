# life-crm

Personal relationship manager for the people in your life. Self-host it next to Immich or run it as a hosted service. Product and technical plan: [docs/PLAN.md](docs/PLAN.md).

## Status

Phase 0 (foundation): auth, multi-tenant schema with row-level security, people list, add person with birthday, dashboard with upcoming birthdays.

## Layout

```
apps/web        Next.js 16 app (App Router, Tailwind, shadcn/ui, Better Auth)
packages/core   Domain logic and Zod schemas (date math, reminders)
packages/db     Drizzle schema, migrations, tenant-scoped query helper
docker/         Dockerfile and Postgres init
```

## Development

Requires Node 22, pnpm 10, PostgreSQL 16.

```sh
pnpm install
cp apps/web/.env.example apps/web/.env   # fill in BETTER_AUTH_SECRET (openssl rand -base64 32)
export DATABASE_URL=postgres://life_crm:life_crm@localhost:5432/life_crm
pnpm db:migrate
pnpm dev                                 # http://localhost:3000
```

The app must connect as a role that is not a superuser, otherwise Postgres skips row-level security.

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` (DB tests run when `DATABASE_URL` is set), `pnpm build`.

After changing `packages/db/src/schema`, run `pnpm db:generate` to create a migration.

## Self-hosting

```sh
cp .env.example .env    # fill in the secrets
docker compose up -d
```

In self-hosted mode only the first sign-up is allowed.
