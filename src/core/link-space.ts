import { PublicDeviceIdentity } from "./identity.js";
import { nowIso, randomId } from "../utils/encoding.js";

export type LinkSpaceMemberState = "active" | "paused" | "removed";
export type LinkSpacePairState = "ready" | "paused" | "closed";

export interface LinkSpaceMember {
  readonly device: PublicDeviceIdentity;
  readonly permissions: readonly string[];
  readonly state: LinkSpaceMemberState;
  readonly joinedAt: string;
  readonly updatedAt: string;
}

export interface LinkSpacePair {
  readonly id: string;
  readonly leftDeviceId: string;
  readonly rightDeviceId: string;
  readonly state: LinkSpacePairState;
  readonly permissions: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LinkSpaceSnapshot {
  readonly id: string;
  readonly label: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly members: readonly LinkSpaceMember[];
  readonly pairs: readonly LinkSpacePair[];
}

export class LinkSpace {
  private version = 1;
  private updatedAt: string;
  private readonly members = new Map<string, LinkSpaceMember>();
  private readonly pairs = new Map<string, LinkSpacePair>();

  private constructor(
    readonly id: string,
    readonly label: string,
    readonly createdAt: string
  ) {
    this.updatedAt = createdAt;
  }

  static create(
    label: string,
    firstMember: PublicDeviceIdentity,
    permissions: readonly string[] = []
  ): LinkSpace {
    const now = nowIso();
    const space = new LinkSpace(randomId("space"), label, now);
    space.members.set(firstMember.id, {
      device: firstMember,
      permissions: [...permissions].sort(),
      state: "active",
      joinedAt: now,
      updatedAt: now
    });
    return space;
  }

  addMember(device: PublicDeviceIdentity, permissions: readonly string[] = []): LinkSpaceSnapshot {
    const now = nowIso();
    const member: LinkSpaceMember = {
      device,
      permissions: [...permissions].sort(),
      state: "active",
      joinedAt: this.members.get(device.id)?.joinedAt ?? now,
      updatedAt: now
    };

    for (const existing of this.activeMembers()) {
      if (existing.device.id !== device.id) {
        this.pairs.set(pairKey(existing.device.id, device.id), {
          id: randomId("pair"),
          leftDeviceId: minId(existing.device.id, device.id),
          rightDeviceId: maxId(existing.device.id, device.id),
          state: "ready",
          permissions: mergePermissions(existing.permissions, permissions),
          createdAt: now,
          updatedAt: now
        });
      }
    }

    this.members.set(device.id, member);
    return this.touch();
  }

  pauseMember(deviceId: string): LinkSpaceSnapshot {
    const member = this.requireMember(deviceId);
    const now = nowIso();
    this.members.set(deviceId, { ...member, state: "paused", updatedAt: now });
    for (const pair of this.pairs.values()) {
      if (pair.leftDeviceId === deviceId || pair.rightDeviceId === deviceId) {
        this.pairs.set(pairKey(pair.leftDeviceId, pair.rightDeviceId), {
          ...pair,
          state: "paused",
          updatedAt: now
        });
      }
    }
    return this.touch();
  }

  removeMember(deviceId: string): LinkSpaceSnapshot {
    const member = this.requireMember(deviceId);
    const now = nowIso();
    this.members.set(deviceId, { ...member, state: "removed", updatedAt: now });
    for (const pair of this.pairs.values()) {
      if (pair.leftDeviceId === deviceId || pair.rightDeviceId === deviceId) {
        this.pairs.set(pairKey(pair.leftDeviceId, pair.rightDeviceId), {
          ...pair,
          state: "closed",
          updatedAt: now
        });
      }
    }
    return this.touch();
  }

  pairBetween(leftDeviceId: string, rightDeviceId: string): LinkSpacePair {
    const pair = this.pairs.get(pairKey(leftDeviceId, rightDeviceId));
    if (!pair) {
      throw new Error(`Link pair missing: ${leftDeviceId}:${rightDeviceId}`);
    }
    return pair;
  }

  snapshot(): LinkSpaceSnapshot {
    return {
      id: this.id,
      label: this.label,
      version: this.version,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      members: [...this.members.values()].sort((a, b) => a.device.label.localeCompare(b.device.label)),
      pairs: [...this.pairs.values()].sort((a, b) => a.leftDeviceId.localeCompare(b.leftDeviceId))
    };
  }

  private activeMembers(): LinkSpaceMember[] {
    return [...this.members.values()].filter((member) => member.state === "active");
  }

  private requireMember(deviceId: string): LinkSpaceMember {
    const member = this.members.get(deviceId);
    if (!member) {
      throw new Error(`Link space member missing: ${deviceId}`);
    }
    return member;
  }

  private touch(): LinkSpaceSnapshot {
    this.version += 1;
    this.updatedAt = nowIso();
    return this.snapshot();
  }
}

function pairKey(leftDeviceId: string, rightDeviceId: string): string {
  return [leftDeviceId, rightDeviceId].sort().join(":");
}

function minId(leftDeviceId: string, rightDeviceId: string): string {
  return [leftDeviceId, rightDeviceId].sort()[0] ?? leftDeviceId;
}

function maxId(leftDeviceId: string, rightDeviceId: string): string {
  return [leftDeviceId, rightDeviceId].sort()[1] ?? rightDeviceId;
}

function mergePermissions(left: readonly string[], right: readonly string[]): string[] {
  return [...new Set([...left, ...right])].sort();
}
