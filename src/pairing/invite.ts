import {
  DeviceIdentity,
  PublicDeviceIdentity,
  SignedPayload,
  assertPublicIdentity,
  signPayload,
  toPublicIdentity,
  verifyPublicIdentity,
  verifySignedPayload
} from "../core/identity.js";
import { TrustLinkCrypto } from "../core/crypto.js";
import { PermissionPolicy } from "../core/permissions.js";
import { TrustRecord, TrustStore } from "../core/trust.js";
import { fromBase64Url, nowIso, randomId, readUtf8, stableJson, toBase64Url, utf8 } from "../utils/encoding.js";

export const pairingInvitePrefix = "trustlink:v1:pair:";
export const defaultMaxSerializedPairingInviteBytes = 64 * 1024;

export interface PairingInvitePayload {
  readonly v: 1;
  readonly kind: "trustlink.pairing.invite";
  readonly inviteId: string;
  readonly from: PublicDeviceIdentity;
  readonly requestedPermissions: readonly string[];
  readonly offeredPermissions: readonly string[];
  readonly capabilities: readonly string[];
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly nonce: string;
}

export type PairingInvite = SignedPayload<PairingInvitePayload>;

export interface PairingInviteOptions {
  readonly requestedPermissions: readonly string[];
  readonly offeredPermissions: readonly string[];
  readonly capabilities?: readonly string[];
  readonly ttlMs?: number;
}

export interface AcceptPairingOptions {
  readonly approvedBy: string;
  readonly note?: string;
  readonly permissionsOverride?: readonly string[];
}

export interface PairingInviteValidationOptions {
  readonly maxSerializedBytes?: number;
}

export async function createPairingInvite(
  crypto: TrustLinkCrypto,
  identity: DeviceIdentity,
  options: PairingInviteOptions
): Promise<PairingInvite> {
  const ttlMs = options.ttlMs ?? 10 * 60 * 1000;
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new Error("Pairing invite ttlMs must be a safe positive integer");
  }
  const requestedPermissions = new PermissionPolicy(options.requestedPermissions).list();
  const offeredPermissions = new PermissionPolicy(options.offeredPermissions).list();
  const createdAt = nowIso();
  const payload: PairingInvitePayload = {
    v: 1,
    kind: "trustlink.pairing.invite",
    inviteId: randomId("inv"),
    from: toPublicIdentity(identity),
    requestedPermissions,
    offeredPermissions,
    capabilities: [...(options.capabilities ?? ["trustlink.stream.v1"])].sort(),
    createdAt,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    nonce: randomId("nonce")
  };

  return signPayload(crypto, identity, payload);
}

export function serializePairingInvite(invite: PairingInvite): string {
  return `${pairingInvitePrefix}${toBase64Url(utf8(stableJson(invite)))}`;
}

export function parsePairingInvite(value: string, options: PairingInviteValidationOptions = {}): PairingInvite {
  const maxSerializedBytes = options.maxSerializedBytes ?? defaultMaxSerializedPairingInviteBytes;
  const encoded = value.startsWith(pairingInvitePrefix)
    ? value.slice(pairingInvitePrefix.length)
    : value;
  if (!encoded) {
    throw new Error("Pairing invite payload missing");
  }
  if (!Number.isSafeInteger(maxSerializedBytes) || maxSerializedBytes <= 0) {
    throw new Error("maxSerializedBytes must be a safe positive integer");
  }
  if (encoded.length > maxSerializedBytes) {
    throw new Error("Pairing invite payload exceeds configured limit");
  }
  const invite = JSON.parse(readUtf8(fromBase64Url(encoded))) as PairingInvite;
  assertPairingInviteShape(invite);
  return invite;
}

export async function verifyPairingInvite(
  crypto: TrustLinkCrypto,
  invite: PairingInvite,
  at = Date.now()
): Promise<boolean> {
  assertPairingInviteShape(invite);
  assertPublicIdentity(invite.payload.from);
  if (invite.payload.v !== 1 || invite.payload.kind !== "trustlink.pairing.invite") {
    return false;
  }
  const createdAtMs = Date.parse(invite.payload.createdAt);
  const expiresAtMs = Date.parse(invite.payload.expiresAt);
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= createdAtMs) {
    return false;
  }
  if (expiresAtMs <= at) {
    return false;
  }
  if (!(await verifyPublicIdentity(crypto, invite.payload.from))) {
    return false;
  }
  return verifySignedPayload(crypto, invite.payload.from.publicKey, invite);
}

export async function acceptPairingInvite(
  crypto: TrustLinkCrypto,
  localTrustStore: TrustStore,
  invite: PairingInvite,
  options: AcceptPairingOptions
): Promise<TrustRecord> {
  if (!(await verifyPairingInvite(crypto, invite))) {
    throw new Error("Pairing invite verification failed");
  }
  if (options.permissionsOverride) {
    new PermissionPolicy(options.permissionsOverride);
  }

  return localTrustStore.addTrustedPeer(
    invite.payload.from,
    options.permissionsOverride ?? invite.payload.offeredPermissions,
    {
      accepted: true,
      approvedBy: options.approvedBy,
      ...(options.note !== undefined ? { note: options.note } : {})
    },
    options.note !== undefined ? { note: options.note } : {}
  );
}

function assertPairingInviteShape(invite: unknown): asserts invite is PairingInvite {
  if (typeof invite !== "object" || invite === null || Array.isArray(invite)) {
    throw new Error("Pairing invite must be an object");
  }
  const candidate = invite as Partial<PairingInvite>;
  if (typeof candidate.signature !== "string" || candidate.signature.length === 0) {
    throw new Error("Pairing invite signature is required");
  }
  if (typeof candidate.algorithm !== "string" || candidate.algorithm.length === 0) {
    throw new Error("Pairing invite algorithm is required");
  }
  if (typeof candidate.payload !== "object" || candidate.payload === null || Array.isArray(candidate.payload)) {
    throw new Error("Pairing invite payload is required");
  }
  const payload = candidate.payload as Partial<PairingInvitePayload>;
  if (!Array.isArray(payload.requestedPermissions) || !Array.isArray(payload.offeredPermissions)) {
    throw new Error("Pairing invite permissions are required");
  }
  new PermissionPolicy(payload.requestedPermissions);
  new PermissionPolicy(payload.offeredPermissions);
}

export function pairingInviteSummary(invite: PairingInvite): Record<string, string | string[]> {
  return {
    inviteId: invite.payload.inviteId,
    from: invite.payload.from.label,
    fingerprint: invite.payload.from.fingerprint,
    requestedPermissions: [...invite.payload.requestedPermissions],
    offeredPermissions: [...invite.payload.offeredPermissions],
    expiresAt: invite.payload.expiresAt
  };
}
