import { TrustLinkCrypto } from "./crypto.js";
import { nowIso, shortFingerprint, stableJsonBytes, toBase64Url, fromBase64Url } from "../utils/encoding.js";

export interface PublicDeviceIdentity {
  readonly id: string;
  readonly label: string;
  readonly publicKey: string;
  readonly keyAlgorithm: string;
  readonly fingerprint: string;
  readonly createdAt: string;
}

export interface DeviceIdentity extends PublicDeviceIdentity {
  readonly privateKey: string;
}

export interface SignedPayload<TPayload> {
  readonly payload: TPayload;
  readonly signature: string;
  readonly algorithm: string;
}

export async function createDeviceIdentity(
  crypto: TrustLinkCrypto,
  label: string
): Promise<DeviceIdentity> {
  const keys = await crypto.generateSigningKeyPair();
  const publicHash = await crypto.hash(stableJsonBytes({
    algorithm: keys.algorithm,
    publicKey: keys.publicKey
  }));

  return {
    id: deriveDeviceIdFromHash(publicHash),
    label,
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
    keyAlgorithm: keys.algorithm,
    fingerprint: shortFingerprint(publicHash),
    createdAt: nowIso()
  };
}

export async function deriveDeviceId(
  crypto: TrustLinkCrypto,
  publicKey: string,
  keyAlgorithm: string
): Promise<string> {
  return deriveDeviceIdFromHash(await crypto.hash(stableJsonBytes({ algorithm: keyAlgorithm, publicKey })));
}

export function toPublicIdentity(identity: DeviceIdentity): PublicDeviceIdentity {
  return {
    id: identity.id,
    label: identity.label,
    publicKey: identity.publicKey,
    keyAlgorithm: identity.keyAlgorithm,
    fingerprint: identity.fingerprint,
    createdAt: identity.createdAt
  };
}

export function assertPublicIdentity(identity: PublicDeviceIdentity): void {
  if (!identity.id.startsWith("dev_")) {
    throw new Error("Device identity id must use the dev_ prefix");
  }
  if (!identity.label.trim()) {
    throw new Error("Device identity label is required");
  }
  if (!identity.publicKey.trim()) {
    throw new Error("Device identity public key is required");
  }
  if (!identity.keyAlgorithm.trim()) {
    throw new Error("Device identity key algorithm is required");
  }
}

export async function verifyPublicIdentity(
  crypto: TrustLinkCrypto,
  identity: PublicDeviceIdentity
): Promise<boolean> {
  assertPublicIdentity(identity);
  const expected = await deriveDeviceId(crypto, identity.publicKey, identity.keyAlgorithm);
  return expected === identity.id;
}

export async function signPayload<TPayload>(
  crypto: TrustLinkCrypto,
  identity: DeviceIdentity,
  payload: TPayload
): Promise<SignedPayload<TPayload>> {
  const signature = await crypto.sign(identity.privateKey, stableJsonBytes(payload));
  return {
    payload,
    signature: toBase64Url(signature),
    algorithm: identity.keyAlgorithm
  };
}

export async function verifySignedPayload<TPayload>(
  crypto: TrustLinkCrypto,
  publicKey: string,
  signed: SignedPayload<TPayload>
): Promise<boolean> {
  return crypto.verify(publicKey, stableJsonBytes(signed.payload), fromBase64Url(signed.signature));
}

function deriveDeviceIdFromHash(hash: Uint8Array): string {
  return `dev_${toBase64Url(hash).slice(0, 32)}`;
}
