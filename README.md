# TrustLink Core

TrustLink Core — простая и надёжная технология связи между доверенными устройствами.

Формула:

```text
Найти → Спросить → Запомнить → Соединить → Передать → Восстановить
```

Это личный цифровой мост: устройства связываются после явного согласия, запоминают ключи друг друга, получают только конкретные разрешения и восстанавливают связь при обрывах.

## Что внутри

- Identity: устройство определяется Ed25519-ключом.
- Trust: новое устройство всегда требует подтверждения.
- Permissions: каждое действие получает отдельное разрешение.
- Session: на каждое соединение создаются временные X25519-ключи.
- Transport-ready core: любой transport подключается через открытый adapter id.
- Envelope: один формат для любых каналов данных.
- LinkSpace: один контекст связи может включать два, три и больше устройств через обычные pairwise-связи.
- Recovery: состояние переживает обрыв, смену сети, сон устройства и повторное соединение.
- Audit: логируются технические события без payload.
- Modules: storage, discovery, transports, channels, UI and QR подключаются через единый registry.

## Быстрый старт

```bash
pnpm install
pnpm check
pnpm demo
pnpm modules
pnpm pair:qr
pnpm doctor
```

Демо создаёт два устройства, связывает их через согласие, выбирает лучший путь, шифрует сообщение, готовит передачу файла с resume и показывает recovery-план после обрыва. Это пример поверх технологии, а не обязательный сценарий.

## Минимальный код

```ts
import { LinkSpace, createDeviceIdentity, toPublicIdentity } from "trustlink-core";

const a = createDeviceIdentity("Laptop");
const b = createDeviceIdentity("Phone");
const c = createDeviceIdentity("Tablet");

const space = LinkSpace.create("My Link", toPublicIdentity(a), ["data.send"]);

space.addMember(toPublicIdentity(b), ["data.send"]);
space.addMember(toPublicIdentity(c), ["events.sync"]);
```

## Архитектура

```text
Identity
→ Trust
→ Discovery
→ Path selection
→ Session security
→ Multiplexed envelope
→ Permissions
→ Delivery
→ Recovery
→ Audit
```

Проект сейчас реализует technology kernel, extension points и starter-модули. Реальные сетевые transports подключаются через тот же контракт и получают только encrypted frames.

## Позиционирование

TrustLink Core описывается через пользу и границы ответственности:

- простая и надёжная связь между своими доверенными устройствами;
- remote support с подтверждением;
- private device link;
- zero-trust доступ к своим сервисам;
- связь через нестабильные сети.

Подробности: [docs/security-and-legal.md](docs/security-and-legal.md).

## Модульность

Проект устроен как маленькое ядро с понятными extension points. Другие пользователи могут добавлять свои storage, discovery, transport, channel, UI и QR модули через общий `ModuleRegistry`. Starter-модули можно заменить полностью.

Документ: [docs/modules.md](docs/modules.md).

## Статус

Это сильная основа. Перед использованием с реальными пользовательскими данными запланированы внешний аудит протокола, реальные transport adapters, хранение private key в OS keychain/TPM и threat-model review.
