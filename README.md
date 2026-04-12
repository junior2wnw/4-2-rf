# 4-2.рф

4-2.рф — это execution-oriented AI platform с тремя слоями:

- `web`: сайт и чат, которые дают ценность до установки локального агента;
- `api`: control plane для чата, installers, agent enrollment, heartbeats и knowledge promotion;
- `agent`: локальный CLI/daemon для Windows, macOS и Linux с прозрачным OS-native install flow;
- `memory-sidecar`: отдельный retrieval/write layer поверх MemPalace/Chroma;
- `ops`: moderation flow, через который лучшие ответы превращаются в shared playbooks для следующих пользователей.

## Что здесь принципиально важно

- Нет скрытой установки, скрытой эскалации прав и “admin forever”.
- По умолчанию агент ставится в `user` scope.
- Межпользовательское reuse идёт только через reviewed `public-playbooks`, а не через сырой shared memory.
- Sidecar памяти закрыт сервисным ключом.
- Enrollment tokens короткоживущие, heartbeat token отдельный.

## Структура

- `apps/web` — Next.js UI и закрытая ops-зона `/ops`
- `apps/api` — Fastify API, PostgreSQL persistence, metrics, streaming chat
- `apps/agent` — Go CLI/daemon с install/run/uninstall
- `apps/memory-sidecar` — FastAPI + MemPalace adapter
- `packages/contracts` — shared Zod contracts
- `deploy` — compose stack, Dockerfiles, Caddy
- `docs` — architecture, security, deploy runbook
- `scripts` — agent build scripts

## Локальный запуск

1. Скопируй `.env.example` в `.env` и задай секреты.
2. Установи зависимости:

```bash
pnpm install
```

3. Подними API и web отдельно или сразу через compose:

```bash
pnpm --filter @4-2/contracts build
pnpm --filter @4-2/api dev
pnpm --filter web dev
```

или

```bash
pnpm compose:build-agent
pnpm compose:dev
```

Для server/shared-host deploy используй последовательный pipeline без параллельной пересборки:

```bash
node scripts/deploy-stack.mjs
```

## Проверки

```bash
pnpm test
pnpm typecheck
pnpm build
python -m pytest apps/memory-sidecar/test -q
```

## Agent artifacts

Windows:

```powershell
pnpm agent:build
```

Linux/macOS:

```bash
pnpm agent:build:unix
```

Артефакты и `manifest.json` попадут в `apps/agent/dist`.

## Ops moderation

- `/ops` защищён basic auth (`OPS_BASIC_AUTH_USERNAME` / `OPS_BASIC_AUTH_PASSWORD`)
- pending candidates появляются автоматически после сильных reusable ответов или вручную из ops UI
- публикация переносит playbook в `public-playbooks`, после чего он доступен всем чатам через retrieval

## Deploy

Полный runbook: [docs/deploy-runbook.md](/d:/4-2/docs/deploy-runbook.md)

Архитектура: [docs/architecture.md](/d:/4-2/docs/architecture.md)

Безопасность: [docs/security.md](/d:/4-2/docs/security.md)
