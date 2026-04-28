import { DeviceIdentity } from "../core/identity.js";
import { TrustRecord, TrustSnapshot } from "../core/trust.js";
import { KeyStore, TrustRecordStore } from "./contracts.js";

export class MemoryKeyStore implements KeyStore {
  readonly id = "memory-key-store";
  private readonly identities = new Map<string, DeviceIdentity>();

  async saveIdentity(identity: DeviceIdentity): Promise<void> {
    this.identities.set(identity.label, identity);
  }

  async loadIdentity(label: string): Promise<DeviceIdentity | undefined> {
    return this.identities.get(label);
  }

  async deleteIdentity(label: string): Promise<void> {
    this.identities.delete(label);
  }
}

export class MemoryTrustRecordStore implements TrustRecordStore {
  readonly id = "memory-trust-store";
  private readonly records = new Map<string, TrustRecord>();

  constructor(snapshot: TrustSnapshot = { records: [] }) {
    for (const record of snapshot.records) {
      this.records.set(record.peer.id, record);
    }
  }

  async save(snapshot: TrustSnapshot): Promise<void> {
    this.records.clear();
    for (const record of snapshot.records) {
      this.records.set(record.peer.id, record);
    }
  }

  async load(): Promise<TrustSnapshot> {
    return { records: [...this.records.values()] };
  }

  async upsert(record: TrustRecord): Promise<void> {
    this.records.set(record.peer.id, record);
  }

  async remove(peerId: string): Promise<void> {
    this.records.delete(peerId);
  }
}
