# Architecture

## Компоненты

### `apps/web`

- публичный landing + chat console;
- self-serve device connect flow;
- закрытая ops-зона `/ops`;
- внутренние server-side proxy routes `/ops-api/*`, чтобы admin key не попадал в браузер.

### `apps/api`

- chat sessions/messages;
- SSE streaming поверх OpenAI Responses API;
- installers manifest и artifact download;
- enrollment token issuance;
- agent registration / heartbeat control plane;
- knowledge promotion pipeline;
- Prometheus metrics.

### `apps/agent`

- команды `install`, `run`, `uninstall`, `version`;
- OS-native persistence:
  - Windows Task Scheduler
  - macOS LaunchAgent / LaunchDaemon
  - Linux systemd user/system service
- first registration by short-lived enrollment token;
- long-lived heartbeat token only after successful registration.

### `apps/memory-sidecar`

- retrieval/write adapter над MemPalace;
- private scope = конкретная chat session / future workspace scope;
- shared scope = `public-playbooks`;
- write path защищён сервисным API key.

## Основной flow

### 1. Web-first

1. Пользователь приходит на сайт.
2. Создаётся chat session.
3. Chat route делает retrieval:
   - private scope по `session.id`
   - shared scope `public-playbooks`
4. Ответ стримится через SSE.

### 2. Local agent onboarding

1. Пользователь выбирает артефакт под свою ОС.
2. Сайт выпускает короткоживущий enrollment token.
3. Токен подставляется в install command.
4. Локальный агент ставится в `user` scope по умолчанию.
5. На первом запуске агент регистрируется и получает `heartbeatToken`.
6. Далее агент живёт на heartbeat loop с backoff.

### 3. Shared knowledge growth loop

1. Удачный ответ ассистента проходит через `KnowledgeService`.
2. Контент проходит heuristics + sensitive-signal screening + redaction.
3. Если ответ reusable, создаётся `pending` promotion candidate.
4. Ops-модератор публикует или отклоняет candidate.
5. При publish playbook уходит в memory sidecar как `promotion://...`.
6. Последующие чаты могут использовать этот playbook через shared retrieval layer.

## Data plane и control plane

### PostgreSQL

- `chat_sessions`
- `chat_messages`
- `install_tokens`
- `agent_registrations`
- `knowledge_promotions`

### Memory

- Chroma-backed drawer collection;
- `wing=session.id` для private session memory;
- `wing=public-playbooks` для reviewed shared knowledge.

## Scaling notes

- Web и API scale horizontally behind reverse proxy.
- API state вынесен в PostgreSQL + memory sidecar.
- Agent artifacts обслуживаются через shared volume или future object storage/CDN.
- Shared playbooks можно вынести в отдельный moderation queue / event pipeline без ломки API contracts.
- Для “billions” следующий шаг — CDN для artifacts/static, Redis/queue для async jobs, dedicated vector store tier и multi-region split по control/data plane.
