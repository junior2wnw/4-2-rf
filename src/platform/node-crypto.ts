import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes as nodeRandomBytes,
  sign,
  verify
} from "node:crypto";
import { SealedBytes, TrustLinkCrypto, TrustLinkKeyPair } from "../core/crypto.js";

export class NodeTrustLinkCrypto implements TrustLinkCrypto {
  readonly id = "trustlink.crypto.node";
  readonly suite = "ed25519+x25519+hkdf-sha256+chacha20-poly1305";

  randomBytes(length: number): Uint8Array {
    return new Uint8Array(nodeRandomBytes(length));
  }

  async hash(data: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(createHash("sha256").update(data).digest());
  }

  async generateSigningKeyPair(): Promise<TrustLinkKeyPair> {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" }
    });
    return {
      publicKey: publicKey.toString(),
      privateKey: privateKey.toString(),
      algorithm: "Ed25519"
    };
  }

  async generateAgreementKeyPair(): Promise<TrustLinkKeyPair> {
    const { publicKey, privateKey } = generateKeyPairSync("x25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" }
    });
    return {
      publicKey: publicKey.toString(),
      privateKey: privateKey.toString(),
      algorithm: "X25519"
    };
  }

  async sign(privateKey: string, data: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(sign(null, Buffer.from(data), createPrivateKey(privateKey)));
  }

  async verify(publicKey: string, data: Uint8Array, signature: Uint8Array): Promise<boolean> {
    return verify(null, Buffer.from(data), createPublicKey(publicKey), Buffer.from(signature));
  }

  async sharedSecret(privateKey: string, publicKey: string): Promise<Uint8Array> {
    return new Uint8Array(diffieHellman({
      privateKey: createPrivateKey(privateKey),
      publicKey: createPublicKey(publicKey)
    }));
  }

  async hkdf(secret: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
    return new Uint8Array(Buffer.from(hkdfSync(
      "sha256",
      Buffer.from(secret),
      Buffer.from(salt),
      Buffer.from(info),
      length
    )));
  }

  async seal(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Promise<SealedBytes> {
    const cipher = createCipheriv("chacha20-poly1305", Buffer.from(key), Buffer.from(nonce), {
      authTagLength: 16
    });
    cipher.setAAD(Buffer.from(aad), { plaintextLength: plaintext.length });
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(plaintext)),
      cipher.final()
    ]);
    return {
      ciphertext: new Uint8Array(ciphertext),
      tag: new Uint8Array(cipher.getAuthTag())
    };
  }

  async open(key: Uint8Array, nonce: Uint8Array, sealed: SealedBytes, aad: Uint8Array): Promise<Uint8Array> {
    const decipher = createDecipheriv("chacha20-poly1305", Buffer.from(key), Buffer.from(nonce), {
      authTagLength: 16
    });
    decipher.setAAD(Buffer.from(aad), { plaintextLength: sealed.ciphertext.length });
    decipher.setAuthTag(Buffer.from(sealed.tag));
    return new Uint8Array(Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext)),
      decipher.final()
    ]));
  }
}
