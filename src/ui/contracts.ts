export interface UiDeviceSummary {
  readonly id: string;
  readonly label: string;
  readonly fingerprint: string;
}

export interface UiPeerSummary extends UiDeviceSummary {
  readonly state: "trusted" | "revoked";
  readonly permissions: readonly string[];
}

export interface UiConnectionSummary {
  readonly peerId: string;
  readonly state: string;
  readonly transport?: string;
  readonly latencyMs?: number;
}

export interface UiState {
  readonly device: UiDeviceSummary;
  readonly peers: readonly UiPeerSummary[];
  readonly connections: readonly UiConnectionSummary[];
}

export type UiEvent =
  | { readonly type: "state.changed"; readonly state: UiState }
  | { readonly type: "pairing.invite.created"; readonly inviteUrl: string; readonly expiresAt: string }
  | { readonly type: "pairing.requested"; readonly peer: UiDeviceSummary; readonly requestedPermissions: readonly string[] }
  | { readonly type: "peer.connected"; readonly peerId: string }
  | { readonly type: "peer.disconnected"; readonly peerId: string }
  | { readonly type: "transfer.progress"; readonly transferId: string; readonly sentBytes: number; readonly totalBytes: number }
  | { readonly type: "notice"; readonly level: "info" | "success" | "warning"; readonly message: string };

export type UiCommand =
  | { readonly type: "pairing.createInvite"; readonly requestedPermissions: readonly string[]; readonly offeredPermissions: readonly string[] }
  | { readonly type: "pairing.accept"; readonly inviteUrl: string }
  | { readonly type: "peer.revoke"; readonly peerId: string }
  | { readonly type: "message.send"; readonly peerId: string; readonly text: string }
  | { readonly type: "file.send"; readonly peerId: string; readonly path: string };

export interface UiAdapter {
  readonly id: string;
  mount(api: UiApi): void | Promise<void>;
}

export interface UiApi {
  getState(): UiState;
  dispatch(command: UiCommand): Promise<void>;
  subscribe(listener: (event: UiEvent) => void): () => void;
}
