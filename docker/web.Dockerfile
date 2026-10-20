# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/ai/package.json packages/ai/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/reminders/package.json packages/reminders/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time placeholders only; real values come from the runtime environment.
RUN DATABASE_URL=postgres://build:build@localhost/build \
    BETTER_AUTH_SECRET=build-time-placeholder-secret-0000000000 \
    pnpm --filter @life-crm/web build

# Runs database migrations, then exits.
FROM builder AS migrate
CMD ["pnpm", "--filter", "@life-crm/db", "migrate"]

# Background jobs: daily reminders, digests, push.
FROM builder AS worker
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@life-crm/worker", "start"]

# Everything in one container: runs migrations, the worker and the web app.
# Meant for Unraid and quick self-host installs; compose uses the separate targets.
FROM builder AS allinone
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static \
 && mkdir -p apps/web/.next/standalone/apps/web/public \
 && cp -r apps/web/public/. apps/web/.next/standalone/apps/web/public/
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter @life-crm/db migrate && (pnpm --filter @life-crm/worker start &) && exec node apps/web/.next/standalone/apps/web/server.js"]

FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=builder --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=app:app /app/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
