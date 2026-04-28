import { assertPublicIdentity, PublicDeviceIdentity } from "./identity.js";
import { PermissionPolicy, PermissionRequest } from "./permissions.js";
import { nowIso } from "../utils/encoding.js";

export type TrustState = "trusted" | "revoked";

export interface PairingConsent {
  readonly accepted: true;
  readonly approvedBy: string;
  readonly approvedAt?: string;
  readonly note?: string;
}

export interface TrustRecord {
  readonly peer: PublicDeviceIdentity;
  readonly state: TrustState;
  readonly permissions: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
  readonly expiresAt?: string;
  readonly approvedBy?: string;
  readonly note?: string;
}

export interface TrustSnapshot {
  readonly records: readonly TrustRecord[];
}

export class TrustStore {
  private readonly records = new Map<string, TrustRecord>();

  constructor(records: readonly TrustRecord[] = []) {
    for (const record of records) {
      assertPublicIdentity(record.peer);
      this.records.set(record.peer.id, record);
    }
  }

  static empty(): TrustStore {
    return new TrustStore();
  }

  addTrustedPeer(
    peer: PublicDeviceIdentity,
    permissions: readonly string[],
    consent: PairingConsent,
    options: { expiresAt?: string; note?: string } = {}
  ): TrustRecord {
    assertPublicIdentity(peer);

    const now = nowIso();
    const existing = this.records.get(peer.id);
    const version = existing ? existing.version + 1 : 1;
    const note = options.note ?? consent.note;
    const record: TrustRecord = {
      peer,
      state: "trusted",
      permissions: new PermissionPolicy(permissions).list(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      version,
      ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}),
      approvedBy: consent.approvedBy,
      ...(note !== undefined ? { note } : {})
    };

    this.records.set(peer.id, record);
    return record;
  }

  get(peerId: string): TrustRecord | undefined {
    return this.records.get(peerId);
  }

  list(): TrustRecord[] {
    return [...this.records.values()].sort((a, b) => a.peer.label.localeCompare(b.peer.label));
  }

  requireTrusted(peerId: string): TrustRecord {
    const record = this.records.get(peerId);
    if (!record) {
      throw new Error(`Unknown peer: ${peerId}`);
    }
    if (record.state !== "trusted") {
      throw new Error(`Peer is not trusted: ${peerId}`);
    }
    if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) {
      throw new Error(`Peer trust expired: ${peerId}`);
    }
    return record;
  }

  allows(peerId: string, request: PermissionRequest): boolean {
    const record = this.requireTrusted(peerId);
    return new PermissionPolicy(record.permissions).allows(request);
  }

  requirePermission(peerId: string, request: PermissionRequest): void {
    const record = this.requireTrusted(peerId);
    new PermissionPolicy(record.permissions).require(request);
  }

  revoke(peerId: string, note?: string): TrustRecord {
    const record = this.requireTrusted(peerId);
    const { note: existingNote, ...rest } = record;
    const nextNote = note ?? existingNote;
    const revoked: TrustRecord = {
      ...rest,
      state: "revoked",
      updatedAt: nowIso(),
      version: record.version + 1,
      ...(nextNote !== undefined ? { note: nextNote } : {})
    };
    this.records.set(peerId, revoked);
    return revoked;
  }

  snapshot(): TrustSnapshot {
    return { records: this.list() };
  }
}
