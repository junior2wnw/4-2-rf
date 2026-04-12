# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS builder

ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_SITE_URL

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--dns-result-order=ipv4first"
ENV NEXT_PUBLIC_API_BASE_URL="$NEXT_PUBLIC_API_BASE_URL"
ENV NEXT_PUBLIC_SITE_URL="$NEXT_PUBLIC_SITE_URL"

RUN corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/tsconfig.json ./packages/contracts/
COPY packages/contracts/src ./packages/contracts/src
COPY apps/web/package.json apps/web/tsconfig.json apps/web/next.config.ts apps/web/postcss.config.mjs apps/web/eslint.config.mjs ./apps/web/
COPY apps/web/public ./apps/web/public
COPY apps/web/src ./apps/web/src

RUN --mount=type=cache,id=four-two-pnpm-store,target=/pnpm/store \
  pnpm install \
    --frozen-lockfile \
    --store-dir /pnpm/store \
    --fetch-retries 5 \
    --fetch-retry-mintimeout 10000 \
    --fetch-retry-maxtimeout 120000 \
    --fetch-timeout 600000
RUN pnpm --filter @4-2/contracts build
RUN pnpm --filter web build

FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

WORKDIR /app

COPY --from=builder /workspace/apps/web/.next/standalone ./
COPY --from=builder /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /workspace/apps/web/public ./apps/web/public

WORKDIR /app/apps/web
EXPOSE 3000

CMD ["node", "server.js"]
