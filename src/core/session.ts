import { TrustLinkCrypto, TrustLinkKeyPair } from "./crypto.js";
import {
  DeviceIdentity,
  PublicDeviceIdentity,
  signPayload,
  toPublicIdentity,
  verifyPublicIdentity,
  verifySignedPayload
} from "./identity.js";
import { TrustStore } from "./trust.js";
import { validateSealedFrame } from "./frame.js";
import { fromBase64Url, readUtf8, stableJson, stableJsonBytes, toBase64Url, utf8 } from "../utils/encoding.js";

export const trustLinkStreamCapability = "trustlink.stream.v1";
export const defaultHandshakeTtlMs = 2 * 60 * 1000;
export const defaultMaxPlaintextBytes = 1024 * 1024;
export const maxSessionSeq = Number.MAX_SAFE_INTEGER;

export interface HandshakeOptions {
  readonly capabilities?: readonly string[];
  readonly ttlMs?: number;
  readonly now?: () => number;
  readonly maxPlaintextBytes?: number;
}

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
  readonly capability: string;
  readonly maxPlaintextBytes: number;
}

interface DirectionalMaterial {
  readonly sendKey: Uint8Array;
  readonly receiveKey: Uint8Array;
  readonly sendNonceSeed: Uint8Array;
  readonly receiveNonceSeed: Uint8Array;
}

interface NormalizedHandshakeOptions {
  readonly capabilities: readonly string[];
  readonly ttlMs: number;
  readonly now: () => number;
  readonly maxPlaintextBytes: number;
}

export class SecureSession {
  private sendSeq = 0;
  private receiveSeq = 0;
  private sealChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly crypto: TrustLinkCrypto,
    readonly id: string,
    readonly localDeviceId: string,
    readonly peerDeviceId: string,
    readonly createdAt: string,
    readonly transcriptHash: string,
    private readonly sendKey: Uint8Array,
    private readonly receiveKey: Uint8Array,
    private readonly sendNonceSeed: Uint8Array,
    private readonly receiveNonceSeed: Uint8Array,
    private readonly capability: string,
    private readonly maxPlaintextBytes: number
  ) {}

  async seal(plaintext: Uint8Array, context: Uint8Array = new Uint8Array()): Promise<SealedFrame> {
    const plaintextCopy = copyBytes(plaintext);
    const contextCopy = copyBytes(context);
    const job = this.sealChain.then(() => this.sealNext(plaintextCopy, contextCopy));
    this.sealChain = job.then(
      () => undefined,
      () => undefined
    );
    return job;
  }

  async sealUtf8(value: string, context = ""): Promise<SealedFrame> {
    return this.seal(utf8(value), utf8(context));
  }

  async open(frame: SealedFrame, context: Uint8Array = new Uint8Array()): Promise<Uint8Array> {
    validateSealedFrame(frame, { maxCiphertextBytes: this.maxPlaintextBytes });
    if (frame.sessionId !== this.id) {
      throw new Error("Frame belongs to another session");
    }
    if (frame.fromDeviceId !== this.peerDeviceId || frame.toDeviceId !== this.localDeviceId) {
      throw new Error("Frame direction mismatch for this session");
    }

    const expectedSeq = this.receiveSeq + 1;
    if (frame.seq !== expectedSeq) {
      throw new Error("Frame sequence mismatch");
    }

    const nonce = fromBase64Url(frame.nonce);
    const expectedNonce = nonceForSeq(this.receiveNonceSeed, frame.seq);
    if (!bytesEqual(nonce, expectedNonce)) {
      throw new Error("Frame nonce mismatch");
    }

    const plaintext = await this.crypto.open(
      this.receiveKey,
      nonce,
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
      cryptoSuite: this.crypto.suite,
      capability: this.capability,
      maxPlaintextBytes: this.maxPlaintextBytes
    };
  }

  private async sealNext(plaintext: Uint8Array, context: Uint8Array): Promise<SealedFrame> {
    if (plaintext.length > this.maxPlaintextBytes) {
      throw new Error("Plaintext exceeds configured frame limit");
    }
    if (this.sendSeq >= maxSessionSeq) {
      throw new Error("Session sequence exhausted");
    }

    const seq = this.sendSeq + 1;
    this.sendSeq = seq;

    try {
      const nonce = nonceForSeq(this.sendNonceSeed, seq);
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
    } catch (error) {
      if (this.sendSeq === seq) {
        this.sendSeq = seq - 1;
      }
      throw error;
    }
  }

  private frameAad(seq: number, context: Uint8Array, fromDeviceId: string, toDeviceId: string): Uint8Array {
    return stableJsonBytes({
      capability: this.capability,
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
  optionsInput: readonly string[] | HandshakeOptions = {}
): Promise<PendingHandshake> {
  const options = normalizeHandshakeOptions(optionsInput);
  const agreementKeyPair = await crypto.generateAgreementKeyPair();
  const payload: HandshakeOfferPayload = {
    v: 1,
    kind: "trustlink.handshake.offer",
    from: toPublicIdentity(local),
    toDeviceId: peer.id,
    agreementPublicKey: agreementKeyPair.publicKey,
    agreementAlgorithm: agreementKeyPair.algorithm,
    capabilities: options.capabilities,
    cryptoSuite: crypto.suite,
    nonce: toBase64Url(crypto.randomBytes(16)),
    createdAt: new Date(options.now()).toISOString()
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
  optionsInput: readonly string[] | HandshakeOptions = {}
): Promise<AcceptedHandshake> {
  const options = normalizeHandshakeOptions(optionsInput);
  await verifyOfferForLocal(crypto, local, trustStore, offer, options);

  const capability = selectSharedCapability(offer.payload.capabilities, options.capabilities);
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
    capabilities: [capability],
    cryptoSuite: crypto.suite,
    nonce: toBase64Url(crypto.randomBytes(16)),
    createdAt: new Date(options.now()).toISOString()
  };
  const answer = await signPayload(crypto, local, answerPayload);
  const sharedSecret = await crypto.sharedSecret(agreementKeyPair.privateKey, offer.payload.agreementPublicKey);
  const session = await buildSession(
    crypto,
    local.id,
    offer.payload.from.id,
    sharedSecret,
    offer,
    answer,
    capability,
    options.maxPlaintextBytes
  );

  return { answer, session };
}

export async function finishHandshake(
  crypto: TrustLinkCrypto,
  local: DeviceIdentity,
  trustStore: TrustStore,
  pending: PendingHandshake,
  answer: SignedHandshake<HandshakeAnswerPayload>,
  optionsInput: readonly string[] | HandshakeOptions = {}
): Promise<SecureSession> {
  const options = normalizeHandshakeOptions(optionsInput);
  const peerRecord = trustStore.requireTrusted(answer.payload.from.id);
  if (answer.payload.v !== 1 || answer.payload.kind !== "trustlink.handshake.answer") {
    throw new Error("Unsupported handshake answer");
  }
  if (answer.payload.toDeviceId !== local.id) {
    throw new Error("Handshake answer targets another device");
  }
  assertFresh(answer.payload.createdAt, options, "Handshake answer");
  if (answer.payload.cryptoSuite !== crypto.suite) {
    throw new Error("Handshake answer crypto suite mismatch");
  }
  if (answer.payload.offerHash !== await hashSigned(crypto, pending.offer)) {
    throw new Error("Handshake answer mismatch for pending offer");
  }
  if (!(await verifyPublicIdentity(crypto, answer.payload.from))) {
    throw new Error("Handshake answer identity is invalid");
  }
  if (peerRecord.peer.publicKey !== answer.payload.from.publicKey) {
    throw new Error("Handshake public key mismatch for trust record");
  }
  if (!(await verifySignedPayload(crypto, peerRecord.peer.publicKey, answer))) {
    throw new Error("Handshake answer signature is invalid");
  }

  const capability = selectSharedCapability(pending.offer.payload.capabilities, answer.payload.capabilities);
  if (!options.capabilities.includes(capability)) {
    throw new Error("Handshake answer capability mismatch");
  }

  const sharedSecret = await crypto.sharedSecret(pending.agreementKeyPair.privateKey, answer.payload.agreementPublicKey);
  return buildSession(
    crypto,
    local.id,
    answer.payload.from.id,
    sharedSecret,
    pending.offer,
    answer,
    capability,
    options.maxPlaintextBytes
  );
}

export async function establishTrustedSession(
  crypto: TrustLinkCrypto,
  initiator: DeviceIdentity,
  initiatorTrust: TrustStore,
  responder: DeviceIdentity,
  responderTrust: TrustStore,
  optionsInput: readonly string[] | HandshakeOptions = {}
): Promise<{ initiatorSession: SecureSession; responderSession: SecureSession }> {
  const pending = await createHandshakeOffer(crypto, initiator, toPublicIdentity(responder), optionsInput);
  const accepted = await acceptHandshake(crypto, responder, responderTrust, pending.offer, optionsInput);
  const initiatorSession = await finishHandshake(crypto, initiator, initiatorTrust, pending, accepted.answer, optionsInput);
  return { initiatorSession, responderSession: accepted.session };
}

async function verifyOfferForLocal(
  crypto: TrustLinkCrypto,
  local: DeviceIdentity,
  trustStore: TrustStore,
  offer: SignedHandshake<HandshakeOfferPayload>,
  options: NormalizedHandshakeOptions
): Promise<void> {
  if (offer.payload.v !== 1 || offer.payload.kind !== "trustlink.handshake.offer") {
    throw new Error("Unsupported handshake offer");
  }
  if (offer.payload.toDeviceId !== local.id) {
    throw new Error("Handshake offer targets another device");
  }
  assertFresh(offer.payload.createdAt, options, "Handshake offer");
  if (offer.payload.cryptoSuite !== crypto.suite) {
    throw new Error("Handshake offer crypto suite mismatch");
  }

  const peerRecord = trustStore.requireTrusted(offer.payload.from.id);
  if (!(await verifyPublicIdentity(crypto, offer.payload.from))) {
    throw new Error("Handshake offer identity is invalid");
  }
  if (peerRecord.peer.publicKey !== offer.payload.from.publicKey) {
    throw new Error("Handshake public key mismatch for trust record");
  }
  if (!(await verifySignedPayload(crypto, peerRecord.peer.publicKey, offer))) {
    throw new Error("Handshake offer signature is invalid");
  }
  selectSharedCapability(offer.payload.capabilities, options.capabilities);
}

async function buildSession(
  crypto: TrustLinkCrypto,
  localDeviceId: string,
  peerDeviceId: string,
  sharedSecret: Uint8Array,
  offer: SignedHandshake<HandshakeOfferPayload>,
  answer: SignedHandshake<HandshakeAnswerPayload>,
  capability: string,
  maxPlaintextBytes: number
): Promise<SecureSession> {
  const transcriptHash = await hashSigned(crypto, {
    payload: { offer, answer, capability, cryptoSuite: crypto.suite },
    signature: "transcript",
    algorithm: "none"
  });
  const sessionId = `ses_${transcriptHash.slice(0, 32)}`;
  const material = await deriveDirectionalMaterial(crypto, sharedSecret, localDeviceId, peerDeviceId, transcriptHash);

  return new SecureSession(
    crypto,
    sessionId,
    localDeviceId,
    peerDeviceId,
    new Date().toISOString(),
    transcriptHash,
    material.sendKey,
    material.receiveKey,
    material.sendNonceSeed,
    material.receiveNonceSeed,
    capability,
    maxPlaintextBytes
  );
}

async function deriveDirectionalMaterial(
  crypto: TrustLinkCrypto,
  sharedSecret: Uint8Array,
  localDeviceId: string,
  peerDeviceId: string,
  transcriptHash: string
): Promise<DirectionalMaterial> {
  const [firstId, secondId] = [localDeviceId, peerDeviceId].sort();
  const material = await crypto.hkdf(
    sharedSecret,
    utf8(`trustlink:v1:session:${transcriptHash}`),
    utf8(`directions:${firstId}:${secondId}:${crypto.suite}`),
    88
  );
  const firstToSecondKey = material.slice(0, 32);
  const secondToFirstKey = material.slice(32, 64);
  const firstToSecondNonceSeed = material.slice(64, 76);
  const secondToFirstNonceSeed = material.slice(76, 88);
  return localDeviceId === firstId
    ? {
        sendKey: firstToSecondKey,
        receiveKey: secondToFirstKey,
        sendNonceSeed: firstToSecondNonceSeed,
        receiveNonceSeed: secondToFirstNonceSeed
      }
    : {
        sendKey: secondToFirstKey,
        receiveKey: firstToSecondKey,
        sendNonceSeed: secondToFirstNonceSeed,
        receiveNonceSeed: firstToSecondNonceSeed
      };
}

function normalizeHandshakeOptions(input: readonly string[] | HandshakeOptions = {}): NormalizedHandshakeOptions {
  const options: HandshakeOptions = Array.isArray(input)
    ? { capabilities: input as readonly string[] }
    : input as HandshakeOptions;
  const ttlMs = options.ttlMs ?? defaultHandshakeTtlMs;
  const maxPlaintextBytes = options.maxPlaintextBytes ?? defaultMaxPlaintextBytes;

  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new Error("Handshake ttlMs must be a safe positive integer");
  }
  if (!Number.isSafeInteger(maxPlaintextBytes) || maxPlaintextBytes <= 0) {
    throw new Error("maxPlaintextBytes must be a safe positive integer");
  }

  return {
    capabilities: normalizeCapabilities(options.capabilities),
    ttlMs,
    now: options.now ?? Date.now,
    maxPlaintextBytes
  };
}

function normalizeCapabilities(capabilities: readonly string[] = [trustLinkStreamCapability]): readonly string[] {
  const normalized = [...new Set(capabilities.map((capability) => capability.trim()).filter(Boolean))].sort();
  if (normalized.length === 0) {
    throw new Error("At least one capability is required");
  }
  return normalized;
}

function selectSharedCapability(left: readonly string[], right: readonly string[]): string {
  const rightSet = new Set(right);
  const capability = normalizeCapabilities(left).find((item) => rightSet.has(item));
  if (!capability) {
    throw new Error("No shared handshake capability");
  }
  return capability;
}

function assertFresh(createdAt: string, options: NormalizedHandshakeOptions, label: string): void {
  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) {
    throw new Error(`${label} timestamp is invalid`);
  }
  const ageMs = Math.abs(options.now() - createdAtMs);
  if (ageMs > options.ttlMs) {
    throw new Error(`${label} timestamp is outside the allowed window`);
  }
}

function nonceForSeq(seed: Uint8Array, seq: number): Uint8Array {
  if (seed.length !== 12) {
    throw new Error("Session nonce seed must be 12 bytes");
  }
  if (!Number.isSafeInteger(seq) || seq <= 0) {
    throw new Error("Session seq must be a safe positive integer");
  }

  const nonce = copyBytes(seed);
  let value = BigInt(seq);
  for (let index = 11; index >= 4; index -= 1) {
    nonce[index] = (nonce[index] ?? 0) ^ Number(value & 0xffn);
    value >>= 8n;
  }
  return nonce;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
}

function copyBytes(value: Uint8Array): Uint8Array {
  return new Uint8Array(value);
}

async function hashSigned(crypto: TrustLinkCrypto, value: SignedHandshake<unknown>): Promise<string> {
  return toBase64Url(await crypto.hash(utf8(stableJson(value))));
}
