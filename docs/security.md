# Security

## Что сознательно запрещено

- скрытая установка клиента;
- скрытая эскалация прав;
- постоянные admin/system permissions “навсегда” без явного действия пользователя;
- сырой shared memory между разными пользователями;
- запись в память sidecar без сервисной аутентификации.

## Текущие контуры защиты

### Установка агента

- default scope: `user`;
- `system` scope остаётся отдельным explicit path;
- uninstall поддерживается как first-class команда;
- enrollment token короткоживущий;
- heartbeat token отдельный и не равен enrollment token.

### API и web

- Fastify rate limit;
- CORS ограничен ожидаемыми origin;
- helmet включён;
- request-id и structured logging;
- metrics endpoint остаётся внутренним concern, а не public product surface.

### Memory

- sidecar search/write требуют `x-memory-sidecar-key`;
- shared reuse происходит только из `public-playbooks`;
- auto-extract не публикует знания автоматически;
- candidate creation пропускает ответы с признаками токенов, ключей, email, приватных путей и private key material.

### Ops

- `/ops` и `/ops-api/*` закрыты basic auth;
- browser не получает `KNOWLEDGE_ADMIN_API_KEY`;
- web делает server-side proxy к API admin endpoints.

## Секреты

Минимально обязательные секреты для production:

- `OPENAI_API_KEY`
- `MEMORY_SIDECAR_API_KEY`
- `KNOWLEDGE_ADMIN_API_KEY`
- `AGENT_ENROLLMENT_SECRET`
- `OPS_BASIC_AUTH_PASSWORD`
- `POSTGRES_PASSWORD`

## Hardening backlog

- заменить basic auth в ops на SSO/IdP;
- вынести installers в object storage + signed URLs;
- добавить audit log для publish/reject действий;
- добавить content classification перед pending candidate creation;
- добавить secret scanning на CI;
- ввести backup/restore drills для PostgreSQL и memory volume;
- перейти от session-level private memory к workspace/user tenancy model.
