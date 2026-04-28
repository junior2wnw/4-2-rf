# TrustLink Core

TrustLink Core — простая и надёжная технология связи между доверенными устройствами.

Формула:

```text
Найти → Спросить → Запомнить → Соединить → Передать → Восстановить
```

Это личный цифровой мост: два устройства связываются после явного согласия, запоминают ключи друг друга, получают только конкретные разрешения и восстанавливают связь при обрывах.

## Что внутри

- Identity: устройство определяется Ed25519-ключом.
- Trust: новое устройство всегда требует подтверждения.
- Permissions: каждое действие получает отдельное разрешение.
- Session: на каждое соединение создаются временные X25519-ключи.
- Transport-ready core: путь может быть LAN QUIC, internet QUIC, WebRTC DataChannel, HTTPS stream или relay.
- Envelope: один формат для сообщений, файлов, API, событий и будущих каналов.
- Recovery: состояние переживает обрыв, смену сети, сон устройства и повторное соединение.
- Audit: логируются технические события без payload.

## Быстрый старт

```bash
pnpm install
pnpm check
pnpm demo
```

Демо создаёт два устройства, связывает их через согласие, выбирает лучший путь, шифрует сообщение, готовит передачу файла с resume и показывает recovery-план после обрыва.

## Минимальный код

```ts
import { TrustLinkNode, textMessage } from "trustlink-core";

const a = new TrustLinkNode("Laptop");
const b = new TrustLinkNode("Phone");

a.pairWith(b, {
  approvedBy: "Laptop:local-user",
  permissionsForPeer: ["messages.send", "files.send"],
  permissionsFromPeer: ["messages.send"]
});

const { localSession, peerSession } = a.connectTo(b);
const message = textMessage("hello");

const frame = localSession.seal(JSON.stringify(message), message.msgId);
const opened = peerSession.openUtf8(frame, message.msgId);
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

Проект сейчас реализует production-oriented core и локальное runtime-демо. Реальные сетевые транспорты подключаются через тот же контракт и получают только encrypted frames.

## Позиционирование

TrustLink Core описывается через пользу и границы ответственности:

- простая и надёжная связь между своими доверенными устройствами;
- remote support с подтверждением;
- private device link;
- zero-trust доступ к своим сервисам;
- связь через нестабильные сети.

Подробности: [docs/security-and-legal.md](docs/security-and-legal.md).

## Статус

Это сильная основа. Перед использованием с реальными пользовательскими данными запланированы внешний аудит протокола, реальные transport adapters, хранение private key в OS keychain/TPM и threat-model review.
