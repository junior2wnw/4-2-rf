import { DeviceIdentity } from "../core/identity.js";
import { TrustRecord, TrustSnapshot } from "../core/trust.js";

export interface KeyStore {
  readonly id: string;
  saveIdentity(identity: DeviceIdentity): Promise<void>;
  loadIdentity(label: string): Promise<DeviceIdentity | undefined>;
  deleteIdentity(label: string): Promise<void>;
}

export interface TrustRecordStore {
  readonly id: string;
  save(snapshot: TrustSnapshot): Promise<void>;
  load(): Promise<TrustSnapshot>;
  upsert(record: TrustRecord): Promise<void>;
  remove(peerId: string): Promise<void>;
}
