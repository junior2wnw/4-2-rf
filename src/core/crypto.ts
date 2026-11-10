export interface TrustLinkKeyPair {
  readonly publicKey: string;
  readonly privateKey: string;
  readonly algorithm: string;
}

export interface SealedBytes {
  readonly ciphertext: Uint8Array;
  readonly tag: Uint8Array;
}

export interface TrustLinkCrypto {
  readonly id: string;
  readonly suite: string;
  randomBytes(length: number): Uint8Array;
  hash(data: Uint8Array): Promise<Uint8Array>;
  generateSigningKeyPair(): Promise<TrustLinkKeyPair>;
  generateAgreementKeyPair(): Promise<TrustLinkKeyPair>;
  sign(privateKey: string, data: Uint8Array): Promise<Uint8Array>;
  verify(publicKey: string, data: Uint8Array, signature: Uint8Array): Promise<boolean>;
  sharedSecret(privateKey: string, publicKey: string): Promise<Uint8Array>;
  hkdf(secret: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array>;
  seal(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Promise<SealedBytes>;
  open(key: Uint8Array, nonce: Uint8Array, sealed: SealedBytes, aad: Uint8Array): Promise<Uint8Array>;
}
