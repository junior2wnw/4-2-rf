export type TransportKind =
  | "lan_quic"
  | "internet_quic"
  | "webrtc_datachannel"
  | "https_stream"
  | "relay";

export interface PathCandidate {
  readonly id: string;
  readonly kind: TransportKind;
  readonly endpoint: string;
  readonly latencyMs: number;
  readonly lossPct: number;
  readonly estimatedBandwidthMbps: number;
  readonly metered: boolean;
  readonly relay: boolean;
  readonly local: boolean;
  readonly batteryCost: "low" | "medium" | "high";
  readonly policyAllowed: boolean;
}

export interface PathPolicy {
  readonly allowRelay: boolean;
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
  allowRelay: true,
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
    .filter((candidate) => policy.allowRelay || !candidate.relay)
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
    reasons.push("local-first");
  }

  if (candidate.relay) {
    score -= 14;
    reasons.push("relay fallback");
  }

  if (candidate.metered) {
    score -= 8;
    reasons.push("metered network");
  }

  if (candidate.kind === "https_stream") {
    score += 5;
    reasons.push("policy-friendly tcp/443 fallback");
  }

  if (candidate.kind === "internet_quic" || candidate.kind === "lan_quic") {
    score += 8;
    reasons.push("low-latency quic");
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
      kind: "lan_quic",
      endpoint: "udp://192.168.1.42:4433",
      latencyMs: 7,
      lossPct: 0.1,
      estimatedBandwidthMbps: 240,
      metered: false,
      relay: false,
      local: true,
      batteryCost: "low",
      policyAllowed: true
    },
    {
      id: `${peerId}:https`,
      kind: "https_stream",
      endpoint: "https://edge.example.invalid/link",
      latencyMs: 88,
      lossPct: 0.3,
      estimatedBandwidthMbps: 18,
      metered: false,
      relay: false,
      local: false,
      batteryCost: "medium",
      policyAllowed: true
    },
    {
      id: `${peerId}:relay`,
      kind: "relay",
      endpoint: "https://relay.example.invalid/frames",
      latencyMs: 132,
      lossPct: 0.5,
      estimatedBandwidthMbps: 10,
      metered: false,
      relay: true,
      local: false,
      batteryCost: "medium",
      policyAllowed: true
    }
  ];
}
