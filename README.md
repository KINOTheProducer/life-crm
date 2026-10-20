# life-crm

Personal relationship manager for the people in your life. Self-host it next to Immich or run it as a hosted service.

## Status

- Phase 0: auth, multi-tenant schema with row-level security, people, birthdays dashboard.
- Phase 1 (in progress): voice notes, person timelines, reminders (birthdays and dates, keep-in-touch nudges, your own reminders; inbox, email digest, browser push, calendar feed).

## Layout

```
apps/web        Next.js 16 app (App Router, Tailwind, shadcn/ui, Better Auth)
apps/worker     Background jobs (daily reminder pass, digests, push)
packages/ai     Speech to text and AI extraction (Claude, or any OpenAI-compatible server)
packages/core   Domain logic and Zod schemas (date math, reminders)
packages/db     Drizzle schema, migrations, tenant-scoped query helper
packages/reminders  Daily reminder pass, email digest, web push, calendar feed
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

### Reminders

Run the worker next to the app: `pnpm --filter @life-crm/worker dev`. It checks every 5 minutes and runs each person's reminders once a day at their chosen hour. Email needs `SMTP_URL` (or `SMTP_URL=log` to print), browser push needs VAPID keys (`npx web-push generate-vapid-keys`).

### AI

Voice notes need two services:

- **Speech to text**: any OpenAI-compatible `/audio/transcriptions` endpoint. Locally, run `docker run -p 8000:8000 ghcr.io/speaches-ai/speaches:latest-cpu` and set `STT_BASE_URL=http://localhost:8000/v1`. Or point it at OpenAI or Groq.
- **Extraction**: Claude by default (`ANTHROPIC_API_KEY`). For a local model or another provider, set `AI_PROVIDER=openai_compatible`, `AI_BASE_URL`, `AI_MODEL` and optionally `AI_API_KEY`.

### Immich

Memories can pull photos from Immich. Each user connects their own server in Settings with an Immich API key; the key is encrypted with `BETTER_AUTH_SECRET` (changing that secret means reconnecting). Photos are never copied, thumbnails are proxied through the app. In cloud mode, Immich URLs on private networks are refused.

After changing `packages/db/src/schema`, run `pnpm db:generate` to create a migration.

## Self-hosting

```sh
cp .env.example .env    # fill in the secrets
docker compose up -d
```

In self-hosted mode only the first sign-up is allowed.
