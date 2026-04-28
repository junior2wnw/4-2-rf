import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify
} from "node:crypto";
import { sha256Base64Url, shortFingerprint, stableJson, toBase64Url, utf8, nowIso } from "../utils/encoding.js";

export interface PublicDeviceIdentity {
  readonly id: string;
  readonly label: string;
  readonly publicKeyPem: string;
  readonly fingerprint: string;
  readonly createdAt: string;
}

export interface DeviceIdentity extends PublicDeviceIdentity {
  readonly privateKeyPem: string;
}

export interface SignedPayload<T> {
  readonly payload: T;
  readonly signature: string;
}

export function createDeviceIdentity(label: string): DeviceIdentity {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });

  const publicKeyPem = publicKey.toString();

  return {
    id: deriveDeviceId(publicKeyPem),
    label,
    publicKeyPem,
    privateKeyPem: privateKey.toString(),
    fingerprint: shortFingerprint(publicKeyPem),
    createdAt: nowIso()
  };
}

export function deriveDeviceId(publicKeyPem: string): string {
  return `dev_${sha256Base64Url(publicKeyPem).slice(0, 32)}`;
}

export function toPublicIdentity(identity: DeviceIdentity): PublicDeviceIdentity {
  return {
    id: identity.id,
    label: identity.label,
    publicKeyPem: identity.publicKeyPem,
    fingerprint: identity.fingerprint,
    createdAt: identity.createdAt
  };
}

export function assertPublicIdentity(identity: PublicDeviceIdentity): void {
  const expected = deriveDeviceId(identity.publicKeyPem);
  if (identity.id !== expected) {
    throw new Error(`Device id does not match public key for ${identity.label}`);
  }
}

export function signPayload<T>(identity: DeviceIdentity, payload: T): SignedPayload<T> {
  const bytes = utf8(stableJson(payload));
  const signature = sign(null, bytes, createPrivateKey(identity.privateKeyPem));
  return { payload, signature: toBase64Url(signature) };
}

export function verifySignedPayload<T>(
  publicKeyPem: string,
  signed: SignedPayload<T>
): boolean {
  return verify(
    null,
    utf8(stableJson(signed.payload)),
    createPublicKey(publicKeyPem),
    Buffer.from(signed.signature.replaceAll("-", "+").replaceAll("_", "/"), "base64")
  );
}
