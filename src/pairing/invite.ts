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
import { TrustRecord, TrustStore } from "../core/trust.js";
import { fromBase64Url, nowIso, randomId, readUtf8, stableJson, toBase64Url, utf8 } from "../utils/encoding.js";

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

export async function createPairingInvite(
  crypto: TrustLinkCrypto,
  identity: DeviceIdentity,
  options: PairingInviteOptions
): Promise<PairingInvite> {
  const ttlMs = options.ttlMs ?? 10 * 60 * 1000;
  const createdAt = nowIso();
  const payload: PairingInvitePayload = {
    v: 1,
    kind: "trustlink.pairing.invite",
    inviteId: randomId("inv"),
    from: toPublicIdentity(identity),
    requestedPermissions: [...options.requestedPermissions].sort(),
    offeredPermissions: [...options.offeredPermissions].sort(),
    capabilities: [...(options.capabilities ?? ["trustlink.stream.v1"])].sort(),
    createdAt,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    nonce: randomId("nonce")
  };

  return signPayload(crypto, identity, payload);
}

export function serializePairingInvite(invite: PairingInvite): string {
  return `trustlink:v1:pair:${toBase64Url(utf8(stableJson(invite)))}`;
}

export function parsePairingInvite(value: string): PairingInvite {
  const encoded = value.startsWith("trustlink:v1:pair:")
    ? value.slice("trustlink:v1:pair:".length)
    : value;
  if (!encoded) {
    throw new Error("Pairing invite payload missing");
  }
  return JSON.parse(readUtf8(fromBase64Url(encoded))) as PairingInvite;
}

export async function verifyPairingInvite(
  crypto: TrustLinkCrypto,
  invite: PairingInvite,
  at = Date.now()
): Promise<boolean> {
  assertPublicIdentity(invite.payload.from);
  if (invite.payload.v !== 1 || invite.payload.kind !== "trustlink.pairing.invite") {
    return false;
  }
  if (Date.parse(invite.payload.expiresAt) <= at) {
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
