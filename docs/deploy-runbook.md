# Deploy Runbook

## Цель

Поднять 4-2.рф на SSH-host `dev` через Docker Compose:

- `caddy` — reverse proxy
- `web` — Next.js UI + ops zone
- `api` — Fastify backend
- `memory-sidecar` — MemPalace adapter
- `postgres` — control-plane data
- `agent-builder` — on-demand build pipeline для installer artifacts

## Предусловия

- DNS/A-record указывает на сервер;
- на сервере есть Docker + Compose plugin;
- репозиторий уже пушнут в GitHub;
- подготовлен `.env` с production-like секретами.

## Обязательные env values

- `NEXT_PUBLIC_SITE_URL=https://4-2.рф`
- `NEXT_PUBLIC_API_BASE_URL=/api`
- `API_PUBLIC_BASE_URL=https://4-2.рф/api`
- `WEB_PUBLIC_BASE_URL=https://4-2.рф`
- `INTERNAL_API_BASE_URL=http://api:8080`
- `OPENAI_API_KEY=...`
- `MEMORY_SIDECAR_API_KEY=...`
- `KNOWLEDGE_ADMIN_API_KEY=...`
- `AGENT_ENROLLMENT_SECRET=...`
- `OPS_BASIC_AUTH_USERNAME=...`
- `OPS_BASIC_AUTH_PASSWORD=...`
- `POSTGRES_DB=fourtwo`
- `POSTGRES_USER=fourtwo`
- `POSTGRES_PASSWORD=...`

## Первый deploy

```bash
git clone <repo-url> /opt/4-2-rf
cd /opt/4-2-rf
cp .env.example .env
# заполни секреты
node scripts/compose-stack.mjs config
node scripts/compose-stack.mjs --profile build run --rm agent-builder
node scripts/compose-stack.mjs up -d --build
```

Если DNS ещё не указывает на сервер, можно временно оставить `SITE_ADDRESS=:80`.
После прокидывания A-record поменяй `SITE_ADDRESS=4-2.рф` и перезапусти stack, чтобы Caddy получил публичный TLS.

`compose-stack.mjs` запускает `docker compose` из каталога `deploy/` и всегда подхватывает корневой `.env`, поэтому interpolation и секреты не теряются.

## Проверка

```bash
node scripts/compose-stack.mjs ps
node scripts/compose-stack.mjs logs api --tail=100
node scripts/compose-stack.mjs logs web --tail=100
node scripts/compose-stack.mjs logs memory-sidecar --tail=100
curl -I http://127.0.0.1
curl -s http://127.0.0.1/api/healthz
curl -s http://127.0.0.1/api/readyz
```

## Обновление

```bash
cd /opt/4-2-rf
git pull --ff-only
node scripts/compose-stack.mjs --profile build run --rm agent-builder
node scripts/compose-stack.mjs up -d --build
```

## Rollback

### Вариант 1: быстрый rollback по git

```bash
git log --oneline -n 10
git checkout <previous-good-commit>
node scripts/compose-stack.mjs up -d --build
```

### Вариант 2: откат только приложения

- оставить volumes PostgreSQL и memory без удаления;
- пересобрать `web` и `api` из предыдущего git revision;
- не трогать `postgres_data` и `memory_data`, если проблема не в данных.

## Операционные замечания

- `agent-builder` лучше запускать отдельно до `up`, чтобы API всегда видел готовый manifest/artifacts;
- `/ops` должен быть доступен только команде;
- metrics сейчас внутренние, для external monitoring лучше поднять Prometheus scraping внутри private network;
- перед production traffic обязательно настроить backups PostgreSQL и snapshot policy для memory volume.
