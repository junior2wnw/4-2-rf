import { nowIso, randomId } from "../utils/encoding.js";

export type AuditEventType =
  | "peer.paired"
  | "peer.connected"
  | "peer.disconnected"
  | "peer.revoked"
  | "permission.denied"
  | "path.selected"
  | "transfer.started"
  | "transfer.completed"
  | "recovery.changed";

export interface AuditEvent {
  readonly id: string;
  readonly type: AuditEventType;
  readonly at: string;
  readonly peerId?: string;
  readonly message: string;
  readonly meta?: Record<string, string | number | boolean>;
}

export class AuditLog {
  private readonly events: AuditEvent[] = [];

  record(input: Omit<AuditEvent, "id" | "at">): AuditEvent {
    const event: AuditEvent = {
      id: randomId("evt"),
      at: nowIso(),
      ...input
    };
    this.events.push(event);
    return event;
  }

  list(): AuditEvent[] {
    return [...this.events];
  }
}
