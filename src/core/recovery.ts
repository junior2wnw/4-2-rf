import { nowIso } from "../utils/encoding.js";

export type ConnectionState =
  | "OFFLINE"
  | "CONNECTING"
  | "CONNECTED"
  | "DEGRADED"
  | "RECONNECTING"
  | "REVOKED";

export type RecoveryAction =
  | "discover_paths"
  | "race_paths"
  | "resume_streams"
  | "refresh_permissions"
  | "rotate_session_keys"
  | "stop";

export interface RecoverySnapshot {
  readonly peerId: string;
  readonly state: ConnectionState;
  readonly lastChangedAt: string;
  readonly attempts: number;
  readonly queuedDurableMessages: number;
  readonly resumableTransfers: number;
  readonly nextActions: readonly RecoveryAction[];
}

export class RecoveryEngine {
  private state: ConnectionState = "OFFLINE";
  private attempts = 0;
  private queuedDurableMessages = 0;
  private resumableTransfers = 0;
  private lastChangedAt = nowIso();

  constructor(private readonly peerId: string) {}

  connected(): RecoverySnapshot {
    this.attempts = 0;
    return this.transition("CONNECTED");
  }

  degraded(): RecoverySnapshot {
    return this.transition("DEGRADED");
  }

  disconnected(): RecoverySnapshot {
    this.attempts += 1;
    return this.transition("RECONNECTING");
  }

  revoked(): RecoverySnapshot {
    return this.transition("REVOKED");
  }

  queueDurableMessage(): RecoverySnapshot {
    this.queuedDurableMessages += 1;
    return this.snapshot();
  }

  addResumableTransfer(): RecoverySnapshot {
    this.resumableTransfers += 1;
    return this.snapshot();
  }

  transferResumed(): RecoverySnapshot {
    this.resumableTransfers = Math.max(0, this.resumableTransfers - 1);
    return this.snapshot();
  }

  snapshot(): RecoverySnapshot {
    return {
      peerId: this.peerId,
      state: this.state,
      lastChangedAt: this.lastChangedAt,
      attempts: this.attempts,
      queuedDurableMessages: this.queuedDurableMessages,
      resumableTransfers: this.resumableTransfers,
      nextActions: this.nextActions()
    };
  }

  private transition(state: ConnectionState): RecoverySnapshot {
    this.state = state;
    this.lastChangedAt = nowIso();
    return this.snapshot();
  }

  private nextActions(): RecoveryAction[] {
    if (this.state === "REVOKED") {
      return ["stop"];
    }
    if (this.state === "CONNECTED") {
      const actions: RecoveryAction[] = ["refresh_permissions"];
      if (this.resumableTransfers > 0) {
        actions.push("resume_streams");
      }
      return actions;
    }
    if (this.state === "DEGRADED") {
      return ["race_paths", "resume_streams"];
    }
    if (this.state === "RECONNECTING" || this.state === "OFFLINE") {
      return ["discover_paths", "race_paths", "rotate_session_keys", "resume_streams"];
    }
    return ["discover_paths"];
  }
}
