import { TrustLinkCrypto, TrustLinkKeyPair } from "./crypto.js";
import { DeviceIdentity, PublicDeviceIdentity, signPayload, toPublicIdentity, verifySignedPayload } from "./identity.js";
import { TrustStore } from "./trust.js";
import { fromBase64Url, readUtf8, stableJson, stableJsonBytes, toBase64Url, utf8 } from "../utils/encoding.js";

export interface HandshakeOfferPayload {
  readonly v: 1;
  readonly kind: "trustlink.handshake.offer";
  readonly from: PublicDeviceIdentity;
  readonly toDeviceId: string;
  readonly agreementPublicKey: string;
  readonly agreementAlgorithm: string;
  readonly capabilities: readonly string[];
  readonly cryptoSuite: string;
  readonly nonce: string;
  readonly createdAt: string;
}

export interface HandshakeAnswerPayload {
  readonly v: 1;
  readonly kind: "trustlink.handshake.answer";
  readonly from: PublicDeviceIdentity;
  readonly toDeviceId: string;
  readonly offerHash: string;
  readonly agreementPublicKey: string;
  readonly agreementAlgorithm: string;
  readonly capabilities: readonly string[];
  readonly cryptoSuite: string;
  readonly nonce: string;
  readonly createdAt: string;
}

export interface SignedHandshake<TPayload> {
  readonly payload: TPayload;
  readonly signature: string;
  readonly algorithm: string;
}

export interface PendingHandshake {
  readonly offer: SignedHandshake<HandshakeOfferPayload>;
  readonly agreementKeyPair: TrustLinkKeyPair;
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
  readonly cryptoSuite: string;
}

export class SecureSession {
  private sendSeq = 0;
  private receiveSeq = 0;

  constructor(
    private readonly crypto: TrustLinkCrypto,
    readonly id: string,
    readonly localDeviceId: string,
    readonly peerDeviceId: string,
    readonly createdAt: string,
    readonly transcriptHash: string,
    private readonly sendKey: Uint8Array,
    private readonly receiveKey: Uint8Array
  ) {}

  async seal(plaintext: Uint8Array, context: Uint8Array = new Uint8Array()): Promise<SealedFrame> {
    const nonce = this.crypto.randomBytes(12);
    const seq = ++this.sendSeq;
    const sealed = await this.crypto.seal(
      this.sendKey,
      nonce,
      plaintext,
      this.frameAad(seq, context, this.localDeviceId, this.peerDeviceId)
    );

    return {
      v: 1,
      sessionId: this.id,
      fromDeviceId: this.localDeviceId,
      toDeviceId: this.peerDeviceId,
      seq,
      nonce: toBase64Url(nonce),
      ciphertext: toBase64Url(sealed.ciphertext),
      tag: toBase64Url(sealed.tag)
    };
  }

  async sealUtf8(value: string, context = ""): Promise<SealedFrame> {
    return this.seal(utf8(value), utf8(context));
  }

  async open(frame: SealedFrame, context: Uint8Array = new Uint8Array()): Promise<Uint8Array> {
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

    const plaintext = await this.crypto.open(
      this.receiveKey,
      fromBase64Url(frame.nonce),
      {
        ciphertext: fromBase64Url(frame.ciphertext),
        tag: fromBase64Url(frame.tag)
      },
      this.frameAad(frame.seq, context, frame.fromDeviceId, frame.toDeviceId)
    );
    this.receiveSeq = frame.seq;
    return plaintext;
  }

  async openUtf8(frame: SealedFrame, context = ""): Promise<string> {
    return readUtf8(await this.open(frame, utf8(context)));
  }

  snapshot(): SessionSnapshot {
    return {
      id: this.id,
      localDeviceId: this.localDeviceId,
      peerDeviceId: this.peerDeviceId,
      createdAt: this.createdAt,
      transcriptHash: this.transcriptHash,
      sendSeq: this.sendSeq,
      receiveSeq: this.receiveSeq,
      cryptoSuite: this.crypto.suite
    };
  }

  private frameAad(seq: number, context: Uint8Array, fromDeviceId: string, toDeviceId: string): Uint8Array {
    return stableJsonBytes({
      context: toBase64Url(context),
      fromDeviceId,
      seq,
      sessionId: this.id,
      toDeviceId,
      transcriptHash: this.transcriptHash
    });
  }
}

export async function createHandshakeOffer(
  crypto: TrustLinkCrypto,
  local: DeviceIdentity,
  peer: PublicDeviceIdentity,
  capabilities: readonly string[] = ["trustlink.stream.v1"]
): Promise<PendingHandshake> {
  const agreementKeyPair = await crypto.generateAgreementKeyPair();
  const payload: HandshakeOfferPayload = {
    v: 1,
    kind: "trustlink.handshake.offer",
    from: toPublicIdentity(local),
    toDeviceId: peer.id,
    agreementPublicKey: agreementKeyPair.publicKey,
    agreementAlgorithm: agreementKeyPair.algorithm,
    capabilities: [...capabilities].sort(),
    cryptoSuite: crypto.suite,
    nonce: toBase64Url(crypto.randomBytes(16)),
    createdAt: new Date().toISOString()
  };

  return {
    offer: await signPayload(crypto, local, payload),
    agreementKeyPair
  };
}

export async function acceptHandshake(
  crypto: TrustLinkCrypto,
  local: DeviceIdentity,
  trustStore: TrustStore,
  offer: SignedHandshake<HandshakeOfferPayload>,
  capabilities: readonly string[] = ["trustlink.stream.v1"]
): Promise<AcceptedHandshake> {
  await verifyOfferForLocal(crypto, local, trustStore, offer);

  const agreementKeyPair = await crypto.generateAgreementKeyPair();
  const offerHash = await hashSigned(crypto, offer);
  const answerPayload: HandshakeAnswerPayload = {
    v: 1,
    kind: "trustlink.handshake.answer",
    from: toPublicIdentity(local),
    toDeviceId: offer.payload.from.id,
    offerHash,
    agreementPublicKey: agreementKeyPair.publicKey,
    agreementAlgorithm: agreementKeyPair.algorithm,
    capabilities: [...capabilities].sort(),
    cryptoSuite: crypto.suite,
    nonce: toBase64Url(crypto.randomBytes(16)),
    createdAt: new Date().toISOString()
  };
  const answer = await signPayload(crypto, local, answerPayload);
  const sharedSecret = await crypto.sharedSecret(agreementKeyPair.privateKey, offer.payload.agreementPublicKey);
  const session = await buildSession(crypto, local.id, offer.payload.from.id, sharedSecret, offer, answer);

  return { answer, session };
}

export async function finishHandshake(
  crypto: TrustLinkCrypto,
  local: DeviceIdentity,
  trustStore: TrustStore,
  pending: PendingHandshake,
  answer: SignedHandshake<HandshakeAnswerPayload>
): Promise<SecureSession> {
  const peerRecord = trustStore.requireTrusted(answer.payload.from.id);
  if (answer.payload.toDeviceId !== local.id) {
    throw new Error("Handshake answer targets another device");
  }
  if (answer.payload.offerHash !== await hashSigned(crypto, pending.offer)) {
    throw new Error("Handshake answer mismatch for pending offer");
  }
  if (!(await verifySignedPayload(crypto, peerRecord.peer.publicKey, answer))) {
    throw new Error("Handshake answer signature is invalid");
  }

  const sharedSecret = await crypto.sharedSecret(pending.agreementKeyPair.privateKey, answer.payload.agreementPublicKey);
  return buildSession(crypto, local.id, answer.payload.from.id, sharedSecret, pending.offer, answer);
}

export async function establishTrustedSession(
  crypto: TrustLinkCrypto,
  initiator: DeviceIdentity,
  initiatorTrust: TrustStore,
  responder: DeviceIdentity,
  responderTrust: TrustStore
): Promise<{ initiatorSession: SecureSession; responderSession: SecureSession }> {
  const pending = await createHandshakeOffer(crypto, initiator, toPublicIdentity(responder));
  const accepted = await acceptHandshake(crypto, responder, responderTrust, pending.offer);
  const initiatorSession = await finishHandshake(crypto, initiator, initiatorTrust, pending, accepted.answer);
  return { initiatorSession, responderSession: accepted.session };
}

async function verifyOfferForLocal(
  crypto: TrustLinkCrypto,
  local: DeviceIdentity,
  trustStore: TrustStore,
  offer: SignedHandshake<HandshakeOfferPayload>
): Promise<void> {
  if (offer.payload.toDeviceId !== local.id) {
    throw new Error("Handshake offer targets another device");
  }

  const peerRecord = trustStore.requireTrusted(offer.payload.from.id);
  if (peerRecord.peer.publicKey !== offer.payload.from.publicKey) {
    throw new Error("Handshake public key mismatch for trust record");
  }
  if (!(await verifySignedPayload(crypto, peerRecord.peer.publicKey, offer))) {
    throw new Error("Handshake offer signature is invalid");
  }
}

async function buildSession(
  crypto: TrustLinkCrypto,
  localDeviceId: string,
  peerDeviceId: string,
  sharedSecret: Uint8Array,
  offer: SignedHandshake<HandshakeOfferPayload>,
  answer: SignedHandshake<HandshakeAnswerPayload>
): Promise<SecureSession> {
  const transcriptHash = await hashSigned(crypto, { payload: { offer, answer }, signature: "transcript", algorithm: "none" });
  const sessionId = `ses_${transcriptHash.slice(0, 32)}`;
  const [sendKey, receiveKey] = await deriveDirectionalKeys(crypto, sharedSecret, localDeviceId, peerDeviceId, transcriptHash);

  return new SecureSession(
    crypto,
    sessionId,
    localDeviceId,
    peerDeviceId,
    new Date().toISOString(),
    transcriptHash,
    sendKey,
    receiveKey
  );
}

async function deriveDirectionalKeys(
  crypto: TrustLinkCrypto,
  sharedSecret: Uint8Array,
  localDeviceId: string,
  peerDeviceId: string,
  transcriptHash: string
): Promise<[Uint8Array, Uint8Array]> {
  const [firstId, secondId] = [localDeviceId, peerDeviceId].sort();
  const material = await crypto.hkdf(
    sharedSecret,
    utf8(`trustlink:v1:${firstId}:${secondId}`),
    utf8(`session:${transcriptHash}`),
    64
  );
  const firstToSecond = material.slice(0, 32);
  const secondToFirst = material.slice(32, 64);
  return localDeviceId === firstId
    ? [firstToSecond, secondToFirst]
    : [secondToFirst, firstToSecond];
}

async function hashSigned(crypto: TrustLinkCrypto, value: SignedHandshake<unknown>): Promise<string> {
  return toBase64Url(await crypto.hash(utf8(stableJson(value))));
}
