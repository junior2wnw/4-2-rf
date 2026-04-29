export type TransportId = string;
export type PathTrait = string;

export interface PathCandidate {
  readonly id: string;
  readonly kind: TransportId;
  readonly endpoint: string;
  readonly traits?: readonly PathTrait[];
  readonly latencyMs: number;
  readonly lossPct: number;
  readonly estimatedBandwidthMbps: number;
  readonly metered: boolean;
  readonly forwarded: boolean;
  readonly local: boolean;
  readonly batteryCost: "low" | "medium" | "high";
  readonly policyAllowed: boolean;
}

export interface PathPolicy {
  readonly allowForwarded: boolean;
  readonly allowMetered: boolean;
  readonly preferLocal: boolean;
  readonly maxLossPct: number;
  readonly minBandwidthMbps: number;
}

export interface RankedPath extends PathCandidate {
  readonly score: number;
  readonly reasons: readonly string[];
}

export const defaultPathPolicy: PathPolicy = {
  allowForwarded: true,
  allowMetered: true,
  preferLocal: true,
  maxLossPct: 12,
  minBandwidthMbps: 0.25
};

export function rankPathCandidates(
  candidates: readonly PathCandidate[],
  policy: PathPolicy = defaultPathPolicy
): RankedPath[] {
  return candidates
    .filter((candidate) => candidate.policyAllowed)
    .filter((candidate) => policy.allowForwarded || !candidate.forwarded)
    .filter((candidate) => policy.allowMetered || !candidate.metered)
    .filter((candidate) => candidate.lossPct <= policy.maxLossPct)
    .filter((candidate) => candidate.estimatedBandwidthMbps >= policy.minBandwidthMbps)
    .map((candidate) => scorePath(candidate, policy))
    .sort((a, b) => b.score - a.score);
}

function scorePath(candidate: PathCandidate, policy: PathPolicy): RankedPath {
  const reasons: string[] = [];
  let score = 100;

  score -= Math.min(candidate.latencyMs / 4, 45);
  score -= candidate.lossPct * 3;
  score += Math.min(candidate.estimatedBandwidthMbps, 100) / 5;

  if (candidate.local && policy.preferLocal) {
    score += 18;
    reasons.push("local path");
  }

  if (candidate.forwarded) {
    score -= 14;
    reasons.push("forwarded path");
  }

  if (candidate.metered) {
    score -= 8;
    reasons.push("metered network");
  }

  if (candidate.traits?.includes("low-latency")) {
    score += 8;
    reasons.push("low latency");
  }

  if (candidate.traits?.includes("stable")) {
    score += 5;
    reasons.push("stable path");
  }

  if (candidate.batteryCost === "high") {
    score -= 10;
  } else if (candidate.batteryCost === "low") {
    score += 4;
  }

  return {
    ...candidate,
    score: Math.round(score * 100) / 100,
    reasons
  };
}

export function demoPathCandidates(peerId: string): PathCandidate[] {
  return [
    {
      id: `${peerId}:lan`,
      kind: "local.low-latency",
      endpoint: "local://192.168.1.42",
      traits: ["low-latency", "stable"],
      latencyMs: 7,
      lossPct: 0.1,
      estimatedBandwidthMbps: 240,
      metered: false,
      forwarded: false,
      local: true,
      batteryCost: "low",
      policyAllowed: true
    },
    {
      id: `${peerId}:edge`,
      kind: "edge.standard",
      endpoint: "edge://link",
      traits: ["stable"],
      latencyMs: 88,
      lossPct: 0.3,
      estimatedBandwidthMbps: 18,
      metered: false,
      forwarded: false,
      local: false,
      batteryCost: "medium",
      policyAllowed: true
    },
    {
      id: `${peerId}:forwarder`,
      kind: "forwarder.standard",
      endpoint: "forward://frames",
      latencyMs: 132,
      lossPct: 0.5,
      estimatedBandwidthMbps: 10,
      metered: false,
      forwarded: true,
      local: false,
      batteryCost: "medium",
      policyAllowed: true
    }
  ];
}
