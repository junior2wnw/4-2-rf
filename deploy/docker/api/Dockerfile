# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--dns-result-order=ipv4first"

RUN corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/tsconfig.json ./packages/contracts/
COPY packages/contracts/src ./packages/contracts/src
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY apps/api/src ./apps/api/src
COPY apps/api/test ./apps/api/test

RUN --mount=type=cache,id=four-two-pnpm-store,target=/pnpm/store \
  pnpm install \
    --frozen-lockfile \
    --store-dir /pnpm/store \
    --fetch-retries 5 \
    --fetch-retry-mintimeout 10000 \
    --fetch-retry-maxtimeout 120000 \
    --fetch-timeout 600000
RUN pnpm --filter @4-2/contracts build
RUN pnpm --filter @4-2/api build

FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable

WORKDIR /workspace

COPY --from=builder /workspace/package.json /workspace/pnpm-lock.yaml /workspace/pnpm-workspace.yaml /workspace/tsconfig.base.json ./
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/packages ./packages
COPY --from=builder /workspace/apps/api ./apps/api

WORKDIR /workspace/apps/api
EXPOSE 8080

CMD ["node", "dist/src/server.js"]
