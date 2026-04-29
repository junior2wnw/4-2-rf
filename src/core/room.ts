import { TrustLinkCrypto } from "./crypto.js";
import { nowIso, randomBytes, readUtf8, toBase64Url, utf8, fromBase64Url } from "../utils/encoding.js";

export interface TrustLinkRoom {
  readonly id: string;
  readonly secret: string;
  readonly label: string;
  readonly createdAt: string;
}

export interface TrustLinkRoomInput {
  readonly id: string;
  readonly secret: string;
}

export interface CreateTrustLinkRoomOptions {
  readonly label?: string;
  readonly idByteLength?: number;
  readonly secretByteLength?: number;
  readonly now?: string;
}

export interface TrustLinkJoinCode {
  readonly roomId: string;
  readonly label: string;
}

export interface RoomAuthOptions {
  readonly namespace?: string;
}

export interface CleanTrustLabelOptions {
  readonly fallback?: string;
  readonly maxLength?: number;
}

export function createTrustLinkRoom(options: CreateTrustLinkRoomOptions = {}): TrustLinkRoom {
  const now = options.now ?? nowIso();
  return {
    id: toBase64Url(randomBytes(options.idByteLength ?? 24)),
    secret: toBase64Url(randomBytes(options.secretByteLength ?? 32)),
    label: cleanTrustLabel(options.label ?? ""),
    createdAt: now
  };
}

export function cleanTrustLabel(value: string, options: CleanTrustLabelOptions = {}): string {
  const fallback = options.fallback ?? ".";
  const maxLength = options.maxLength ?? 32;
  return value.trim().replace(/\s+/gu, " ").slice(0, maxLength) || fallback;
}

export function createCompactJoinCode(roomId: string, label: string): string {
  if (!roomId.trim()) {
    throw new Error("Room id is required");
  }
  return `${roomId}.${toBase64Url(utf8(cleanTrustLabel(label)))}`;
}

export function parseCompactJoinCode(value: string): TrustLinkJoinCode {
  const [roomId, encodedLabel] = value.split(".");
  if (!roomId || !encodedLabel) {
    throw new Error("Compact join code must include room id and label");
  }
  return {
    roomId,
    label: readUtf8(fromBase64Url(encodedLabel))
  };
}

export function roomAuthMaterial(room: TrustLinkRoomInput, options: RoomAuthOptions = {}): Uint8Array {
  if (!room.id.trim() || !room.secret.trim()) {
    throw new Error("Room id and secret are required");
  }
  return utf8(`${options.namespace ?? "trustlink.room-auth.v1"}:${room.id}:${room.secret}`);
}

export async function createRoomAuth(
  crypto: Pick<TrustLinkCrypto, "hash">,
  room: TrustLinkRoomInput,
  options: RoomAuthOptions = {}
): Promise<string> {
  return toBase64Url(await crypto.hash(roomAuthMaterial(room, options)));
}
