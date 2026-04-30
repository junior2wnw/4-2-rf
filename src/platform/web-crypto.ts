import { roomAuthMaterial, RoomAuthOptions, TrustLinkRoomInput } from "../core/room.js";
import { fromBase64Url, readUtf8, toBase64Url, utf8 } from "../utils/encoding.js";

export interface WebEncryptedBytes {
  readonly nonce: string;
  readonly ciphertext: string;
}

export interface WebJoinAcceptPayload {
  readonly secretCiphertext: string;
  readonly nonce: string;
  readonly responderPublicJwk: JsonWebKey;
  readonly responderLabel: string;
}

export async function webSha256Base64Url(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? utf8(value) : value;
  const digest = await subtle().digest("SHA-256", bufferSource(bytes));
  return toBase64Url(new Uint8Array(digest));
}

export async function createWebRoomAuth(
  room: TrustLinkRoomInput,
  options: RoomAuthOptions = {}
): Promise<string> {
  return webSha256Base64Url(roomAuthMaterial(room, options));
}

export async function createWebJoinKeyPair(): Promise<CryptoKeyPair> {
  return subtle().generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey"]
  ) as Promise<CryptoKeyPair>;
}

export function exportWebJoinPublicKey(pair: CryptoKeyPair): Promise<JsonWebKey> {
  return subtle().exportKey("jwk", pair.publicKey);
}

export async function sealRoomSecretForWebJoin(
  roomSecret: string,
  requesterPublicJwk: JsonWebKey,
  responderLabel: string
): Promise<WebJoinAcceptPayload> {
  const responderPair = await createWebJoinKeyPair();
  const requesterPublic = await subtle().importKey(
    "jwk",
    requesterPublicJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const key = await deriveWebJoinAesKey(responderPair.privateKey, requesterPublic);
  const encrypted = await aesGcmEncrypt(key, utf8(roomSecret));
  return {
    secretCiphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    responderPublicJwk: await exportWebJoinPublicKey(responderPair),
    responderLabel
  };
}

export async function openRoomSecretFromWebJoin(
  privateKey: CryptoKey,
  payload: WebJoinAcceptPayload
): Promise<string> {
  const responderPublic = await subtle().importKey(
    "jwk",
    payload.responderPublicJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const key = await deriveWebJoinAesKey(privateKey, responderPublic);
  return readUtf8(await aesGcmDecrypt(key, payload.nonce, payload.secretCiphertext));
}

export async function sealBytesWithRoomSecret(roomSecret: string, bytes: Uint8Array): Promise<WebEncryptedBytes> {
  return aesGcmEncrypt(await importRoomSecretAesKey(roomSecret), bytes);
}

export async function openBytesWithRoomSecret(
  roomSecret: string,
  nonce: string,
  ciphertext: string
): Promise<Uint8Array> {
  return aesGcmDecrypt(await importRoomSecretAesKey(roomSecret), nonce, ciphertext);
}

async function importRoomSecretAesKey(secret: string): Promise<CryptoKey> {
  const digest = await subtle().digest("SHA-256", bufferSource(fromBase64Url(secret)));
  return subtle().importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

function deriveWebJoinAesKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  return subtle().deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function aesGcmEncrypt(key: CryptoKey, bytes: Uint8Array): Promise<WebEncryptedBytes> {
  const nonce = cryptoApi().getRandomValues(new Uint8Array(12));
  const encrypted = await subtle().encrypt(
    { name: "AES-GCM", iv: bufferSource(nonce) },
    key,
    bufferSource(bytes)
  );
  return {
    nonce: toBase64Url(nonce),
    ciphertext: toBase64Url(new Uint8Array(encrypted))
  };
}

async function aesGcmDecrypt(key: CryptoKey, nonce: string, ciphertext: string): Promise<Uint8Array> {
  const decrypted = await subtle().decrypt(
    { name: "AES-GCM", iv: bufferSource(fromBase64Url(nonce)) },
    key,
    bufferSource(fromBase64Url(ciphertext))
  );
  return new Uint8Array(decrypted);
}

function subtle(): SubtleCrypto {
  const api = cryptoApi().subtle;
  if (!api) {
    throw new Error("Web Crypto subtle API is unavailable");
  }
  return api;
}

function cryptoApi(): Crypto {
  if (!globalThis.crypto) {
    throw new Error("Web Crypto API is unavailable");
  }
  return globalThis.crypto;
}

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
