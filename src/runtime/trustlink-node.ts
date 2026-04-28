import { createDeviceIdentity, DeviceIdentity, PublicDeviceIdentity, toPublicIdentity } from "../core/identity.js";
import { AuditLog } from "../core/audit.js";
import { RecoveryEngine } from "../core/recovery.js";
import { TrustStore } from "../core/trust.js";
import { establishTrustedSession, SecureSession } from "../core/session.js";
import { demoPathCandidates, rankPathCandidates, RankedPath } from "../core/path.js";

export interface PairWithOptions {
  readonly permissionsForPeer: readonly string[];
  readonly permissionsFromPeer: readonly string[];
  readonly approvedBy: string;
}

export class TrustLinkNode {
  readonly identity: DeviceIdentity;
  readonly trustStore = TrustStore.empty();
  readonly audit = new AuditLog();
  private readonly recovery = new Map<string, RecoveryEngine>();

  constructor(label: string) {
    this.identity = createDeviceIdentity(label);
  }

  publicIdentity(): PublicDeviceIdentity {
    return toPublicIdentity(this.identity);
  }

  pairWith(peer: TrustLinkNode, options: PairWithOptions): void {
    this.trustStore.addTrustedPeer(peer.publicIdentity(), options.permissionsForPeer, {
      accepted: true,
      approvedBy: options.approvedBy
    });
    peer.trustStore.addTrustedPeer(this.publicIdentity(), options.permissionsFromPeer, {
      accepted: true,
      approvedBy: `${peer.identity.label}:local-user`
    });

    this.audit.record({
      type: "peer.paired",
      peerId: peer.identity.id,
      message: `Paired with ${peer.identity.label}`,
      meta: { permissionCount: options.permissionsForPeer.length }
    });
    peer.audit.record({
      type: "peer.paired",
      peerId: this.identity.id,
      message: `Paired with ${this.identity.label}`,
      meta: { permissionCount: options.permissionsFromPeer.length }
    });
  }

  connectTo(peer: TrustLinkNode): { localSession: SecureSession; peerSession: SecureSession; selectedPath: RankedPath } {
    const ranked = rankPathCandidates(demoPathCandidates(peer.identity.id));
    const selectedPath = ranked[0];
    if (!selectedPath) {
      throw new Error("No path available");
    }

    const { initiatorSession, responderSession } = establishTrustedSession(
      this.identity,
      this.trustStore,
      peer.identity,
      peer.trustStore
    );

    this.recoveryFor(peer.identity.id).connected();
    peer.recoveryFor(this.identity.id).connected();
    this.audit.record({
      type: "path.selected",
      peerId: peer.identity.id,
      message: `Selected ${selectedPath.kind}`,
      meta: { latencyMs: selectedPath.latencyMs, forwarded: selectedPath.forwarded }
    });
    this.audit.record({
      type: "peer.connected",
      peerId: peer.identity.id,
      message: `Connected to ${peer.identity.label}`
    });
    peer.audit.record({
      type: "peer.connected",
      peerId: this.identity.id,
      message: `Connected to ${this.identity.label}`
    });

    return {
      localSession: initiatorSession,
      peerSession: responderSession,
      selectedPath
    };
  }

  disconnectFrom(peer: TrustLinkNode): void {
    const localRecovery = this.recoveryFor(peer.identity.id).disconnected();
    const peerRecovery = peer.recoveryFor(this.identity.id).disconnected();
    this.audit.record({
      type: "peer.disconnected",
      peerId: peer.identity.id,
      message: `Disconnected from ${peer.identity.label}`,
      meta: { attempts: localRecovery.attempts }
    });
    peer.audit.record({
      type: "recovery.changed",
      peerId: this.identity.id,
      message: `Recovery actions updated`,
      meta: { attempts: peerRecovery.attempts }
    });
  }

  revoke(peer: TrustLinkNode, note = "user revoked trust"): void {
    this.trustStore.revoke(peer.identity.id, note);
    this.recoveryFor(peer.identity.id).revoked();
    this.audit.record({
      type: "peer.revoked",
      peerId: peer.identity.id,
      message: `Revoked ${peer.identity.label}`
    });
  }

  recoveryFor(peerId: string): RecoveryEngine {
    const existing = this.recovery.get(peerId);
    if (existing) {
      return existing;
    }
    const created = new RecoveryEngine(peerId);
    this.recovery.set(peerId, created);
    return created;
  }
}
