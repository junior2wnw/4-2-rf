import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import { DeviceIdentity, PublicDeviceIdentity, signPayload, verifySignedPayload } from "./identity.js";
import { TrustStore } from "./trust.js";
import { fromBase64Url, nowIso, randomId, readUtf8, sha256, stableJson, toBase64Url, utf8 } from "../utils/encoding.js";

export interface HandshakeOfferPayload {
  readonly v: 1;
  readonly kind: "trustlink.handshake.offer";
  readonly from: PublicDeviceIdentity;
  readonly toDeviceId: string;
  readonly ephemeralPublicKeyPem: string;
  readonly capabilities: readonly string[];
  readonly nonce: string;
  readonly createdAt: string;
}

export interface HandshakeAnswerPayload {
  readonly v: 1;
  readonly kind: "trustlink.handshake.answer";
  readonly from: PublicDeviceIdentity;
  readonly toDeviceId: string;
  readonly offerHash: string;
  readonly ephemeralPublicKeyPem: string;
  readonly capabilities: readonly string[];
  readonly nonce: string;
  readonly createdAt: string;
}

export interface SignedHandshake<TPayload> {
  readonly payload: TPayload;
  readonly signature: string;
}

export interface PendingHandshake {
  readonly offer: SignedHandshake<HandshakeOfferPayload>;
  readonly ephemeralPrivateKeyPem: string;
}

export interface AcceptedHandshake {
  readonly answer: SignedHandshake<HandshakeAnswerPayload>;
  readonly session: SecureSession;
}

export interface SealedFrame {
  readonly v: 1;
  readonly sessionId: string;
  readonly fromDeviceId: string;
  readonly toDeviceId: string;
  readonly seq: number;
  readonly nonce: string;
  readonly ciphertext: string;
  readonly tag: string;
}

export interface SessionSnapshot {
  readonly id: string;
  readonly localDeviceId: string;
  readonly peerDeviceId: string;
  readonly createdAt: string;
  readonly transcriptHash: string;
  readonly sendSeq: number;
  readonly receiveSeq: number;
}

export class SecureSession {
  private sendSeq = 0;
  private receiveSeq = 0;

  constructor(
    readonly id: string,
    readonly localDeviceId: string,
    readonly peerDeviceId: string,
    readonly createdAt: string,
    readonly transcriptHash: string,
    private readonly sendKey: Buffer,
    private readonly receiveKey: Buffer
  ) {}

  seal(plaintext: Uint8Array | string, aad: string = ""): SealedFrame {
    const nonce = randomBytes(12);
    const seq = ++this.sendSeq;
    const plaintextBytes = typeof plaintext === "string" ? utf8(plaintext) : Buffer.from(plaintext);
    const cipher = createCipheriv("chacha20-poly1305", this.sendKey, nonce, {
      authTagLength: 16
    });
    cipher.setAAD(this.frameAad(seq, aad, this.localDeviceId, this.peerDeviceId), {
      plaintextLength: plaintextBytes.length
    });
    const ciphertext = Buffer.concat([
      cipher.update(plaintextBytes),
      cipher.final()
    ]);

    return {
      v: 1,
      sessionId: this.id,
      fromDeviceId: this.localDeviceId,
      toDeviceId: this.peerDeviceId,
      seq,
      nonce: toBase64Url(nonce),
      ciphertext: toBase64Url(ciphertext),
      tag: toBase64Url(cipher.getAuthTag())
    };
  }

  open(frame: SealedFrame, aad: string = ""): Buffer {
    if (frame.sessionId !== this.id) {
      throw new Error("Frame belongs to another session");
    }
    if (frame.fromDeviceId !== this.peerDeviceId || frame.toDeviceId !== this.localDeviceId) {
      throw new Error("Frame direction mismatch for this session");
    }

    const nextSeq = this.receiveSeq + 1;
    if (frame.seq < nextSeq) {
      throw new Error("Replay or stale frame rejected");
    }

    const nonce = fromBase64Url(frame.nonce);
    const ciphertext = fromBase64Url(frame.ciphertext);
    const decipher = createDecipheriv("chacha20-poly1305", this.receiveKey, nonce, {
      authTagLength: 16
    });
    decipher.setAAD(this.frameAad(frame.seq, aad, frame.fromDeviceId, frame.toDeviceId), {
      plaintextLength: ciphertext.length
    });
    decipher.setAuthTag(fromBase64Url(frame.tag));
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);

    this.receiveSeq = frame.seq;
    return plaintext;
  }

  openUtf8(frame: SealedFrame, aad: string = ""): string {
    return readUtf8(this.open(frame, aad));
  }

  snapshot(): SessionSnapshot {
    return {
      id: this.id,
      localDeviceId: this.localDeviceId,
      peerDeviceId: this.peerDeviceId,
      createdAt: this.createdAt,
      transcriptHash: this.transcriptHash,
      sendSeq: this.sendSeq,
      receiveSeq: this.receiveSeq
    };
  }

  private frameAad(seq: number, aad: string, fromDeviceId: string, toDeviceId: string): Buffer {
    return utf8(stableJson({
      aad,
      fromDeviceId,
      seq,
      sessionId: this.id,
      toDeviceId,
      transcriptHash: this.transcriptHash
    }));
  }
}

export function createHandshakeOffer(
  local: DeviceIdentity,
  peer: PublicDeviceIdentity,
  capabilities: readonly string[] = ["messages", "files", "events", "https_stream"]
): PendingHandshake {
  const ephemeral = generateX25519Pair();
  const payload: HandshakeOfferPayload = {
    v: 1,
    kind: "trustlink.handshake.offer",
    from: publicSide(local),
    toDeviceId: peer.id,
    ephemeralPublicKeyPem: ephemeral.publicKeyPem,
    capabilities: [...capabilities].sort(),
    nonce: toBase64Url(randomBytes(16)),
    createdAt: nowIso()
  };

  return {
    offer: signPayload(local, payload),
    ephemeralPrivateKeyPem: ephemeral.privateKeyPem
  };
}

export function acceptHandshake(
  local: DeviceIdentity,
  trustStore: TrustStore,
  offer: SignedHandshake<HandshakeOfferPayload>,
  capabilities: readonly string[] = ["messages", "files", "events", "https_stream"]
): AcceptedHandshake {
  verifyOfferForLocal(local, trustStore, offer);

  const ephemeral = generateX25519Pair();
  const offerHash = hashSigned(offer);
  const answerPayload: HandshakeAnswerPayload = {
    v: 1,
    kind: "trustlink.handshake.answer",
    from: publicSide(local),
    toDeviceId: offer.payload.from.id,
    offerHash,
    ephemeralPublicKeyPem: ephemeral.publicKeyPem,
    capabilities: [...capabilities].sort(),
    nonce: toBase64Url(randomBytes(16)),
    createdAt: nowIso()
  };
  const answer = signPayload(local, answerPayload);
  const sharedSecret = x25519(ephemeral.privateKeyPem, offer.payload.ephemeralPublicKeyPem);
  const session = buildSession(local.id, offer.payload.from.id, sharedSecret, offer, answer);

  return { answer, session };
}

export function finishHandshake(
  local: DeviceIdentity,
  trustStore: TrustStore,
  pending: PendingHandshake,
  answer: SignedHandshake<HandshakeAnswerPayload>
): SecureSession {
  const peerRecord = trustStore.requireTrusted(answer.payload.from.id);
  if (answer.payload.toDeviceId !== local.id) {
    throw new Error("Handshake answer targets another device");
  }
  if (!safeEqual(answer.payload.offerHash, hashSigned(pending.offer))) {
    throw new Error("Handshake answer mismatch for pending offer");
  }
  if (!verifySignedPayload(peerRecord.peer.publicKeyPem, answer)) {
    throw new Error("Handshake answer signature is invalid");
  }

  const sharedSecret = x25519(pending.ephemeralPrivateKeyPem, answer.payload.ephemeralPublicKeyPem);
  return buildSession(local.id, answer.payload.from.id, sharedSecret, pending.offer, answer);
}

export function establishTrustedSession(
  initiator: DeviceIdentity,
  initiatorTrust: TrustStore,
  responder: DeviceIdentity,
  responderTrust: TrustStore
): { initiatorSession: SecureSession; responderSession: SecureSession } {
  const pending = createHandshakeOffer(initiator, publicSide(responder));
  const accepted = acceptHandshake(responder, responderTrust, pending.offer);
  const initiatorSession = finishHandshake(initiator, initiatorTrust, pending, accepted.answer);
  return { initiatorSession, responderSession: accepted.session };
}

function verifyOfferForLocal(
  local: DeviceIdentity,
  trustStore: TrustStore,
  offer: SignedHandshake<HandshakeOfferPayload>
): void {
  if (offer.payload.toDeviceId !== local.id) {
    throw new Error("Handshake offer targets another device");
  }

  const peerRecord = trustStore.requireTrusted(offer.payload.from.id);
  if (peerRecord.peer.publicKeyPem !== offer.payload.from.publicKeyPem) {
    throw new Error("Handshake public key mismatch for trust record");
  }
  if (!verifySignedPayload(peerRecord.peer.publicKeyPem, offer)) {
    throw new Error("Handshake offer signature is invalid");
  }
}

function buildSession(
  localDeviceId: string,
  peerDeviceId: string,
  sharedSecret: Buffer,
  offer: SignedHandshake<HandshakeOfferPayload>,
  answer: SignedHandshake<HandshakeAnswerPayload>
): SecureSession {
  const transcriptHash = hashSigned({ payload: { offer, answer }, signature: "transcript" });
  const sessionId = `ses_${transcriptHash.slice(0, 32)}`;
  const [sendKey, receiveKey] = deriveDirectionalKeys(
    sharedSecret,
    localDeviceId,
    peerDeviceId,
    transcriptHash
  );

  return new SecureSession(
    sessionId,
    localDeviceId,
    peerDeviceId,
    nowIso(),
    transcriptHash,
    sendKey,
    receiveKey
  );
}

function deriveDirectionalKeys(
  sharedSecret: Buffer,
  localDeviceId: string,
  peerDeviceId: string,
  transcriptHash: string
): [Buffer, Buffer] {
  const [firstId, secondId] = [localDeviceId, peerDeviceId].sort();
  const material = Buffer.from(hkdfSync(
    "sha256",
    sharedSecret,
    utf8(`trustlink:v1:${firstId}:${secondId}`),
    utf8(`session:${transcriptHash}`),
    64
  ));
  const firstToSecond = material.subarray(0, 32);
  const secondToFirst = material.subarray(32, 64);

  return localDeviceId === firstId
    ? [firstToSecond, secondToFirst]
    : [secondToFirst, firstToSecond];
}

function generateX25519Pair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("x25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });

  return {
    publicKeyPem: publicKey.toString(),
    privateKeyPem: privateKey.toString()
  };
}

function x25519(privateKeyPem: string, publicKeyPem: string): Buffer {
  return diffieHellman({
    privateKey: createPrivateKey(privateKeyPem),
    publicKey: createPublicKey(publicKeyPem)
  });
}

function hashSigned(value: unknown): string {
  return toBase64Url(sha256(stableJson(value)));
}

function publicSide(identity: DeviceIdentity): PublicDeviceIdentity {
  return {
    id: identity.id,
    label: identity.label,
    publicKeyPem: identity.publicKeyPem,
    fingerprint: identity.fingerprint,
    createdAt: identity.createdAt
  };
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
